/**
 * Fills `photoUrls` (the first 4 photo URLs, cover first) on items whose photos were added before
 * the Excel's photo mosaic existed.
 *
 *   npm run db:backfill-item-photo-urls
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { LotImage } from '../src/models/LotImage';
import { LotItem } from '../src/models/LotItem';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    const items = await LotItem.find({ imageCount: { $gt: 0 } }).select('_id').lean();
    let n = 0;
    for (const it of items) {
      const imgs = await LotImage.find({ item: it._id }).sort({ isCover: -1, createdAt: 1 }).limit(4).lean();
      await LotItem.updateOne({ _id: it._id }, { $set: { photoUrls: imgs.map((i) => i.url) } });
      n += 1;
    }
    console.log(`done: ${n} item(s) updated.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
