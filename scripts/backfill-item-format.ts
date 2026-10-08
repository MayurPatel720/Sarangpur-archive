/**
 * Fills `LotItem.format` (denormalised from the lot's media line) on items created before the
 * Master Excel existed. Only touches items whose `format` is empty.
 *
 *   npm run db:backfill-item-format
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    let updated = 0;
    for await (const lot of ArchiveLot.find({}).select('format mediaLines').lean()) {
      const lines = (lot.mediaLines ?? []) as { format: string }[];
      const count = Math.max(lines.length, 1);
      for (let i = 0; i < count; i += 1) {
        const format = lines[i]?.format ?? lot.format;
        const res = await LotItem.updateMany(
          { lot: lot._id, lineIndex: i, $or: [{ format: null }, { format: { $exists: false } }] },
          { $set: { format } },
        );
        updated += res.modifiedCount;
      }
    }
    console.log(`Filled the format on ${updated} items.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
