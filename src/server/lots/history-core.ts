import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import {
  SESSION_GAP_MS,
  TRACKED_FIELDS,
  changedPaths,
  imageOf,
  normalize,
  sameImage,
  type ChangeKind,
  type ItemImage,
  type LotState,
} from '@/lib/item-history';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotChangeRow, LotChangeSet, LotVersion } from '@/models/LotChangeSet';
import { LotItem } from '@/models/LotItem';
import { nextSequence } from '@/server/codes';

/**
 * Recording side of the version history (see src/lib/item-history.ts). `tracked()` brackets any write
 * to a lot's items: it reads the touched rows before and after, and stores the pair as one change set.
 * Recording never breaks the operation it watches: a failure is logged and the edit still stands.
 */

const SELECT_ITEM = ['lot', ...TRACKED_FIELDS].join(' ');

export type Scope = Types.ObjectId[] | 'all' | { since: Date };

/** The lot-level state saved with a change set. */
export async function lotStateOf(lotId: string, session?: ClientSession): Promise<LotState | null> {
  const lot = await ArchiveLot.findById(lotId)
    .select('stage stageEnteredAt namingCode decision digitization return discard')
    .session(session ?? null)
    .lean();
  if (!lot) return null;
  return {
    stage: lot.stage,
    stageEnteredAt: lot.stageEnteredAt ?? null,
    namingCode: lot.namingCode ?? null,
    decision: (lot.decision ?? null) as Record<string, unknown> | null,
    expectedFileCount: lot.digitization?.expectedFileCount ?? 0,
    foundFileCount: lot.digitization?.foundFileCount ?? 0,
    return: (lot.return ?? null) as Record<string, unknown> | null,
    discard: (lot.discard ?? null) as Record<string, unknown> | null,
  };
}

/** The tracked fields of a lot's items (by id, `all`, or those created since a moment), keyed by item id. */
export async function snapshotItems(lotId: string, scope: Scope, session?: ClientSession): Promise<Map<string, ItemImage>> {
  await connectToDatabase();
  const filter: Record<string, unknown> = { lot: new Types.ObjectId(lotId) };
  if (Array.isArray(scope)) filter._id = { $in: scope };
  else if (scope !== 'all') filter.createdAt = { $gte: scope.since };
  const docs = await LotItem.find(filter).select(SELECT_ITEM).session(session ?? null).lean();
  return new Map(docs.map((d) => [String(d._id), imageOf(d as unknown as Record<string, unknown>)!]));
}

/** The newest change-set number of a lot (0 when there is none). */
export async function latestSeq(lotId: string, session?: ClientSession): Promise<number> {
  const last = await LotChangeSet.findOne({ lot: new Types.ObjectId(lotId) }).sort({ seq: -1 }).select('seq').session(session ?? null).lean();
  return last?.seq ?? 0;
}

/** An automatic checkpoint at the current end of history ("Before Excel import"). */
export async function autoVersion(lotId: string, ctx: MutationContext, name: string): Promise<void> {
  const seq = await latestSeq(lotId);
  const last = await LotVersion.findOne({ lot: new Types.ObjectId(lotId) }).sort({ at: -1 }).lean();
  if (last && last.auto && last.seq === seq && last.name === name) return;
  await LotVersion.create({ lot: new Types.ObjectId(lotId), name, seq, at: new Date(), by: new Types.ObjectId(ctx.userId), byName: ctx.userName, auto: true });
}

export interface RecordArgs {
  lotId: string;
  ctx: MutationContext;
  kind: ChangeKind;
  label: string;
  before: Map<string, ItemImage>;
  after: Map<string, ItemImage>;
  lotBefore: LotState | null;
  lotAfter: LotState | null;
  undoOf?: Types.ObjectId[];
  /** For an undo: can it be redone? (False for a redo itself.) */
  redoable?: boolean;
  session?: ClientSession;
}

