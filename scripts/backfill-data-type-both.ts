/**
 * Adds the "Physical + Digital" (`both`) value to the stored `dataType` vocabulary.
 *
 * The admin lists live in the database, so a value added to the code
 * (src/lib/vocab-catalog.ts) does not reach an existing database by itself. Append-only:
 * nothing already in the list is changed.
 *
 *   npm run db:backfill-data-type-both
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ReferenceList } from '../src/models/ReferenceList';

/** Idempotent; assumes mongoose is already connected. Returns true when it added the value. */
export async function ensureBothDataType(): Promise<boolean> {
  const list = await ReferenceList.findOne({ key: 'dataType' }).lean();
  if (!list) return false; // no list yet — the seed creates it with `both` already in it
  const items = (list.items ?? []) as { value: string; sortOrder: number }[];
  if (items.some((i) => i.value === 'both')) return false;
  const sortOrder = items.reduce((m, i) => Math.max(m, i.sortOrder ?? 0), -1) + 1;
  await ReferenceList.updateOne(
    { key: 'dataType' },
    { $push: { items: { value: 'both', label: 'Physical + Digital', active: true, sortOrder, usageCount: 0, meta: {} } } },
  );
  return true;
}

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    const added = await ensureBothDataType();
    console.log(added ? 'Added "Physical + Digital" to the data types.' : 'Data types already include "Physical + Digital".');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
