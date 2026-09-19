import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

/**
 * Auth.js v5 (NextAuth beta) configuration. JWT sessions, credentials only — no
 * OAuth providers for an internal tool on a LAN-adjacent deployment.
 *
 * Two freshness rules to keep in mind:
 *
 * 1. The JWT carries `id` + `roleKey` for UI gating ONLY. Mutations never trust it:
 *    `handleMutation` loads the role's live grants from the database per request.
 * 2. This file must stay edge-importable (middleware reads the session via
 *    `getToken` instead, but the config itself is shared). Credential verification
 *    pulls in mongoose/bcrypt, so `authorize` imports it LAZILY.
 */

declare module 'next-auth' {
  interface User {
    roleKey: string;
  }
  interface Session {
    user: { id: string; roleKey: string } & DefaultSession['user'];
  }
}

/** Extra fields carried on the JWT. Kept local (rather than module augmentation of
 * an internal path) because the beta package does not expose a stable jwt module. */
interface SessionToken {
  id?: unknown;
  roleKey?: unknown;
}

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Username or email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { verifyCredentials } = await import('@/server/auth-verify');
        const user = await verifyCredentials(parsed.data.identifier, parsed.data.password);
        if (!user) return null;
        return { id: user.id, name: user.name, roleKey: user.roleKey };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleKey = user.roleKey;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as SessionToken;
      if (typeof t.id === 'string') session.user.id = t.id;
      if (typeof t.roleKey === 'string') session.user.roleKey = t.roleKey;
      return session;
    },
  },
});
