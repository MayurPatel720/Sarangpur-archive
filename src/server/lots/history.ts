import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import {
  OBJECT_FIELDS,
  TRACKED_FIELDS,
  changedPaths,
  normalize,
  sameImage,
  valueAt,
  type ItemImage,
  type LotState,
} from '@/lib/item-history';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotChangeRow, LotChangeSet, LotVersion } from '@/models/LotChangeSet';
import { LotItem } from '@/models/LotItem';
import { withAudit, auditActor } from '@/server/audit';
import { gridLocked, syncLotStage } from '@/server/lots/item-grid';
import { autoVersion, latestSeq, lotStateOf, snapshotItems, tracked } from '@/server/lots/history-core';
import type {
  HistoryActionBody,
  HistoryActionResponse,
  HistoryChange,
  HistoryChangeDetail,
  HistoryConflict,
  HistoryItemResponse,
  HistoryListResponse,
  HistoryPreview,
} from '@/types/history';

/**
 * Undo, redo, restore and the History reads. The recording side is `history-core.ts`; the idea is in
 * src/lib/item-history.ts: a change set holds a before and an after image of every row it touched, and
 * reversing it writes the images back — so every kind of change comes back exactly, and a row that
 * somebody changed since is reported as a conflict instead of being overwritten.
 */

type Plan = { item: Types.ObjectId; code: string | null; target: ItemImage | null; /** undefined = do not check */ expect?: ItemImage | null }[];
type LotTarget = { expect: LotState | null; target: LotState } | null;

const SHOW_CHANGES = 200;

/* --------------------------------------------------------------- display helpers */

/** A short, readable form of a stored value for the History lists. */
function show(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    const o = v as { toHexString?: () => string };
    if (typeof o.toHexString === 'function') return String(v);
    return JSON.stringify(JSON.parse(normalize(v))).slice(0, 120);
  }
  return String(v).slice(0, 120);
}

function diffOf(before: ItemImage | null, after: ItemImage | null): HistoryChange['cells'] {
  if (!before && after) return [{ path: 'item', from: '—', to: 'added' }];
  if (before && !after) return [{ path: 'item', from: 'present', to: 'removed' }];
  return changedPaths(before, after).map((p) => ({ path: p, from: show(valueAt(before, p)), to: show(valueAt(after, p)) }));
}

/* --------------------------------------------------------------------- guards */

/** Work already done after a decision: reopening it would orphan that work. */
async function assertCanReopen(lotId: string, session?: ClientSession): Promise<void> {
  const worked = await LotItem.exists({
    lot: new Types.ObjectId(lotId),
    $or: [{ digitized: true }, { taggedInMls: true }, { dispositionStatus: 'done' }],
  }).session(session ?? null);
  if (worked) {
    throw new HttpError(
      409,
      'Work has already been done on this lot after the decision (items digitalized, tagged in MLS, or marked returned / discarded), so the decision cannot be reopened.',
    );
  }
}

const decisionStatus = (s: LotState | null) => (s?.decision as { status?: string } | null)?.status ?? 'pending';

/** The part of the lot state that says where the lot is (counters and timestamps move on their own). */
const core = (s: LotState | null) => (s ? { stage: s.stage, decision: s.decision, namingCode: s.namingCode, return: s.return, discard: s.discard } : null);

/* ----------------------------------------------------------------- the engine */

interface PlanRun {
  lotId: string;
  ctx: MutationContext;
  kind: 'undo' | 'restore';
  label: string;
  plan: Plan;
  lotTarget: LotTarget;
  undoOf?: Types.ObjectId[];
  redoable?: boolean;
  skipConflicts: boolean;
  checkpoint?: string;
}

/** What differs between the current rows and the ones the plan expects (rows somebody changed since). */
async function findConflicts(lotId: string, plan: Plan, session?: ClientSession): Promise<{ conflicts: HistoryConflict[]; current: Map<string, ItemImage> }> {
  const current = await snapshotItems(lotId, plan.map((p) => p.item), session);
  const conflicts: HistoryConflict[] = [];
  for (const p of plan) {
    if (p.expect === undefined) continue;
    const cur = current.get(String(p.item)) ?? null;
    if (sameImage(cur, p.expect)) continue;
    const paths = cur && p.expect ? changedPaths(p.expect, cur) : ['item'];
    conflicts.push({ itemId: String(p.item), code: ((cur ?? p.expect)?.code as string | undefined) ?? p.code, paths });
  }
  return { conflicts, current };
}

