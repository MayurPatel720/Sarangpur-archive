/**
 * Seeds MongoDB with the generated demo archive: 10 projects, 35 lots, their items.
 *
 *   npm run seed        # wipes users, projects, lots, items, activity and roles, then reseeds
 *
 * The data comes from scripts/dataset.ts (no database dependency — scripts/verify-seed.ts
 * validates the very same documents without a mongod); the writing lives in
 * scripts/seed-core.ts.
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { seedDatabase } from './seed-core';

async function main() {
  const uri = requireEnv('MONGODB_URI');

  // Print where it is connecting, with the password masked, so a wrong cluster or a
  // missing database name is obvious before any documents go the wrong place.
  console.log(`→ target: ${uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')}`);

  console.log('→ connecting to MongoDB…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });

  const r = await seedDatabase();

  console.log('');
  console.log('Seed complete.');
  console.log(`  users          ${r.users}`);
  console.log(`  projects       ${r.projects}`);
  console.log(`  lots           ${r.lots}`);
  console.log(`  item profiles  ${r.items}`);
  console.log(`  audit entries  ${r.activity}`);
  console.log(`  roles          ${r.roles}`);
  console.log(`  vocabularies   ${r.lists}`);
  console.log(`  masters        ${r.masterTb} TB`);
  console.log('');
  console.log(`  Every seed user signs in with: ${r.devPassword}`);
  console.log("  Main admin: admin@gmail.com (username 'admin').");
  console.log('  Also try s.dave. Now run `npm run dev` and open http://localhost:3000');
  console.log('');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
