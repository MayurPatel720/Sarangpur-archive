import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Coarse gate: authenticated yes/no. Written LAST (after the seed login users and
 * create-user existed) so nobody gets locked out.
 *
 * - Verifies the JWT with `getToken`, which is edge-safe. Never import mongoose or
 *   bcrypt here — the proxy runs on the edge runtime.
 * - Page requests bounce to /login (remembering where they were headed via `next`).
 * - API requests get a 401 JSON body, matching the `{ error }` contract.
 * - Fine-grained permission gates live in `handleMutation`, not here.
 */

// Health is unauthenticated so uptime checks and the login screen can poll it.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/health$/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  // getToken() defaults to the NON-secure cookie name (`authjs.session-token`)
  // unless `secureCookie` is passed — but Auth.js sets `__Secure-…` on HTTPS.
  // Localhost (HTTP) uses the plain name, Vercel (HTTPS) the secure one, so try
  // secure first and fall back. (Without this, production logins succeed and then
  // bounce to /login forever while localhost works fine.)
  const token =
    (await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: true })) ??
    (await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: false }));
  if (token) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