/** Writes the plan's target images, restores the lot-level state, and records the change set. */
async function runPlan(o: PlanRun): Promise<{ applied: number; conflicts: HistoryConflict[]; notes: string[] }> {
  await connectToDatabase();
  const notes: string[] = [];
  const lot0 = await ArchiveLot.findById(o.lotId).select('stage').lean();
  if (!lot0) throw new HttpError(404, 'Lot not found.');
  if (gridLocked(lot0.stage)) throw new HttpError(403, 'Finished lots are locked.');

  // The lot-level state first: reopening a decision has its own rules, and its reason is the one to show.
  const lotNow = await lotStateOf(o.lotId);
  let lotTarget = o.lotTarget;
  if (lotTarget) {
    const reopens = decisionStatus(lotNow) !== 'pending' && decisionStatus(lotTarget.target) === 'pending';
    const moved = lotTarget.expect !== null && normalize(core(lotNow)) !== normalize(core(lotTarget.expect));
    if (reopens) {
      if (moved) throw new HttpError(409, 'The lot has moved on since this decision (its stage or decision changed), so the decision cannot be reopened.');
      await assertCanReopen(o.lotId);
      notes.push('The decision was reopened.');
    } else if (moved) {
      notes.push('The lot has moved on since (its stage or decision changed), so only the rows were restored.');
      lotTarget = null;
    }
  }

  // Then the rows, outside the write, so a conflict comes back as a list instead of an error.
  const pre = await findConflicts(o.lotId, o.plan);
  if (pre.conflicts.length > 0 && !o.skipConflicts) return { applied: 0, conflicts: pre.conflicts, notes: [] };
  const skip = new Set(pre.conflicts.map((c) => c.itemId));
  const plan = o.plan.filter((p) => !skip.has(String(p.item)));

  const ids = plan.map((p) => p.item);
  await tracked({
    lotId: o.lotId,
    ctx: o.ctx,
    kind: o.kind,
    label: o.label,
    scope: ids,
    checkpoint: o.checkpoint,
    undoOf: o.undoOf,
    redoable: o.redoable,
    run: () =>
      withAudit({
        lotId: o.lotId,
        actor: auditActor(o.ctx),
        kind: 'items_updated',
        title: o.label,
        detail: lotTarget ? 'Includes the lot-level state (stage / decision).' : undefined,
        mutate: async (lot, session) => {
          if (gridLocked(lot.stage)) throw new HttpError(403, 'Finished lots are locked.');
          const { conflicts, current } = await findConflicts(o.lotId, plan, session);
          if (conflicts.length > 0) throw new HttpError(409, 'Another change landed while this was running. Try again.');

          const removals: Types.ObjectId[] = [];
          const ops: Parameters<typeof LotItem.bulkWrite>[0] = [];
          for (const p of plan) {
            const cur = current.get(String(p.item)) ?? null;
            if (p.target === null) {
              if (cur) removals.push(p.item);
              continue;
            }
            if (!cur) {
              try {
                await LotItem.create([{ ...p.target, _id: p.item, lot: lot._id }], { session });
              } catch (e) {
                if ((e as { code?: number }).code === 11000) {
                  throw new HttpError(409, `The code ${String(p.target.code)} is already used by another item, so ${String(p.target.code)} cannot be brought back.`);
                }
                throw e;
              }
              continue;
            }
            const $set: Record<string, unknown> = {};
            const $unset: Record<string, ''> = {};
            for (const f of TRACKED_FIELDS) {
              if (f in p.target) $set[f] = p.target[f];
              else if (f in cur) $unset[f] = '';
            }
            if (Object.keys($set).length || Object.keys($unset).length) {
              ops.push({
                updateOne: {
                  filter: { _id: p.item },
                  update: { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
                },
              });
            }
          }
          if (removals.length > 0) await LotItem.deleteMany({ _id: { $in: removals }, lot: lot._id }, { session });
          for (let i = 0; i < ops.length; i += 1000) await LotItem.bulkWrite(ops.slice(i, i + 1000), { session });

          if (lotTarget) {
            const t = lotTarget.target;
            lot.stage = t.stage as typeof lot.stage;
            lot.set('decision', t.decision);
            lot.set('namingCode', t.namingCode ?? undefined);
            lot.set('return', t.return);
            lot.set('discard', t.discard);
          }
          const [expected, found] = await Promise.all([
            LotItem.countDocuments({ lot: lot._id, selectedForDigitization: true }).session(session),
            LotItem.countDocuments({ lot: lot._id, selectedForDigitization: true, digitized: true }).session(session),
          ]);
          lot.set('digitization.expectedFileCount', expected);
          lot.set('digitization.foundFileCount', found);
          return null;
        },
      }).then(async () => {
        // The stage follows the Excel again (capture / MLS), for a lot that is archived.
        await syncLotStage(o.lotId, o.ctx);
      }),
  });
  return { applied: plan.length, conflicts: pre.conflicts, notes };
}

/* ------------------------------------------------------------- undo / redo */

async function planOf(changeSets: Types.ObjectId[]): Promise<Plan> {
  const rows = await LotChangeRow.find({ changeSet: { $in: changeSets } }).sort({ seq: 1 }).lean();
  // Several change sets (an undo of a whole session): the item goes back to the first "before" and is
  // expected to still hold the last "after".
  const first = new Map<string, (typeof rows)[number]>();
  const last = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = String(r.item);
    if (!first.has(k)) first.set(k, r);
    last.set(k, r);
  }
  return [...first.entries()].map(([k, f]) => ({
    item: f.item,
    code: ((last.get(k)!.after ?? f.before) as ItemImage | null)?.code as string | null ?? f.code ?? null,
    target: (f.before as ItemImage | null) ?? null,
    expect: (last.get(k)!.after as ItemImage | null) ?? null,
  }));
}

