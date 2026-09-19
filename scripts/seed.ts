/**
 * Seeds MongoDB with the generated archive snapshot.
 *
 *   npm run seed        # wipes the four collections and reseeds
 *
 * The data itself comes from scripts/dataset.ts, which has no database dependency — see
 * scripts/verify-seed.ts, which runs the dashboard pipelines over the very same
 * documents without needing a mongod at all.
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';
import { ReferenceList } from '../src/models/ReferenceList';
import { Role } from '../src/models/Role';
import { Setting } from '../src/models/Setting';
import { hashPassword } from '../src/server/auth-verify';
import { buildDataset } from './dataset';
import {
  buildGlobalSettings,
  buildRoles,
  SEED_DEV_PASSWORD,
  SEED_REFERENCE_LISTS,
} from './seed-data';

const CHUNK = 5000;

async function insertChunked(
  model: { insertMany: (docs: unknown[], opts: { ordered: boolean }) => Promise<unknown> },
  docs: Record<string, unknown>[],
) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await model.insertMany(docs.slice(i, i + CHUNK), { ordered: false });
  }
}

async function main() {
  const uri = requireEnv('MONGODB_URI');

  // Print where it is connecting, with the password masked, so a wrong cluster or a
  // missing database name is obvious before 50,000 documents go the wrong place.
  console.log(`→ target: ${uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')}`);

  console.log('→ generating dataset…');
  const { users, lots, items, activity } = buildDataset();

  console.log('→ connecting to MongoDB…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });

  console.log('→ clearing collections…');
  await Promise.all([
    User.deleteMany({}),
    ArchiveLot.deleteMany({}),
    LotItem.deleteMany({}),
    ActivityLog.deleteMany({}),
    Role.deleteMany({}),
    ReferenceList.deleteMany({}),
    // Settings are NOT wiped: on reseed the admin's thresholds survive.
  ]);

  // Every generated team member can sign in with the dev password. Real accounts are
  // created with `scripts/create-user.ts`.
  const devPassword = process.env.SEED_DEV_PASSWORD || SEED_DEV_PASSWORD;
  const passwordHash = await hashPassword(devPassword);
  const usersWithPasswords = users.map((u) => ({ ...u, passwordHash }));

  console.log(`→ inserting ${usersWithPasswords.length} users…`);
  await insertChunked(User, usersWithPasswords);

  console.log(`→ inserting ${lots.length} lots…`);
  await insertChunked(ArchiveLot, lots);

  console.log(`→ inserting ${items.length} item profiles…`);
  await insertChunked(LotItem, items);

  console.log(`→ inserting ${activity.length} audit entries…`);
  await insertChunked(ActivityLog, activity);

  const roles = buildRoles();
  console.log(`→ inserting ${roles.length} roles…`);
  await insertChunked(Role, roles);

  console.log(`→ inserting ${SEED_REFERENCE_LISTS.length} reference lists…`);
  await insertChunked(ReferenceList, SEED_REFERENCE_LISTS);

  console.log('→ ensuring global settings…');
  await Setting.updateOne({ key: 'global' }, { $setOnInsert: buildGlobalSettings() }, { upsert: true });

  // Indexes are declared on the schemas; build them now so the first dashboard load is
  // not the thing that pays for them.
  console.log('→ building indexes…');
  await Promise.all([
    User.syncIndexes(),
    ArchiveLot.syncIndexes(),
    LotItem.syncIndexes(),
    ActivityLog.syncIndexes(),
    Role.syncIndexes(),
    ReferenceList.syncIndexes(),
    Setting.syncIndexes(),
  ]);

  const bytes = lots.reduce(
    (sum, l) => sum + ((l.digitization as { masterBytes: number }).masterBytes ?? 0),
    0,
  );

  console.log('');
  console.log('Seed complete.');
  console.log(`  users          ${users.length}`);
  console.log(`  lots           ${lots.length}`);
  console.log(`  item profiles  ${items.length}`);
  console.log(`  audit entries  ${activity.length}`);
  console.log(`  roles          ${roles.length}`);
  console.log(`  vocabularies   ${SEED_REFERENCE_LISTS.length}`);
  console.log(`  masters        ${(bytes / 1e12).toFixed(1)} TB`);
  console.log('');
  console.log(`  Every seed user signs in with: ${devPassword}`);
  console.log('  (try s.dave — the admin). Now run `npm run dev` and open http://localhost:3000');
  console.log('');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
