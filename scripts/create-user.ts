/**
 * Creates (or resets the password of) a real login user.
 *
 *   npx tsx scripts/create-user.ts <username> "<Full Name>" <role> <password>
 *
 * The role must already exist and be active in the `roles` collection. The password
 * is never logged. Seed users get the dev password from seed-data.ts; this script is
 * for real accounts after seeding.
 */

import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { hashPassword } from '../src/server/auth-verify';
import { Role } from '../src/models/Role';
import { User } from '../src/models/User';

function usage(): never {
  console.error('Usage: npx tsx scripts/create-user.ts <username> "<Full Name>" <role> <password>');
  process.exit(1);
}

function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return initials || 'U';
}

async function main() {
  const [username, name, role, password] = process.argv.slice(2);
  if (!username || !name || !role || !password) usage();
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const uri = requireEnv('MONGODB_URI');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });

  const roleDoc = await Role.findOne({ key: role });
  if (!roleDoc) {
    console.error(`Unknown role '${role}'. Seed the database first with \`npm run seed\`.`);
    process.exit(1);
  }
  if (!roleDoc.active) {
    console.error(`Role '${role}' is deactivated. Reactivate it in /admin/roles first.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const doc = await User.findOneAndUpdate(
    { username: username.toLowerCase().trim() },
    {
      $set: {
        name: name.trim(),
        initials: initialsOf(name),
        role,
        passwordHash,
        active: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`✓ user '${doc.username}' ready — name '${doc.name}', role '${doc.role}'.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
