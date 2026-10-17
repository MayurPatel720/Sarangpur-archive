/**
 * Prasadi is never digitized, so its items start already decided as "keep physical"
 * (Digital, Redigital and Discard all No). This applies that to Prasadi items created before the
 * rule existed. Only touches Prasadi items that have no decision yet.
 *
 *   npm run db:backfill-prasadi-decisions
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { autoDecisionFields } from '../src/lib/item-decision';
import { LotItem } from '../src/models/LotItem';

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    const fields = autoDecisionFields('prasadi')!;
    const res = await LotItem.updateMany(
      {
        format: 'prasadi',
        $or: [{ 'decision.digital': null }, { 'decision.redigital': null }, { 'decision.discard': null }],
      },
      {
        $set: {
          selectedForDigitization: fields.selectedForDigitization,
          'decision.digital': false,
          'decision.redigital': false,
          // A Prasadi item already marked "discard" keeps that answer.
          'decision.verdict': fields.decision.verdict,
        },
      },
    );
    // `discard` only where it is still unanswered, so an explicit Yes survives.
    const discard = await LotItem.updateMany(
      { format: 'prasadi', 'decision.discard': null },
      { $set: { 'decision.discard': false } },
    );
    console.log(`Prasadi items decided as keep physical: ${res.modifiedCount} (discard filled on ${discard.modifiedCount}).`);
    console.log('Lots that were waiting on these items move on the next time one of their items is edited.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
