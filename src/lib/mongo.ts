import mongoose from 'mongoose';

/**
 * Cached MongoDB connection.
 *
 * Next.js reloads server modules on every change in development, and serverless-style
 * handlers can be invoked concurrently in production. Without a cache each of those
 * would open its own connection pool and exhaust the server's connection limit, so the
 * promise is stashed on globalThis and reused.
 */

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __archiveTrackerMongoose: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.__archiveTrackerMongoose ?? {
  conn: null,
  promise: null,
};
globalThis.__archiveTrackerMongoose = cached;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local, then run `npm run db:up`.',
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      // Fail fast in development rather than hanging for 30s when Mongo is not running.
      // 15s (not 5s): TLS handshake to Atlas from this environment takes ~5.2s
      // consistently (middlebox delay), so 5s makes every fresh connection fail.
      serverSelectionTimeoutMS: 15_000,
      // On a long-lived server one process serves everyone, so a pool of 10 is right.
      // On Vercel every concurrent invocation is its own process holding its own pool,
      // so keep it small — Atlas M0 allows 500 connections in total and a traffic spike
      // will otherwise exhaust them.
      maxPoolSize: process.env.VERCEL ? 5 : 10,
      // Mongoose 7+ default, set explicitly so the behaviour is obvious to readers.
      autoIndex: process.env.NODE_ENV !== 'production',
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the promise so the next request retries instead of reusing a rejected one.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

/** Narrow `unknown` errors into a message safe to show in an API response. */
export function describeDbError(error: unknown): string {
  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    return 'Cannot reach MongoDB. Is it running? Try `npm run db:up`.';
  }
  if (error instanceof Error) return error.message;
  return 'Unknown database error';
}
