/**
 * One-off for the new stage order (Intake → Data entry → Decision → Digitalization …):
 *
 *  1. Updates the `stage` reference list already in the database — new labels ("Data entry",
 *     "Digitalization"), Data entry before Decision, Data entry no longer a discard point.
 *     Values are never added or deleted, and admin-added stages keep their place at the end.
 *  2. Moves lots that were decided "archive" but still sat in `metadata` (the old "awaiting
 *     capture" stage) to `scanning`, which is where a decided lot waits now.
 *
 *   npm run db:sync-stage-flow
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { catalogList } from '../src/lib/vocab-catalog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ReferenceList } from '../src/models/ReferenceList';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    const seed = catalogList('stage');
    if (!seed) throw new Error('No catalog list "stage".');
    const doc = await ReferenceList.findOne({ key: 'stage' });
    if (doc) {
      const order = new Map(seed.items.map((i, n) => [i.value, n]));
      let changed = 0;
      for (const it of doc.items) {
        const want = seed.items.find((s) => s.value === it.value);
        if (!want) continue;
        const sortOrder = order.get(it.value) ?? it.sortOrder;
        if (it.label !== want.label || it.sortOrder !== sortOrder) {
          it.label = want.label;
          it.sortOrder = sortOrder;
          changed += 1;
        }
        const meta = (it.meta ?? {}) as Record<string, unknown>;
        if (meta.discardable !== want.meta.discardable) {
          it.meta = { ...meta, discardable: want.meta.discardable };
          changed += 1;
        }
      }
      if (changed > 0) {
        doc.markModified('items');
        doc.revision = (doc.revision ?? 1) + 1;
        await doc.save();
      }
      console.log(`stage list: ${changed} change(s).`);
    } else {
      console.log('stage list: not in the database yet (the seed will create it).');
    }

    const moved = await ArchiveLot.updateMany(
      { stage: 'metadata', 'decision.status': 'archive' },
      { $set: { stage: 'scanning' } },
    );
    console.log(`lots: ${moved.modifiedCount} decided lot(s) moved from Data entry to Digitalization.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
