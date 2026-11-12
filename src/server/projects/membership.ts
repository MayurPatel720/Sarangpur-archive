import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { ActivityLog } from '@/models/ActivityLog';
import { Project } from '@/models/Project';

/**
 * Project membership writes shared by the project routes and the intake (a lot created from a project
 * joins it in the same transaction). Kept free of other server modules so both sides can import it.
 *
 * Membership events are written TWICE: once on the lot's trail (lot set) and once on the project's
 * trail (project set), so both histories stay complete.
 */
export async function writeMembershipEntries(
  session: ClientSession,
  opts: {
    lotId: Types.ObjectId;
    lotCode: string;
    format: string | null;
    projectId: Types.ObjectId;
    projectCode: string;
    projectName: string;
    kind: 'project_lot_added' | 'project_lot_removed';
    title: string;
    detail: string;
    actor: MutationContext;
  },
): Promise<void> {
  const actorId = new Types.ObjectId(opts.actor.userId);
  const at = new Date();
  await ActivityLog.create(
    [
      {
        // Lot-side trail: which project the lot joined/left.
        lot: opts.lotId,
        lotCode: opts.lotCode,
        format: opts.format,
        project: opts.projectId,
        projectCode: opts.projectCode,
        kind: opts.kind,
        title: opts.title,
        detail: opts.detail,
        actor: actorId,
        actorName: opts.actor.userName,
        at,
        changes: [],
      },
      {
        // Project-side trail: which lot joined/left.
        lot: null,
        lotCode: null,
        format: null,
        project: opts.projectId,
        projectCode: opts.projectCode,
        kind: opts.kind,
        title: opts.title,
        detail: opts.detail,
        actor: actorId,
        actorName: opts.actor.userName,
        at,
        changes: [],
      },
    ],
    // `ordered: true` is required by Mongoose 7/8 when create() gets an array together with a session.
    { session, ordered: true },
  );
}

/** The project a new lot will join: it must exist (checked before the transaction opens). */
export async function requireProject(projectId: string): Promise<{ id: Types.ObjectId; code: string; name: string }> {
  if (!Types.ObjectId.isValid(projectId)) throw new HttpError(404, 'Project not found.');
  const p = await Project.findById(projectId).select('code name').lean();
  if (!p) throw new HttpError(404, 'Project not found.');
  return { id: p._id as Types.ObjectId, code: p.code, name: p.name };
}

/**
 * Counts lots just created (already carrying `projectIds`) into their project and writes the
 * membership entries. Runs inside the caller's transaction.
 */
export async function recordNewLotsInProject(
  session: ClientSession,
  project: { id: Types.ObjectId; code: string; name: string },
  lots: { id: string; lotReference: string; format: string }[],
  ctx: MutationContext,
): Promise<void> {
  if (lots.length === 0) return;
  await Project.updateOne({ _id: project.id }, { $inc: { lotCount: lots.length } }, { session });
  for (const lot of lots) {
    await writeMembershipEntries(session, {
      lotId: new Types.ObjectId(lot.id),
      lotCode: lot.lotReference,
      format: lot.format,
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      kind: 'project_lot_added',
      title: `Lot ${lot.lotReference} added to project ${project.code}`,
      detail: project.name,
      actor: ctx,
    });
  }
}
