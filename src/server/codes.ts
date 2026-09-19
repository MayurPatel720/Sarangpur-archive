import type { ClientSession } from 'mongoose';
import { ArchiveLot } from '@/models/ArchiveLot';
import { connectToDatabase } from '@/lib/mongo';

/**
 * Code allocation for lots and items (SPEC §4.3–§4.4).
 *
 * Sequences live in the `counters` collection (`{ _id, seq }`) and are always
 * incremented inside the caller's transaction, so two concurrent intakes can
 * never allocate the same reference.
 *
 * Two code families:
 * - `lotReference` (`LOT-2026-0007`) — allocated at INTAKE, one per lot, never
 *   changes. This is the lot's permanent identity.
 * - `namingCode` (`NEG-MUM-014`) — allocated at the archive DECISION (Phase D),
 *   per prefix+origin. Items are recoded to it then.
 */

interface CounterDoc {
  _id: string;
  seq: number;
}

/** Atomically increments a named counter and returns the new value. */
export async function nextSequence(key: string, session?: ClientSession): Promise<number> {
  await connectToDatabase();
  const collection = ArchiveLot.db.collection<CounterDoc>('counters');
  const doc = await collection.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );
  if (!doc || typeof doc.seq !== 'number') {
    throw new Error(`Counter '${key}' did not return a sequence.`);
  }
  return doc.seq;
}

/** `LOT-2026-0007`. Counter is per calendar year so references stay readable. */
export async function generateLotReference(session?: ClientSession): Promise<string> {
  const year = new Date().getFullYear();
  const key = `lotReference:${year}`;
  await connectToDatabase();
  const collection = ArchiveLot.db.collection<CounterDoc>('counters');

  // First use: seed the counter past any references created outside it (the
  // dataset seed writes LOT-YYYY-NNNN directly). The $set is idempotent so two
  // concurrent first-uses converge, and the $inc below stays atomic.
  const existing = await collection.findOne({ _id: key }, { ...(session ? { session } : {}) });
  if (!existing) {
    const peak = await ArchiveLot.find({ lotReference: { $regex: `^LOT-${year}-` } })
      .sort({ lotReference: -1 })
      .limit(1)
      .select('lotReference')
      .session(session ?? null)
      .lean();
    const maxSeq = peak[0] ? Number.parseInt(peak[0].lotReference.slice(-4), 10) || 0 : 0;
    await collection.updateOne({ _id: key }, { $set: { seq: maxSeq } }, { upsert: true, ...(session ? { session } : {}) });
  }

  const seq = await nextSequence(key, session);
  return `LOT-${year}-${String(seq).padStart(4, '0')}`;
}

/**
 * Item codes for a lot: `{lotCode}-01-01 … {lotCode}-06-36`, `perGroup`
 * (default 36) items per group. At intake `lotCode` is the lotReference; the
 * decision step recodes items to the naming code when one is issued.
 */
export function generateItemCodes(  lotCode: string,
  quantity: number,
  perGroup = 36,
): { code: string; groupNo: number; itemNo: number }[] {
  const codes: { code: string; groupNo: number; itemNo: number }[] = [];
  let n = 0;
  for (let g = 1; n < quantity; g++) {
    for (let i = 1; i <= perGroup && n < quantity; i++, n++) {
      codes.push({
        code: `${lotCode}-${String(g).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        groupNo: g,
        itemNo: i,
      });
    }
  }
  return codes;
}

/**
 * Fallback naming-code prefix by format, used ONLY when the lot's media
 * sub-type carries no Tier-2 `codePrefix` (documents/prasadi are free text per
 * SPEC Q2, so there is no vocabulary item to read). Photo/video/audio resolve
 * through the reference list in the decision mutation.
 */
export const FORMAT_DEFAULT_PREFIX: Record<string, string> = {
  photo: 'NEG',
  video: 'VHS',
  audio: 'AUD',
  documents: 'DOC',
  prasadi: 'PRS',
};

/**
 * `NEG-MUM-014` (SPEC §4.3). The sequence is per prefix+origin and MUST be
 * allocated inside the caller's transaction (`$inc` on a counter document) or
 * two concurrent decisions will collide. First use seeds past any codes the
 * dataset seed wrote directly.
 */
export async function generateNamingCode(
  prefix: string,
  origin: string,
  session?: ClientSession,
): Promise<string> {
  const key = `namingCode:${prefix}-${origin}`;
  await connectToDatabase();
  const collection = ArchiveLot.db.collection<CounterDoc>('counters');

  // First use: seed past codes the dataset seed wrote directly (same pattern
  // as generateLotReference). Idempotent $set, atomic $inc — concurrent
  // first-uses converge.
  const existing = await collection.findOne({ _id: key }, { ...(session ? { session } : {}) });
  if (!existing) {
    const peak = await ArchiveLot.find({ namingCode: { $regex: `^${prefix}-${origin}-` } })
      .sort({ namingCode: -1 })
      .limit(1)
      .select('namingCode')
      .session(session ?? null)
      .lean();
    const maxSeq = peak[0]?.namingCode ? Number.parseInt(peak[0].namingCode.slice(-3), 10) || 0 : 0;
    await collection.updateOne({ _id: key }, { $set: { seq: maxSeq } }, { upsert: true, ...(session ? { session } : {}) });
  }

  const seq = await nextSequence(key, session);
  return `${prefix}-${origin}-${String(seq).padStart(3, '0')}`;
}