/** Stores one change set (and its rows). Returns null when nothing differs. */
export async function recordChange(a: RecordArgs): Promise<{ id: Types.ObjectId; seq: number; itemCount: number } | null> {
  const lot = new Types.ObjectId(a.lotId);
  const rows: { item: Types.ObjectId; code: string | null; before: ItemImage | null; after: ItemImage | null; paths: string[] }[] = [];
  for (const id of new Set([...a.before.keys(), ...a.after.keys()])) {
    const b = a.before.get(id) ?? null;
    const x = a.after.get(id) ?? null;
    if (sameImage(b, x)) continue;
    const paths = b && x ? changedPaths(b, x) : [];
    rows.push({ item: new Types.ObjectId(id), code: ((x ?? b)?.code as string | undefined) ?? null, before: b, after: x, paths });
  }
  const lotChanged = normalize(a.lotBefore) !== normalize(a.lotAfter);
  if (rows.length === 0 && !lotChanged) return null;

  const seq = await nextSequence(`lotChange:${a.lotId}`, a.session);
  const now = new Date();
  const last = await LotChangeSet.findOne({ lot, actor: new Types.ObjectId(a.ctx.userId) })
    .sort({ seq: -1 })
    .select('sessionId at')
    .session(a.session ?? null)
    .lean();
  const sessionId = last && now.getTime() - new Date(last.at).getTime() < SESSION_GAP_MS ? last.sessionId : new Types.ObjectId().toHexString();
  const cellCount = rows.reduce((n, r) => n + (r.paths.length || 1), 0);

  const [set] = await LotChangeSet.create(
    [
      {
        lot,
        seq,
        sessionId,
        actor: new Types.ObjectId(a.ctx.userId),
        actorName: a.ctx.userName,
        at: now,
        kind: a.kind,
        label: a.label.slice(0, 300),
        itemCount: rows.length,
        cellCount,
        lotBefore: a.lotBefore,
        lotAfter: a.lotAfter,
        undoOf: a.undoOf ?? [],
        redoable: a.redoable ?? true,
      },
    ],
    { session: a.session },
  );
  for (let i = 0; i < rows.length; i += 2000) {
    await LotChangeRow.insertMany(
      rows.slice(i, i + 2000).map((r) => ({ ...r, changeSet: set!._id, lot, seq })),
      { session: a.session },
    );
  }
  // A new edit ends what the same person could still redo.
  if (a.kind !== 'undo' && a.kind !== 'restore') {
    await LotChangeSet.updateMany(
      { lot, actor: new Types.ObjectId(a.ctx.userId), kind: 'undo', redoable: true },
      { $set: { redoable: false } },
      { session: a.session },
    );
  }
  return { id: set!._id, seq, itemCount: rows.length };
}

/**
 * Brackets any write to a lot's items: reads the touched rows (and the lot-level state) before and
 * after `run`, and records the difference as one change set. `scope`: the item ids it touches, `all`
 * (structural changes), or `new` (it only adds items).
 */
export async function tracked<T>(o: {
  lotId: string;
  ctx: MutationContext;
  kind: ChangeKind;
  label: string | ((result: T) => string);
  scope: Types.ObjectId[] | 'all' | 'new';
  run: () => Promise<T>;
  /** Take an automatic checkpoint with this name first. */
  checkpoint?: string;
  /** The change sets this one undoes (an undo / redo). */
  undoOf?: Types.ObjectId[];
  redoable?: boolean;
}): Promise<T> {
  const since = new Date();
  let before: Map<string, ItemImage> | null = null;
  let lotBefore: LotState | null = null;
  try {
    before = o.scope === 'new' ? new Map() : await snapshotItems(o.lotId, o.scope);
    lotBefore = await lotStateOf(o.lotId);
    if (o.checkpoint) await autoVersion(o.lotId, o.ctx, o.checkpoint);
  } catch (e) {
    console.error('[history] could not read the sheet before the change:', e);
  }
  const result = await o.run();
  if (before) {
    try {
      const after = await snapshotItems(o.lotId, o.scope === 'new' ? { since } : o.scope);
      await recordChange({
        lotId: o.lotId,
        ctx: o.ctx,
        kind: o.kind,
        label: typeof o.label === 'function' ? o.label(result) : o.label,
        before,
        after,
        lotBefore,
        lotAfter: await lotStateOf(o.lotId),
        undoOf: o.undoOf,
        redoable: o.redoable,
      });
    } catch (e) {
      console.error('[history] could not record the change:', e);
    }
  }
  return result;
}

/**
 * `tracked` for a write that names items from any number of lots (marking returns done, Prasadi checks):
 * one change set per lot.
 */
export async function trackedByItems<T>(o: {
  itemIds: string[];
  ctx: MutationContext;
  kind: ChangeKind;
  label: string;
  run: () => Promise<T>;
}): Promise<T> {
  const ids = o.itemIds.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i));
  let lots: string[] = [];
  const before = new Map<string, Map<string, ItemImage>>();
  const lotBefore = new Map<string, LotState | null>();
  try {
    await connectToDatabase();
    lots = (await LotItem.distinct('lot', { _id: { $in: ids } })).map(String);
    for (const l of lots) {
      before.set(l, await snapshotItems(l, ids));
      lotBefore.set(l, await lotStateOf(l));
    }
  } catch (e) {
    console.error('[history] could not read the sheet before the change:', e);
    return o.run();
  }
  const result = await o.run();
  for (const l of lots) {
    try {
      await recordChange({
        lotId: l,
        ctx: o.ctx,
        kind: o.kind,
        label: o.label,
        before: before.get(l)!,
        after: await snapshotItems(l, ids),
        lotBefore: lotBefore.get(l) ?? null,
        lotAfter: await lotStateOf(l),
      });
    } catch (e) {
      console.error('[history] could not record the change:', e);
    }
  }
  return result;
}
