/**
 * Grants every existing role the five `format:*` block permissions.
 *
 * Format blocks are permission-gated (`format:photo`, `format:video`, …). System role
 * seeds already carry them, but roles created in the database BEFORE the feature
 * landed don't — their users would suddenly see locked blocks. This appends the
 * grants to every role document, preserving all existing permissions.
 *
 *   npm run db:backfill-format-grants      # append missing format grants (idempotent)
 *   npm run db:backfill-format-grants -- --dry-run
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { Role } from '../src/models/Role';
import { FORMAT_PERMISSIONS } from '../src/server/permissions';

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri);
  try {
    const roles = await Role.find({}).lean();
    let changed = 0;

    for (const role of roles) {
      const current = role.permissions ?? [];
      const missing = FORMAT_PERMISSIONS.filter((p) => !current.includes(p));
      if (missing.length === 0) {
        console.log(`${role.key}: already has all format grants (${current.length} total)`);
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
