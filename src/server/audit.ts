import { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import type { ActivityKind, NotificationKind } from '@/lib/domain';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { ActivityLog } from '@/models/ActivityLog';
import { Task, type TaskDoc } from '@/models/Task';
import { Notification } from '@/models/Notification';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import { assertCanWorkLot } from '@/server/lots/access';

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
  /**
   * The actor's live grants. When present, `withAudit` enforces the assignee rule
   * (only the assignee or a `project:assign` holder may mutate an assigned /
   * project-synced lot). System actors omit it and are never restricted.
   */
  grants?: string[];
}

/** Build the audit actor from a route's mutation context (carries grants for the assignee rule). */
export function auditActor(ctx: { userId: string; userName: string; grants: string[] }): AuditActor {
  return { id: ctx.userId, name: ctx.userName, grants: ctx.grants };
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
  /**
   * Skip the assignee rule. Only for fan-out writes whose authority was already
   * verified on the originating record (shared-field sync to sibling lots).
   */
  skipAccessCheck?: boolean;
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

      if (!opts.skipAccessCheck && opts.actor?.grants) {
        assertCanWorkLot(lot, { id: opts.actor.id, grants: opts.actor.grants });
      }

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
            // Denormalised at write time for the format-scoped activity feed —
            // same contract as actorName/lotCode: never back-filled on rename.
            format: lot.format ?? null,
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

/* -------------------------------------------------------------------- tasks */

export interface TaskAuditEntry {
  kind: ActivityKind;
  title: string;
  detail?: string;
  changes?: ChangeEntry[];
}

/** A per-user inbox entry raised by the same change. The actor is never notified of their own action. */
export interface TaskNotice {
  userId: string;
  kind: NotificationKind;
  text: string;
}

/**
 * `withAudit()` for tasks. `withAudit` itself is lot-scoped, so — like the project
 * mutations — task events get their own wrapper with the same all-or-nothing contract:
 * in one transaction it (1) loads the task (404; skipped for a create), (2) runs
 * `mutate`, which changes the document and returns the audit `entries` and any
 * notifications, (3) saves the task, (4) inserts the `ActivityLog` rows (task set,
 * actorName denormalised) and (5) inserts the `Notification` rows.
 *
 * For a create, omit `taskId` and have `mutate` return a `new Task(...)`.
 */
export async function withTaskAudit<T>(opts: {
  taskId?: string;
  actor: AuditActor;
  mutate: (
    task: HydratedDocument<TaskDoc> | null,
    session: ClientSession,
  ) => Promise<{
    task: HydratedDocument<TaskDoc>;
    result: T;
    entries: TaskAuditEntry[];
    notices?: TaskNotice[];
  }>;
}): Promise<T> {
  await connectToDatabase();
  const session = await Task.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      let existing: HydratedDocument<TaskDoc> | null = null;
      if (opts.taskId !== undefined) {
        existing = Types.ObjectId.isValid(opts.taskId)
          ? await Task.findById(opts.taskId).session(session)
          : null;
        if (!existing) throw new HttpError(404, 'Task not found.');
      }

      const out = await opts.mutate(existing, session);
      result = out.result;

      try {
        await out.task.save({ session });
      } catch (error) {
        if (error instanceof Error && error.name === 'VersionError') {
          throw new HttpError(409, 'This task changed since you opened it. Reload and try again.');
        }
        throw error;
      }

      const at = new Date();
      if (out.entries.length > 0) {
        await ActivityLog.create(
          out.entries.map((e) => ({
            task: out.task._id,
            taskTitle: out.task.title,
            kind: e.kind,
            title: e.title,
            detail: e.detail,
            actor: new Types.ObjectId(opts.actor.id),
            actorName: opts.actor.name,
            at,
            changes: e.changes ?? [],
          })),
          { session, ordered: true },
        );
      }

      const notices = (out.notices ?? []).filter((n) => n.userId !== opts.actor.id);
      if (notices.length > 0) {
        await Notification.create(
          notices.map((n) => ({
            user: new Types.ObjectId(n.userId),
            kind: n.kind,
            task: out.task._id,
            taskTitle: out.task.title,
            text: n.text,
            actorName: opts.actor.name,
          })),
          { session, ordered: true },
        );
      }
    });
    return result;
  } finally {
    await session.endSession();
  }
}
