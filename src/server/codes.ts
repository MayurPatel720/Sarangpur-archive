import type { ClientSession } from 'mongoose';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { Project } from '@/models/Project';
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
 *   per prefix+origin. It names the LOT; items keep their own codes (below).
 * - item code (`MDV-AHM-0002-R-000`) — allocated per ITEM at creation, like the
 *   archive's logging spreadsheets: sub-type prefix, origin, a running number per
 *   prefix+origin, `R` = raw capture (`D` = duplicate, reserved), `000` = copy number.
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

/** Pure formatter: `MDV-AHM-0002-R-000`. */
export function formatItemCode(prefix: string, origin: string, seq: number, kind: 'R' | 'D' = 'R', copy = 0): string {
  return `${prefix}-${origin}-${String(seq).padStart(4, '0')}-${kind}-${String(copy).padStart(3, '0')}`;
}

/**
 * Reserves `count` consecutive item numbers for `prefix`+`origin` and returns the codes.
 * First use per key seeds the counter past any codes written outside it (the dataset
 * seed writes codes directly); the reserve itself is one atomic $inc by `count`.
 */
export async function allocateItemCodes(
  prefix: string,
  origin: string,
  count: number,
  session?: ClientSession,
): Promise<string[]> {
  if (count <= 0) return [];
  await connectToDatabase();
  const key = `itemCode:${prefix}-${origin}`;
  const collection = ArchiveLot.db.collection<CounterDoc>('counters');
  const sess = session ? { session } : {};

  const existing = await collection.findOne({ _id: key }, sess);
  if (!existing) {
    const [peak] = await LotItem.aggregate<{ max: number }>([
      { $match: { code: { $regex: `^${prefix}-${origin}-\\d+-[RD]-\\d{3}$` } } },
      { $project: { n: { $toInt: { $arrayElemAt: [{ $split: ['$code', '-'] }, 2] } } } },
      { $group: { _id: null, max: { $max: '$n' } } },
    ]).session(session ?? null);
    await collection.updateOne({ _id: key }, { $set: { seq: peak?.max ?? 0 } }, { upsert: true, ...sess });
  }

  const doc = await collection.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after', ...sess },
  );
  if (!doc || typeof doc.seq !== 'number') throw new Error(`Counter '${key}' did not return a sequence.`);
  const first = doc.seq - count + 1;
  return Array.from({ length: count }, (_, i) => formatItemCode(prefix, origin, first + i));
}

/** Group / position of the n-th item of a lot (0-based), 36 items per group. */
export function itemSlot(n: number, perGroup = 36): { groupNo: number; itemNo: number } {
  return { groupNo: Math.floor(n / perGroup) + 1, itemNo: (n % perGroup) + 1 };
}

/**
 * Legacy lot-based codes (`{lotCode}-GG-II`). Only the old triage seed script still
 * uses this; live item creation goes through `allocateItemCodes`.
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

/** `PRJ-2026-0003`. Auto-assigned at project creation; per calendar year, never typed. */
export async function generateProjectCode(session?: ClientSession): Promise<string> {
  const year = new Date().getFullYear();
  const key = `projectCode:${year}`;
  await connectToDatabase();
  const collection = ArchiveLot.db.collection<CounterDoc>('counters');
  const sess = session ? { session } : {};

  const existing = await collection.findOne({ _id: key }, sess);
  if (!existing) {
    const peak = await Project.find({ code: { $regex: `^PRJ-${year}-` } })
      .sort({ code: -1 })
      .limit(1)
      .select('code')
      .session(session ?? null)
      .lean();
    const maxSeq = peak[0] ? Number.parseInt(peak[0].code.slice(-4), 10) || 0 : 0;
    await collection.updateOne({ _id: key }, { $set: { seq: maxSeq } }, { upsert: true, ...sess });
  }

  const seq = await nextSequence(key, session);
  return `PRJ-${year}-${String(seq).padStart(4, '0')}`;
}
