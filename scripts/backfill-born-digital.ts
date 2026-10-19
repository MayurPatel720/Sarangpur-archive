/**
 * Photo and video lines entered as Data type "Digital" already exist as files, so their items start
 * with the Decision "Digital" answer = Yes. This applies that to items created before the rule
 * existed. It only fills a Digital answer that is still BLANK — an answer someone already gave (Yes
 * or No) is never changed. Redigital and Discard are not touched.
 *
 *   npm run db:backfill-born-digital
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { bornDigitalFields } from '../src/lib/item-decision';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    let updated = 0;
    let lotsTouched = 0;
    for await (const lot of ArchiveLot.find({}).select('format dataType mediaLines').lean()) {
      const lines = (lot.mediaLines ?? []) as { format: string; dataType: string }[];
      // Lots from before media lines existed are one line: the lot's own format / data type.
      const effective = lines.length > 0 ? lines : [{ format: lot.format, dataType: lot.dataType }];
      let touched = false;
      for (const [i, line] of effective.entries()) {
        if (!bornDigitalFields(line.format, line.dataType)) continue;
        const res = await LotItem.updateMany(
          { lot: lot._id, lineIndex: i, 'decision.digital': null },
          { $set: { 'decision.digital': true } },
        );
        updated += res.modifiedCount;
        if (res.modifiedCount > 0) touched = true;
      }
      if (touched) lotsTouched += 1;
    }
    console.log(`Decision Digital set to Yes on ${updated} items in ${lotsTouched} lots.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
