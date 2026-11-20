import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { DOC_STAGE_LABELS, PENDING_CODE_PREFIX, docStageOf, isDocStage, lotDocStage, stepDocStage, type DocStage } from '@/lib/domain';
import { letterCodeError, letterCodeOfFile } from '@/lib/letter-code';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { auditActor, withAudit } from '@/server/audit';
import { tracked } from '@/server/lots/history-core';
import { getReferenceList } from '@/server/reference';
import type { LetterCodesBody, LetterCodesResponse } from '@/types/items';
import type { DocStageBody, DocStageResponse } from '@/types/lot';

/**
 * Letters (the Documents format). Two things only a letters lot does:
 *  - move one step along its own cycle (Scan & storage, Rewrite, Type, Recheck, Topics, Final edit);
 *  - take each letter's code from the name of its scanned file (nothing is numbered automatically).
 */

const pendingRegex = new RegExp('^' + PENDING_CODE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/**
 * Moves letters along their own cycle — one step, or straight to a stage. Every letter has its own stage (`attrs.docStage`);
 * the lot's stage is its least advanced letter. Leaving "Scan & storage" needs the letter to have its code. Recorded in the
 * lot's version history (Undo works).
 */
export async function moveDocumentStage(lotId: string, body: DocStageBody, ctx: MutationContext): Promise<DocStageResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const ids = body.itemIds?.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i));
  if (body.itemIds && (!ids || ids.length !== body.itemIds.length)) throw new HttpError(400, 'One of the letters is not valid.');
  const labels = new Map((await getReferenceList('stage')).map((i) => [i.value, i.label]));
  return tracked({
    lotId,
    ctx,
    kind: 'workflow',
    label: (r: DocStageResponse) => `Moved ${r.moved} ${r.moved === 1 ? 'letter' : 'letters'} (${labels.get(r.stage) ?? r.stage})`,
    scope: ids && ids.length > 0 ? ids : 'all',
    run: () => moveDocumentStageCore(lotId, body, ids, labels, ctx),
  });
}

async function moveDocumentStageCore(
  lotId: string,
  body: DocStageBody,
  ids: Types.ObjectId[] | undefined,
  labels: Map<string, string>,
  ctx: MutationContext,
): Promise<DocStageResponse> {
  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'document_stage_changed',
    title: 'Letters moved to another stage',
    mutate: async (lot, session) => {
      if (lot.format !== 'documents') throw new HttpError(400, 'Only a letters lot has these stages.');
      const all = (await LotItem.find({ lot: lot._id }).select('code attrs').session(session).lean()) as { _id: Types.ObjectId; code: string; attrs?: Record<string, unknown> }[];
      const chosen = ids && ids.length > 0 ? all.filter((i) => ids.some((x) => x.equals(i._id))) : all;
      if (ids && ids.length > 0 && chosen.length !== ids.length) throw new HttpError(404, 'One of the letters was not found on this lot.');
      const next = new Map<string, DocStage>(all.map((i) => [String(i._id), docStageOf(i.attrs)]));
      const ops: { updateOne: { filter: { _id: Types.ObjectId }; update: { $set: Record<string, unknown> } } }[] = [];
      let uncoded = 0;
      let atEnd = 0;
      for (const it of chosen) {
        const now = docStageOf(it.attrs);
        const target = body.stage ?? stepDocStage(now, body.direction!);
        if (!target) {
          atEnd += 1;
          continue;
        }
        if (target === now) continue;
        if (now === 'doc_scan' && isDocStage(target) && target !== 'doc_scan' && pendingRegex.test(it.code)) uncoded += 1;
        next.set(String(it._id), target);
        ops.push({ updateOne: { filter: { _id: it._id }, update: { $set: { 'attrs.docStage': target } } } });
      }
      if (uncoded > 0) {
        throw new HttpError(409, `${uncoded} ${uncoded === 1 ? 'letter has' : 'letters have'} no code yet. Choose the scanned files first (Items tab → Set codes from files).`);
      }
      if (ops.length === 0) {
        throw new HttpError(400, atEnd > 0 ? (body.direction === 'next' ? 'Already at the last stage.' : 'Already at the first stage.') : 'Nothing to move.');
      }
      await LotItem.bulkWrite(ops, { session });
      const stage = lotDocStage([...next.values()]);
      lot.stage = stage;
      return { stage, label: labels.get(stage) ?? DOC_STAGE_LABELS[stage], moved: ops.length };
    },
  });
}

/**
 * Gives letters their code: the name of the scanned file, without its extension. A code already used by any other
 * item in the archive (or twice in the request) is refused. Recorded in the lot's version history (Undo works).
 */
export async function setLetterCodes(lotId: string, body: LetterCodesBody, ctx: MutationContext): Promise<LetterCodesResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const ids = body.assignments.map((a) => new Types.ObjectId(a.itemId));
  return tracked({
    lotId,
    ctx,
    kind: 'recode',
    label: `Set ${ids.length} letter ${ids.length === 1 ? 'code' : 'codes'} from files`,
    scope: ids,
    run: () => setLetterCodesCore(lotId, body, ctx),
  });
}

async function setLetterCodesCore(lotId: string, body: LetterCodesBody, ctx: MutationContext): Promise<LetterCodesResponse> {
  const clean = body.assignments.map((a) => ({ itemId: a.itemId, code: letterCodeOfFile(a.code) }));
  for (const a of clean) {
    const problem = letterCodeError(a.code);
    if (problem) throw new HttpError(400, `${a.code || 'A file'}: ${problem}`);
  }
  const seen = new Map<string, string>();
  for (const a of clean) {
    // File names do not tell capital from small letters on Windows, so neither do we ("Letter 1" = "letter 1").
    if (seen.has(a.code.toLowerCase())) throw new HttpError(400, `The code "${a.code}" is used twice in this selection (capital or small letters do not make a new code).`);
    seen.set(a.code.toLowerCase(), a.itemId);
  }
  const ids = clean.map((a) => a.itemId);
  const taken = await LotItem.find({ code: { $in: clean.map((a) => a.code) }, _id: { $nin: ids } })
    .collation({ locale: 'en', strength: 2 })
    .select('code')
    .lean();
  if (taken.length > 0) throw new HttpError(409, `"${taken[0]!.code}" is already the code of another item in the archive.`);

  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'item_code_changed',
    title: 'Letter codes set from files',
    mutate: async (lot, session) => {
      if (lot.format !== 'documents') throw new HttpError(400, 'Only letters take their code from a file.');
      const items = await LotItem.find({ _id: { $in: ids }, lot: lot._id }).select('_id').session(session).lean();
      if (items.length !== ids.length) throw new HttpError(404, 'One of the letters was not found on this lot.');
      await LotItem.bulkWrite(
        clean.map((a) => ({ updateOne: { filter: { _id: a.itemId }, update: { $set: { code: a.code } } } })),
        { session },
      );
      return { updated: clean.length, codes: clean };
    },
  });
}
