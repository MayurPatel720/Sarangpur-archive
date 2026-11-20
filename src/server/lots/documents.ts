import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { PENDING_CODE_PREFIX, isDocStage, stepDocStage } from '@/lib/domain';
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

/** Moves a letters lot to the next / previous stage. Leaving "Scan & storage" needs every letter to have its code. */
export async function moveDocumentStage(lotId: string, body: DocStageBody, ctx: MutationContext): Promise<DocStageResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const now = (await ArchiveLot.findById(lotId).select('stage format').lean()) as { stage: string; format: string } | null;
  if (!now) throw new HttpError(404, 'Lot not found.');
  if (now.format !== 'documents' || !isDocStage(now.stage)) throw new HttpError(400, 'Only a letters lot moves through these stages.');
  const target = stepDocStage(now.stage, body.direction);
  if (!target) throw new HttpError(400, body.direction === 'next' ? 'This lot is at the last stage.' : 'This lot is at the first stage.');
  const labels = new Map((await getReferenceList('stage')).map((i) => [i.value, i.label]));
  const label = labels.get(target) ?? target;

  return withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'document_stage_changed',
    title: body.direction === 'next' ? `Moved to ${label}` : `Moved back to ${label}`,
    mutate: async (lot, session) => {
      if (lot.stage !== now.stage) throw new HttpError(409, 'This lot changed since you opened it. Reload and try again.');
      if (body.direction === 'next' && lot.stage === 'doc_scan') {
        const missing = await LotItem.countDocuments({ lot: lot._id, code: { $regex: pendingRegex } }).session(session);
        if (missing > 0) {
          throw new HttpError(409, `${missing} ${missing === 1 ? 'letter has' : 'letters have'} no code yet. Choose the scanned files first (Items tab → Set codes from files).`);
        }
      }
      lot.stage = target;
      return { stage: target, label };
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
    if (seen.has(a.code)) throw new HttpError(400, `The code "${a.code}" is used twice in this selection.`);
    seen.set(a.code, a.itemId);
  }
  const ids = clean.map((a) => a.itemId);
  const taken = await LotItem.find({ code: { $in: [...seen.keys()] }, _id: { $nin: ids } }).select('code').lean();
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
