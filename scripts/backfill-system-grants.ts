/**
 * Appends any SYSTEM_ROLE_GRANTS grants missing from existing role documents.
 *
 * Roles created in the database BEFORE a permission landed (e.g. the `project:*`
 * keys) don't get the new grants from code alone — their users never see the
 * feature. Append-only: preserves every existing grant, never removes any.
 *
 *   npm run db:backfill-system-grants
 *   npm run db:backfill-system-grants -- --dry-run
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { Role } from '../src/models/Role';
import { SYSTEM_ROLE_GRANTS } from '../src/server/permissions';

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri);
  try {
    const roles = await Role.find({ key: { $in: Object.keys(SYSTEM_ROLE_GRANTS) } }).lean();
    let changed = 0;

    for (const role of roles) {
      const seed = SYSTEM_ROLE_GRANTS[role.key as keyof typeof SYSTEM_ROLE_GRANTS];
      if (!seed) continue;
      const current = role.permissions ?? [];
      const missing = seed.filter((p) => !current.includes(p));
      if (missing.length === 0) {
        console.log(`${role.key}: already has all system grants (${current.length} total)`);
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