async function loadSets(lotId: string, ids: Types.ObjectId[]) {
  const sets = await LotChangeSet.find({ lot: new Types.ObjectId(lotId), _id: { $in: ids } }).sort({ seq: 1 }).lean();
  if (sets.length !== ids.length) throw new HttpError(404, 'That change was not found on this lot.');
  return sets;
}

async function finishUndo(sets: Awaited<ReturnType<typeof loadSets>>, ctx: MutationContext): Promise<void> {
  const now = new Date();
  await LotChangeSet.updateMany({ _id: { $in: sets.map((s) => s._id) } }, { $set: { undoneAt: now, undoneByName: ctx.userName } });
  // Undoing an undo (a redo) puts the original change back in force.
  const back = sets.flatMap((s) => s.undoOf ?? []);
  if (back.length > 0) await LotChangeSet.updateMany({ _id: { $in: back } }, { $set: { undoneAt: null, undoneByName: null } });
}

/** Reverses change sets (one, or a whole session). `redo` only changes the wording. */
async function reverse(lotId: string, ids: Types.ObjectId[], ctx: MutationContext, o: { skipConflicts: boolean; label: string }): Promise<HistoryActionResponse> {
  await connectToDatabase();
  const sets = await loadSets(lotId, ids);
  if (sets.some((s) => s.undoneAt)) throw new HttpError(409, 'That change has already been undone.');
  const plan = await planOf(ids);
  const first = sets[0]!;
  const last = sets[sets.length - 1]!;
  const lotTarget: LotTarget =
    first.lotBefore && last.lotAfter && normalize(first.lotBefore) !== normalize(last.lotAfter)
      ? { expect: last.lotAfter as LotState, target: first.lotBefore as LotState }
      : null;
  // A redo (reversing an undo) cannot itself be redone: the original change is back in force.
  const isRedo = sets.some((s) => s.kind === 'undo');
  const res = await runPlan({ lotId, ctx, kind: 'undo', label: o.label, plan, lotTarget, undoOf: ids, redoable: !isRedo, skipConflicts: o.skipConflicts });
  if (res.applied > 0 || (res.conflicts.length === 0 && plan.length === 0)) await finishUndo(sets, ctx);
  return { done: res.conflicts.length === 0 || o.skipConflicts, applied: res.applied, conflicts: res.conflicts, notes: res.notes, label: o.label };
}

/** The change sets the toolbar's Undo / Redo would act on for this person. */
async function targets(lotId: string, ctx: MutationContext) {
  const lot = new Types.ObjectId(lotId);
  const me = new Types.ObjectId(ctx.userId);
  const undo = await LotChangeSet.findOne({ lot, actor: me, kind: { $nin: ['undo'] }, undoneAt: null }).sort({ seq: -1 }).lean();
  const redo = await LotChangeSet.findOne({ lot, actor: me, kind: 'undo', undoneAt: null, redoable: true }).sort({ seq: -1 }).lean();
  return { undo, redo };
}

