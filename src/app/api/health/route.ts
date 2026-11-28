import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { FileIndex } from '@/models/FileIndex';
import { serverHealthResponseSchema } from '@/types/health';

export const dynamic = 'force-dynamic';

function deriveServerLabel(uri: string): string {
  try {
    const url = new URL(uri.replace('mongodb+srv://', 'https://'));
    const host = url.hostname || url.host;
    if (host.includes('mongodb.net') || host.includes('mongo')) {
      const cluster = host.split('.')[0];
      return `Atlas · ${cluster}`;
    }
    if (host === 'localhost' || host === '127.0.0.1') return 'Local';
    return host;
  } catch {
    return 'MongoDB';
  }
}

async function readStorage() {
  // Single $group over FileIndex. Fine at current scale; move to a materialised
  // counter when FileIndex reaches millions of rows (20 clients poll every 30s).
  const agg = await FileIndex.aggregate<{ bytes: number; files: number }>([
    { $group: { _id: null, bytes: { $sum: '$sizeBytes' }, files: { $sum: 1 } } },
  ]);
  const indexed = agg[0];
  return {
    indexedBytes: indexed?.bytes ?? 0,
    indexedFiles: indexed?.files ?? 0,
  };
}

export async function GET() {
  const start = performance.now();

  try {
    const mongoose = await connectToDatabase();
    const dbName = mongoose.connection.db?.databaseName ?? 'unknown';

    // Ping the database to verify it's actually responsive
    await mongoose.connection.db?.command({ ping: 1 });

    const latencyMs = Math.round(performance.now() - start);
    const uri = process.env.MONGODB_URI ?? '';

    const data = {
      status: latencyMs > 2000 ? ('degraded' as const) : ('healthy' as const),
      server: deriveServerLabel(uri),
      latencyMs,
      dbName,
      storage: await readStorage(),
    };

    const parsed = serverHealthResponseSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Malformed health response' }, { status: 500 });
    }

    return NextResponse.json(parsed.data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    const latencyMs = Math.round(performance.now() - start);
    const uri = process.env.MONGODB_URI ?? '';

    return NextResponse.json(
      {
        status: 'down' as const,
        server: deriveServerLabel(uri),
        latencyMs,
        dbName: 'unknown',
        storage: {
          indexedBytes: 0,
          indexedFiles: 0,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
