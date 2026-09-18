import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { describeDbError } from '@/lib/mongo';

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
  run: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const data = await run();
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
    const message = describeDbError(error);
    console.error('[api]', message);
    return NextResponse.json(
      {
        error: message,
        hint: 'Start MongoDB with `npm run db:up`, then seed it with `npm run seed`.',
      },
      { status: 503 },
    );
  }
}