export async function undoLast(lotId: string, ctx: MutationContext, skipConflicts = false): Promise<HistoryActionResponse> {
  const { undo } = await targets(lotId, ctx);
  if (!undo) throw new HttpError(404, 'Nothing to undo.');
  return reverse(lotId, [undo._id], ctx, { skipConflicts, label: `Undo: ${undo.label}` });
}

export async function undoOne(lotId: string, changeSetId: string, ctx: MutationContext, skipConflicts = false): Promise<HistoryActionResponse> {
  if (!Types.ObjectId.isValid(changeSetId)) throw new HttpError(404, 'That change was not found on this lot.');
  await connectToDatabase();
  const one = await LotChangeSet.findOne({ _id: changeSetId, lot: lotId }).lean();
  if (!one) throw new HttpError(404, 'That change was not found on this lot.');
  return reverse(lotId, [one._id], ctx, { skipConflicts, label: `Undo: ${one.label}` });
}

export async function redoLast(lotId: string, ctx: MutationContext, skipConflicts = false): Promise<HistoryActionResponse> {
  const { redo } = await targets(lotId, ctx);
  if (!redo) throw new HttpError(404, 'Nothing to redo.');
  return reverse(lotId, [redo._id], ctx, { skipConflicts, label: `Redo: ${redo.label.replace(/^(Undo|Undo session): /, '')}` });
}

export async function undoSession(lotId: string, sessionId: string, ctx: MutationContext, skipConflicts = false): Promise<HistoryActionResponse> {
  await connectToDatabase();
  const sets = await LotChangeSet.find({ lot: new Types.ObjectId(lotId), sessionId, kind: { $nin: ['undo'] }, undoneAt: null }).sort({ seq: 1 }).lean();
  if (sets.length === 0) throw new HttpError(404, 'Nothing left to undo in that session.');
  return reverse(lotId, sets.map((s) => s._id), ctx, { skipConflicts, label: `Undo session · ${sets.length} ${sets.length === 1 ? 'change' : 'changes'}` });
}

/* ------------------------------------------------------------------- restore */

async function resolveSeq(lotId: string, target: { seq?: number; versionId?: string }): Promise<{ seq: number; name: string }> {
  if (target.versionId) {
    if (!Types.ObjectId.isValid(target.versionId)) throw new HttpError(404, 'Version not found.');
    const v = await LotVersion.findOne({ _id: target.versionId, lot: lotId }).lean();
    if (!v) throw new HttpError(404, 'Version not found.');
    return { seq: v.seq, name: v.name };
  }
  if (target.seq === undefined) throw new HttpError(400, 'Choose a version or a point in history.');
  return { seq: target.seq, name: `before change ${target.seq + 1}` };
}

/** What the sheet looked like after change set `seq`: the "before" image of each row's first later change. */
async function planAt(lotId: string, seq: number): Promise<{ plan: Plan; lotTarget: LotTarget; latest: number }> {
  const lot = new Types.ObjectId(lotId);
  const rows = await LotChangeRow.find({ lot, seq: { $gt: seq } }).sort({ seq: 1 }).lean();
  const first = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!first.has(String(r.item))) first.set(String(r.item), r);
  const plan: Plan = [...first.values()].map((r) => ({ item: r.item, code: r.code ?? null, target: (r.before as ItemImage | null) ?? null }));
  const firstSet = await LotChangeSet.findOne({ lot, seq: { $gt: seq } }).sort({ seq: 1 }).select('lotBefore').lean();
  const now = await lotStateOf(lotId);
  const lotTarget: LotTarget =
    firstSet?.lotBefore && normalize(firstSet.lotBefore) !== normalize(now) ? { expect: null, target: firstSet.lotBefore as LotState } : null;
  return { plan, lotTarget, latest: await latestSeq(lotId) };
}

