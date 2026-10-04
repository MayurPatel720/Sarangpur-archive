/**
 * One-off: converts tasks from the single-assignee shape (`assignee` + `assigneeName`) to
 * the multi-assignee shape (`assignees: [{ id, name }]`).
 *
 * Idempotent: only documents that have no `assignees` yet (missing or empty) and still
 * carry a legacy `assignee` are touched; the legacy fields are then unset. Re-running it
 * finds nothing to do. Goes through the raw collection because the legacy fields are no
 * longer in the Mongoose schema. Task history (ActivityLog) and notifications are not
 * rewritten — they record what was true at the time.
 *
 *   npm run db:backfill-task-assignees
 *   npm run db:backfill-task-assignees -- --dry-run
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

interface LegacyTask {
  _id: mongoose.Types.ObjectId;
  title?: string;
  assignee?: mongoose.Types.ObjectId | null;
  assigneeName?: string | null;
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri);
  try {
    const tasks = mongoose.connection.collection<LegacyTask>('tasks');
    const filter = {
      assignee: { $exists: true, $ne: null },
      $or: [{ assignees: { $exists: false } }, { assignees: { $size: 0 } }],
    };
    const todo = await tasks.find(filter as never).project({ title: 1, assignee: 1, assigneeName: 1 }).toArray();
    const alreadyDone = await tasks.countDocuments({ 'assignees.0': { $exists: true } });
    console.log(`${todo.length} task(s) to convert, ${alreadyDone} already on the assignees array.`);

    let converted = 0;
    for (const t of todo) {
      const name = (t.assigneeName ?? '').trim() || 'Unknown';
      console.log(`  ${String(t._id)} "${t.title ?? ''}" → [${name}]`);
      if (dryRun) continue;
      // Re-check the guard in the filter so a concurrent run cannot convert twice.
      const res = await tasks.updateOne(
        { _id: t._id, $or: [{ assignees: { $exists: false } }, { assignees: { $size: 0 } }] } as never,
        {
          $set: { assignees: [{ id: t.assignee, name }] },
          $unset: { assignee: '', assigneeName: '' },
        } as never,
      );
      converted += res.modifiedCount;
    }

    console.log(
      dryRun
        ? `dry-run: ${todo.length} task(s) would change (nothing written).`
        : `done: ${converted} task(s) converted.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
