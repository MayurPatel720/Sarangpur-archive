/**
 * Items whose media line is Physical + Digital already have a digital copy, so their
 * Decision "Digital" answer starts as Yes. New items get this at creation; this script
 * fills it in for items created before — only where the answer is still blank.
 *
 *   npm run db:backfill-digital-yes
 *   npm run db:backfill-digital-yes -- --dry-run
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(uri);
  try {
    const lots = await ArchiveLot.find({ 'mediaLines.dataType': 'both' }).select('lotReference mediaLines').lean();
    let total = 0;
    for (const lot of lots) {
      const lines = (lot.mediaLines ?? []) as { dataType: string }[];
      const bothIdx = lines.map((l, i) => (l.dataType === 'both' ? i : -1)).filter((i) => i >= 0);
      const filter = {
        lot: lot._id,
        lineIndex: { $in: bothIdx },
        $or: [{ 'decision.digital': null }, { 'decision.digital': { $exists: false } }],
      };
      const n = await LotItem.countDocuments(filter);
      if (n === 0) continue;
      total += n;
      console.log(`${lot.lotReference}: ${n} item(s)`);
      if (!dryRun) await LotItem.updateMany(filter, { $set: { 'decision.digital': true } });
    }
    console.log(dryRun ? `dry-run: ${total} item(s) would change.` : `done: ${total} item(s) set to Digital = Yes.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
