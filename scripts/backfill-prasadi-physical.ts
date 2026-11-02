/**
 * Prasadi is always physical, never digital. This sets the data type of every existing Prasadi lot
 * (and each Prasadi media line) to Physical.
 *
 *   npm run db:backfill-prasadi-physical
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ArchiveLot } from '../src/models/ArchiveLot';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    const lots = await ArchiveLot.updateMany({ format: 'prasadi', dataType: { $ne: 'physical' } }, { $set: { dataType: 'physical' } });
    const lines = await ArchiveLot.updateMany(
      { 'mediaLines.format': 'prasadi' },
      { $set: { 'mediaLines.$[l].dataType': 'physical' } },
      { arrayFilters: [{ 'l.format': 'prasadi', 'l.dataType': { $ne: 'physical' } }] },
    );
    console.log(`done: ${lots.modifiedCount} lot(s) and ${lines.modifiedCount} lot(s) with Prasadi lines updated.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