/** What restoring would change — shown before anything is written (also serves as "Compare"). */
export async function previewRestore(lotId: string, target: { seq?: number; versionId?: string }): Promise<HistoryPreview> {
  await connectToDatabase();
  const at = await resolveSeq(lotId, target);
  const { plan, lotTarget } = await planAt(lotId, at.seq);
  const current = await snapshotItems(lotId, plan.map((p) => p.item));
  const changes: HistoryChange[] = [];
  let cells = 0;
  for (const p of plan) {
    const cur = current.get(String(p.item)) ?? null;
    if (sameImage(cur, p.target)) continue;
    const d = diffOf(cur, p.target);
    cells += d.length;
    if (changes.length < SHOW_CHANGES) changes.push({ itemId: String(p.item), code: ((p.target ?? cur)?.code as string | undefined) ?? p.code, cells: d.slice(0, 12) });
  }
  const itemCount = plan.filter((p) => !sameImage(current.get(String(p.item)) ?? null, p.target)).length;
  const lot = await lotStateOf(lotId);
  return {
    name: at.name,
    seq: at.seq,
    itemCount,
    cellCount: cells,
    truncated: itemCount > changes.length,
    reopensDecision: Boolean(lotTarget) && decisionStatus(lot) !== 'pending' && decisionStatus(lotTarget!.target) === 'pending',
    changes,
  };
}

export async function restoreTo(lotId: string, target: { seq?: number; versionId?: string }, ctx: MutationContext): Promise<HistoryActionResponse> {
  await connectToDatabase();
  const at = await resolveSeq(lotId, target);
  const { plan, lotTarget } = await planAt(lotId, at.seq);
  const label = `Restored to ${at.name === `before change ${at.seq + 1}` ? at.name : `"${at.name}"`}`;
  const res = await runPlan({ lotId, ctx, kind: 'restore', label, plan, lotTarget, skipConflicts: true, checkpoint: 'Before restore' });
  return { done: true, applied: res.applied, conflicts: [], notes: res.notes, label };
}

/* --------------------------------------------------------------- versions */

export async function saveVersion(lotId: string, name: string, ctx: MutationContext): Promise<HistoryActionResponse> {
  await connectToDatabase();
  const lot = await ArchiveLot.findById(lotId).select('_id').lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  const clean = name.trim();
  if (!clean) throw new HttpError(400, 'Give the version a name.');
  await LotVersion.create({
    lot: lot._id,
    name: clean.slice(0, 120),
    seq: await latestSeq(lotId),
    at: new Date(),
    by: new Types.ObjectId(ctx.userId),
    byName: ctx.userName,
    auto: false,
  });
  return { done: true, applied: 0, conflicts: [], notes: [], label: `Saved version “${clean}”` };
}

/* ------------------------------------------------------------------ reads */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** History shows cell values, so it follows the same format access as the lot itself. */
export async function assertCanViewHistory(lotId: string, grants: readonly string[]): Promise<void> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const lot = await ArchiveLot.findById(lotId).select('format mediaLines.format').lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  const formats = new Set([lot.format, ...((lot.mediaLines ?? []) as { format: string }[]).map((l) => l.format)].filter(Boolean));
  for (const f of formats) {
    if (!grants.includes(`format:${f}`)) throw new HttpError(403, `Your role cannot open ${f} lots.`);
  }
}

export async function listHistory(lotId: string, ctx: MutationContext): Promise<HistoryListResponse> {
  await connectToDatabase();
  const lot = new Types.ObjectId(lotId);
  const [sets, versions, t, head] = await Promise.all([
    LotChangeSet.find({ lot }).sort({ seq: -1 }).limit(400).lean(),
    LotVersion.find({ lot }).sort({ at: -1 }).limit(100).lean(),
    targets(lotId, ctx),
    latestSeq(lotId),
  ]);
  const sessions: HistoryListResponse['sessions'] = [];
  const bySession = new Map<string, HistoryListResponse['sessions'][number]>();
  for (const s of sets) {
    let g = bySession.get(s.sessionId);
    if (!g) {
      g = { id: s.sessionId, actorName: s.actorName, from: iso(s.at)!, to: iso(s.at)!, itemCount: 0, cellCount: 0, undone: true, sets: [] };
      bySession.set(s.sessionId, g);
      sessions.push(g);
    }
    g.from = iso(s.at)!;
    g.itemCount += s.itemCount;
    g.cellCount += s.cellCount;
    if (!s.undoneAt && s.kind !== 'undo') g.undone = false;
    g.sets.push({ id: String(s._id), seq: s.seq, at: iso(s.at)!, kind: s.kind, label: s.label, itemCount: s.itemCount, cellCount: s.cellCount, undone: Boolean(s.undoneAt), actorName: s.actorName });
  }
  return {
    headSeq: head,
    sessions: sessions.slice(0, 60),
    versions: versions.map((v) => ({ id: String(v._id), name: v.name, seq: v.seq, at: iso(v.at)!, byName: v.byName ?? null, auto: v.auto })),
    canUndo: t.undo ? { id: String(t.undo._id), label: t.undo.label } : null,
    canRedo: t.redo ? { id: String(t.redo._id), label: t.redo.label.replace(/^(Undo|Undo session): /, '') } : null,
  };
}

