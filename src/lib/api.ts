import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { describeDbError } from '@/lib/mongo';

/**
 * Throw MANUALLY for expected failure modes (404 missing lot, 409 version conflict,
 * 400 bad input, 403 denied). Both `handleQuery` and `handleMutation` translate these
 * to their status; anything else is a 503 database/unexpected failure.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** Maps an unknown throw to its `{ status, error }` response shape. */
function toErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof HttpError) return { status: error.status, error: error.message };
  return { status: 503, error: describeDbError(error) };
}

/**
 * Wraps a dashboard query so every route handler behaves the same way:
 *
 *  - the response is validated against its Zod contract before it leaves the server,
 *    so a broken aggregation fails here rather than rendering as `NaN` in the browser;
 *  - database errors come back as a 503 with an actionable hint instead of a stack
 *    trace, because the most common cause in development is Mongo not running;
 *  - nothing is cached — these are live operational numbers.
 */
export async function handleQuery<T>(
  schema: ZodType<T>,
  run: (ctx: MutationContext | null) => Promise<T>,
  opts?: {
    /** Require a session and enforce this permission → 401/403. Loads live grants. */
    permission?: import('@/server/permissions').Permission;
    /** Require a session (no permission check) and pass its live grants to `run`. */
    session?: boolean;
  },
): Promise<NextResponse> {
  try {
    const ctx = opts?.permission || opts?.session ? await authorize(opts.permission) : null;
    const data = await run(ctx);
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      console.error('[api] response failed its own contract:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'The server produced a malformed response.' },
        { status: 500 },
      );
    }

    return NextResponse.json(parsed.data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const { status, error: message } = toErrorResponse(error);
    console.error('[api]', message);
    return NextResponse.json(
      {
        error: message,
        hint:
          status === 503
            ? 'Start MongoDB with `npm run db:up`, then seed it with `npm run seed`.'
            : undefined,
      },
      { status },
    );
  }
}

/**
 * The write counterpart to `handleQuery`. Every mutation route delegates here so auth,
 * permission checks and body/response contracts behave identically:
 *
 * 1. Parses and Zod-validates the JSON body → 400.
 * 2. Requires a session → 401.
 * 3. Loads the caller's LIVE role grants from the database and requires
 *    `permission` → 403. Grants are read per request, never trusted from the JWT,
 *    so revoking a permission takes effect instantly.
 * 4. Runs `run`, Zod-validates its return → 500 on contract breach.
 */
export interface MutationContext {
  userId: string;
  userName: string;
  roleKey: string;
  grants: string[];
}

/**
 * Shared session + live-grants gate. Sessions prove identity; the role's CURRENT
 * grants are read from the database per request, never trusted from the JWT, so
 * revoking a permission takes effect instantly.
 *
 * Imported lazily by callers so `lib/api.ts` stays importable from scripts and
 * tests that never touch auth.
 */
async function authorize(
  permission?: import('@/server/permissions').Permission,
): Promise<MutationContext> {
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  if (!session?.user?.id || !session.user.roleKey) {
    throw new HttpError(401, 'Sign in to continue.');
  }

  const { Role } = await import('@/models/Role');
  const { can } = await import('@/server/permissions');
  const { connectToDatabase } = await import('@/lib/mongo');
  await connectToDatabase();
  const roleDoc = await Role.findOne({ key: session.user.roleKey }).lean();
  if (!roleDoc || !roleDoc.active) {
    throw new HttpError(403, 'Your role is no longer active.');
  }
  if (permission && !can(roleDoc.permissions, permission)) {
    throw new HttpError(403, 'Your role does not allow this action.');
  }

  return {
    userId: session.user.id,
    userName: session.user.name ?? 'Unknown',
    roleKey: session.user.roleKey,
    grants: roleDoc.permissions,
  };
}

export async function handleMutation<TBody, T>(
  req: Request,
  bodySchema: ZodType<TBody>,
  responseSchema: ZodType<T>,
  opts: {
    permission: import('@/server/permissions').Permission;
    run: (body: TBody, ctx: MutationContext) => Promise<T>;
  },
): Promise<NextResponse> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new HttpError(400, 'Request body must be JSON.');
    }

    const parsedBody = bodySchema.safeParse(raw);
    if (!parsedBody.success) {
      const first = parsedBody.error.issues[0];
      throw new HttpError(
        400,
        first ? `Invalid request body: ${first.path.join('.') || 'body'} — ${first.message}` : 'Invalid request body.',
      );
    }

    const ctx = await authorize(opts.permission);

    const data = await opts.run(parsedBody.data, ctx);
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) {
      console.error('[api] mutation response failed its own contract:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'The server produced a malformed response.' },
        { status: 500 },
      );
    }

    return NextResponse.json(parsed.data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const { status, error: message } = toErrorResponse(error);
    console.error('[api]', message);
    return NextResponse.json({ error: message }, { status });
  }
}
