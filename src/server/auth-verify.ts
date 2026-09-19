import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/mongo';
import { User } from '@/models/User';

/**
 * Node-only credential checking (mongoose + bcrypt — never import from middleware,
 * which runs on the edge). The Credentials provider in `src/lib/auth.ts` calls this;
 * `scripts/create-user.ts` uses `hashPassword`.
 */

export interface VerifiedUser {
  id: string;
  name: string;
  roleKey: string;
}

/** Returns the session-safe user on success, null on unknown user / inactive / bad password. */
export async function verifyCredentials(identifier: string, password: string): Promise<VerifiedUser | null> {
  await connectToDatabase();
  // Username-or-email: anything containing '@' is looked up by email, everything
  // else by username. Usernames are created lowercase without '@', so the two
  // namespaces cannot collide.
  const id = identifier.toLowerCase().trim();
  const query = id.includes('@') ? { email: id } : { username: id };
  const user = await User.findOne(query).select('+passwordHash').lean();
  if (!user || !user.active || !user.passwordHash) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return { id: String(user._id), name: user.name, roleKey: user.role };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
