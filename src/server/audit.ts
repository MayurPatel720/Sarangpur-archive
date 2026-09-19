import type { ClientSession, HydratedDocument } from 'mongoose';
import type { ActivityKind } from '@/lib/domain';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { ActivityLog } from '@/models/ActivityLog';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';

/**
 * The ONLY way to mutate a lot (AGENTS.md rule 1). In one transaction it:
 *
 * 1. Loads the lot inside the session (404 when missing).
 * 2. Runs `mutate`, which applies the change to the in-memory document.
 * 3. When `stage` changed, stamps `stageEnteredAt`.
 * 4. Saves the lot.
 * 5. Inserts an `ActivityLog` with denormalised `lotCode` (= namingCode ?? lotReference)
 *    and `actorName` (or 'System'), plus a `changes[]` diff of modified paths.
 *
 * A change with no audit trail is a bug — route handlers must not call `.save()` on
 * ArchiveLot directly.
 */

export interface AuditActor {
  id: string;
  name: string;
}

interface ChangeEntry {
  field: string;
  from: unknown;
  to: unknown;
}

/** Shallow JSON-safe diff of the lot's modified paths against a pre-mutate snapshot. */
function diffLot(
  before: Record<string, unknown>,
  lot: HydratedDocument<ArchiveLotDoc>,
  modifiedPaths: string[],
): ChangeEntry[] {
  const after = lot.toObject() as Record<string, unknown>;
  const changes: ChangeEntry[] = [];

  for (const path of modifiedPaths) {
    // Skip noisy internals; the stage transition itself is the signal, not updatedAt.
    if (path === 'updatedAt') continue;
    const top = path.split('.')[0] as string;
    if (changes.some((c) => c.field === top)) continue;
    let from: unknown = before[top];
    let to: unknown = after[top];
    try {
      from = JSON.parse(JSON.stringify(from)) ?? null;
      to = JSON.parse(JSON.stringify(to)) ?? null;
    } catch {
      from = String(from);
      to = String(to);
    }
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field: top, from, to });
    }
    if (changes.length >= 50) break;
  }

  return changes;
}

export async function withAudit<T>(opts: {
  lotId: string;
  actor: AuditActor | null;
  kind: ActivityKind;
  title: string;
  detail?: string;
  /** Runs inside the transaction. Applies the change; returns the handler's payload. */
  mutate: (lot: HydratedDocument<ArchiveLotDoc>, session: ClientSession) => Promise<T>;
}): Promise<T> {
  await connectToDatabase();
  const session = await ArchiveLot.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      const lot = await ArchiveLot.findById(opts.lotId).session(session);
      if (!lot) throw new HttpError(404, 'Lot not found.');

      const stageBefore = lot.stage;
      const before = JSON.parse(JSON.stringify(lot.toObject())) as Record<string, unknown>;

      result = await opts.mutate(lot, session);

      if (lot.stage !== stageBefore) {
        lot.stageEnteredAt = new Date();
      }
      // Capture BEFORE save: save() clears modifiedPaths(), which would leave changes[] empty.
      const modifiedPaths = lot.modifiedPaths();
      try {
        await lot.save({ session });
      } catch (error) {
        // Lost an optimistic-concurrency race inside the transaction window:
        // someone else's write landed between our read and our save.
        if (error instanceof Error && error.name === 'VersionError') {
          throw new HttpError(
            409,
            'This record changed since you opened it. Reload and try again.',
          );
        }
        throw error;
      }

      await ActivityLog.create(
        [
          {
            lot: lot._id,
            lotCode: lot.namingCode ?? lot.lotReference,
            kind: opts.kind,
            title: opts.title,
            detail: opts.detail,
            actor: opts.actor ? opts.actor.id : null,
            actorName: opts.actor ? opts.actor.name : 'System',
            at: new Date(),
            changes: diffLot(before, lot, modifiedPaths),
          },
        ],
        { session },
      );
    });
    return result;
  } finally {
    await session.endSession();
  }
}
