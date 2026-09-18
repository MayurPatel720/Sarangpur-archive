/**
 * Connects, reports what is there, and exits. Nothing is written.
 *
 *   npm run db:check
 *
 * Run this before `npm run seed` when something looks wrong: it separates "the
 * connection string is bad" from "the data is bad" in about two seconds, instead of
 * waiting for a 50,000-document insert to fail.
 */

import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';

function mask(uri: string): string {
  return uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');
}

async function main() {
  const uri = requireEnv('MONGODB_URI');
  console.log(`\n  target   ${mask(uri)}`);

  // Warn about the two mistakes that produce a working connection to the wrong place.
  if (/mongodb\+srv:\/\/[^/]+\/?(\?|$)/.test(uri)) {
    console.log(
      '\n  ⚠ No database name in the connection string — everything will go into a\n' +
        '    database called "test". Add /archive_tracker before the "?".\n',
    );
  }
  if (uri.includes('<') || uri.includes('>')) {
    console.log('\n  ⚠ The string still contains <angle brackets> from the Atlas template.\n');
  }

  const started = Date.now();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });
  console.log(`  connected in ${Date.now() - started} ms`);

  const db = mongoose.connection;
  console.log(`  database ${db.name}`);
  console.log(`  host     ${db.host ?? '(srv)'}\n`);

  const [users, lots, items, activity] = await Promise.all([
    User.countDocuments(),
    ArchiveLot.countDocuments(),
    LotItem.countDocuments(),
    ActivityLog.countDocuments(),
  ]);

  console.log(`  users          ${users}`);
  console.log(`  lots           ${lots}`);
  console.log(`  item profiles  ${items}`);
  console.log(`  audit entries  ${activity}\n`);

  if (lots === 0) console.log('  Empty. Run `npm run seed`.\n');
  else console.log('  Looks seeded. Run `npm run dev`.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  if (String(err).includes('ServerSelection')) {
    console.error('  Usually one of:');
    console.error('    • Atlas → Network Access does not allow your IP (use 0.0.0.0/0)');
    console.error('    • the username or password is wrong');
    console.error('    • the cluster is paused\n');
  }
  process.exit(1);
});