/** The cells one change set touched. */
export async function changeDetail(lotId: string, changeSetId: string): Promise<HistoryChangeDetail> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(changeSetId)) throw new HttpError(404, 'That change was not found on this lot.');
  const set = await LotChangeSet.findOne({ _id: changeSetId, lot: lotId }).lean();
  if (!set) throw new HttpError(404, 'That change was not found on this lot.');
  const rows = await LotChangeRow.find({ changeSet: set._id }).limit(SHOW_CHANGES + 1).lean();
  return {
    id: String(set._id),
    label: set.label,
    changes: rows.slice(0, SHOW_CHANGES).map((r) => ({
      itemId: String(r.item),
      code: r.code ?? null,
      cells: diffOf((r.before as ItemImage | null) ?? null, (r.after as ItemImage | null) ?? null).slice(0, 12),
    })),
    truncated: rows.length > SHOW_CHANGES,
  };
}

/** Every recorded change of one item (or of one cell), newest first: "who changed this, and from what". */
export async function itemHistory(lotId: string, q: { itemId?: string; code?: string; path?: string }): Promise<HistoryItemResponse> {
  await connectToDatabase();
  const lot = new Types.ObjectId(lotId);
  let item: Types.ObjectId | null = null;
  if (q.itemId && Types.ObjectId.isValid(q.itemId)) item = new Types.ObjectId(q.itemId);
  else if (q.code) {
    const it = await LotItem.findOne({ lot, code: q.code }).select('_id').lean();
    item = it?._id ?? null;
    if (!item) {
      const row = await LotChangeRow.findOne({ lot, code: q.code }).select('item').lean();
      item = row?.item ?? null;
    }
  }
  if (!item) return { code: q.code ?? null, entries: [] };
  const rows = await LotChangeRow.find({ lot, item }).sort({ seq: -1 }).limit(100).lean();
  const sets = new Map((await LotChangeSet.find({ _id: { $in: rows.map((r) => r.changeSet) } }).select('actorName at label kind undoneAt').lean()).map((s) => [String(s._id), s]));
  const entries: HistoryItemResponse['entries'] = [];
  for (const r of rows) {
    const s = sets.get(String(r.changeSet));
    if (!s) continue;
    const cells = diffOf((r.before as ItemImage | null) ?? null, (r.after as ItemImage | null) ?? null).filter((c) => !q.path || c.path === q.path || c.path.startsWith(`${q.path}.`));
    if (cells.length === 0) continue;
    entries.push({ seq: r.seq, at: iso(s.at)!, actorName: s.actorName, label: s.label, kind: s.kind, undone: Boolean(s.undoneAt), cells: cells.slice(0, 12) });
  }
  return { code: rows[0]?.code ?? q.code ?? null, entries };
}

/* ---------------------------------------------------------------- dispatcher */

export async function runHistoryAction(lotId: string, body: HistoryActionBody, ctx: MutationContext): Promise<HistoryActionResponse> {
  const skip = body.skipConflicts === true;
  switch (body.action) {
    case 'undo':
      return body.changeSetId ? undoOne(lotId, body.changeSetId, ctx, skip) : undoLast(lotId, ctx, skip);
    case 'redo':
      return redoLast(lotId, ctx, skip);
    case 'undoSession':
      return undoSession(lotId, body.sessionId, ctx, skip);
    case 'restore':
      return restoreTo(lotId, { seq: body.seq, versionId: body.versionId }, ctx);
    case 'saveVersion':
      return saveVersion(lotId, body.name, ctx);
  }
}

// Re-exported so callers that only need a checkpoint do not import the core separately.
export { autoVersion };
export const OBJECT_FIELD_NAMES = OBJECT_FIELDS;
