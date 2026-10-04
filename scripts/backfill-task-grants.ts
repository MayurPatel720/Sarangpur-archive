/**
 * Grants the daily-work `task:*` permissions to existing role documents.
 *
 * Roles created in the database BEFORE the Tasks feature landed don't carry the new
 * grants, so their users would see no Today's tasks panel and no Tasks page. This
 * appends — per the seed grant sets in `SYSTEM_ROLE_GRANTS` — `task:view` to every
 * system role and all three task grants to `admin`. Custom roles get `task:view` too
 * (everyone can see their own tasks); `task:assign` / `task:viewAll` stay opt-in.
 * Append-only: never removes a grant.
 *
 *   npm run db:backfill-task-grants
 *   npm run db:backfill-task-grants -- --dry-run
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { Role } from '../src/models/Role';
import { SYSTEM_ROLE_GRANTS, type Permission } from '../src/server/permissions';

const TASK_GRANTS: Permission[] = ['task:view', 'task:assign', 'task:viewAll'];

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri);
  try {
    const roles = await Role.find({}).lean();
    let changed = 0;

    for (const role of roles) {
      const seed = SYSTEM_ROLE_GRANTS[role.key as keyof typeof SYSTEM_ROLE_GRANTS];
      const wanted: Permission[] = seed
        ? TASK_GRANTS.filter((p) => seed.includes(p))
        : ['task:view'];
      const current = role.permissions ?? [];
      const missing = wanted.filter((p) => !current.includes(p));
      if (missing.length === 0) {
        console.log(`${role.key}: already has its task grants (${current.length} total)`);
        continue;
      }
      changed += 1;
      const next = [...current, ...missing];
      console.log(
        `${role.key}: +${missing.length} [${missing.join(', ')}] · ${current.length} → ${next.length}`,
      );
      if (!dryRun) {
        await Role.updateOne({ _id: role._id }, { $set: { permissions: next } });
      }
    }

    console.log(
      dryRun
        ? `dry-run: ${changed} role(s) would change (nothing written).`
        : `done: ${changed} role(s) updated, ${roles.length - changed} already compliant.`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
