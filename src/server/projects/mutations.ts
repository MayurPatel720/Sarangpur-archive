import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { Project } from '@/models/Project';
import { ArchiveLot } from '@/models/ArchiveLot';
import { ActivityLog } from '@/models/ActivityLog';
import { User } from '@/models/User';
import { withAudit, auditActor } from '@/server/audit';
import { generateProjectCode } from '@/server/codes';
import type {
  LotAssigneeBody,
  ProjectAssignBody,
  ProjectAssignResponse,
  ProjectCreateInput,
  ProjectCreateResponse,
  ProjectUpdateBody,
  ProjectUpdateResponse,
} from '@/types/project';
import { shapeProjectRow } from './queries';
import { writeMembershipEntries } from './membership';

/**
 * Project writes. A project is just a name and a description that groups lots: lots keep their own
 * details and nothing is copied between a project and its lots. Every mutation runs in a transaction
 * that applies the change AND writes the ActivityLog entries — the same all-or-nothing contract as
 * `withAudit()` (withAudit itself is lot-scoped, so project-level entries are written here directly).
 *
 * Membership events are written TWICE: once on the lot's trail and once on the project's trail
 * (see `membership.ts`). Project create/update entries belong to no lot (`lot: null`).
 */

/* ------------------------------------------------------------------- create */

export async function createProject(
  body: ProjectCreateInput,
  ctx: MutationContext,
): Promise<ProjectCreateResponse> {
  await connectToDatabase();
  const session = await Project.startSession();
  try {
    let id = '';
    let code = '';
    await session.withTransaction(async () => {
      code = await generateProjectCode(session);
      const [project] = await Project.create(
        [
          {
            code,
            name: body.name.trim(),
            description: body.description?.trim() || null,
            createdBy: new Types.ObjectId(ctx.userId),
            lotCount: 0,
          },
        ],
        { session },
      );
      await ActivityLog.create(
        [
          {
            lot: null,
            lotCode: null,
            project: project!._id,
            projectCode: code,
            kind: 'project_created',
            title: `Project ${code} created`,
            detail: project!.name,
            actor: new Types.ObjectId(ctx.userId),
            actorName: ctx.userName,
            at: new Date(),
            changes: [],
          },
        ],
        { session },
      );
      id = String(project!._id);
    });
    return { id, code };
  } finally {
    await session.endSession();
  }
}

/* ------------------------------------------------------------------- update */

export async function updateProject(
  projectId: string,
  body: ProjectUpdateBody,
  ctx: MutationContext,
): Promise<ProjectUpdateResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId)) throw new HttpError(404, 'Project not found.');
  const session = await Project.startSession();
  try {
    let updated: Parameters<typeof shapeProjectRow>[0] | null = null;
    await session.withTransaction(async () => {
      const project = await Project.findById(projectId).session(session);
      if (!project) throw new HttpError(404, 'Project not found.');

      // Code is immutable: it is the stable identity quoted in denormalised
      // history, and history must never be rewritten (rule 5).
      const changes: { field: string; from: unknown; to: unknown }[] = [];
      const track = (field: string, from: unknown, to: unknown) => {
        if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
      };

      if (body.name !== undefined) {
        track('name', project.name, body.name.trim());
        project.name = body.name.trim();
      }
      if (body.description !== undefined) {
        const next = body.description?.trim() || null;
        track('description', project.description ?? null, next);
        project.description = next;
      }

      await project.save({ session });
      await ActivityLog.create(
        [
          {
            lot: null,
            lotCode: null,
            project: project._id,
            projectCode: project.code,
            kind: 'project_updated',
            title: `Project ${project.code} updated`,
            detail: null,
            actor: new Types.ObjectId(ctx.userId),
            actorName: ctx.userName,
            at: new Date(),
            changes,
          },
        ],
        { session },
      );
      updated = project.toObject();
    });

    if (!updated) throw new HttpError(404, 'Project not found.');
    return shapeProjectRow(updated);
  } finally {
    await session.endSession();
  }
}

/* --------------------------------------------------------------- membership */

/** Add an existing lot to a project. Idempotent — re-adding writes no duplicate membership entries. */
export async function assignLot(
  projectId: string,
  body: ProjectAssignBody,
  ctx: MutationContext,
): Promise<ProjectAssignResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId) || !Types.ObjectId.isValid(body.lotId)) {
    throw new HttpError(404, 'Project or lot not found.');
  }
  const session = await Project.startSession();
  try {
    let result!: ProjectAssignResponse;
    await session.withTransaction(async () => {
      const [project, lot] = await Promise.all([
        Project.findById(projectId).session(session),
        ArchiveLot.findById(body.lotId).session(session),
      ]);
      if (!project) throw new HttpError(404, 'Project not found.');
      if (!lot) throw new HttpError(404, 'Lot not found.');

      const already = (lot.projectIds ?? []).some((id) => String(id) === String(project._id));
      if (!already) {
        lot.projectIds = [...(lot.projectIds ?? []), project._id];
        await lot.save({ session });
        project.lotCount += 1;
        await project.save({ session });

        const lotCode = lot.namingCode ?? lot.lotReference;
        await writeMembershipEntries(session, {
          lotId: lot._id,
          lotCode,
          format: lot.format ?? null,
          projectId: project._id,
          projectCode: project.code,
          projectName: project.name,
          kind: 'project_lot_added',
          title: `Lot ${lotCode} added to project ${project.code}`,
          detail: project.name,
          actor: ctx,
        });
      }
      result = { projectId: String(project._id), lotId: String(lot._id), lotCount: project.lotCount };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function unassignLot(
  projectId: string,
  lotId: string,
  ctx: MutationContext,
): Promise<ProjectAssignResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId) || !Types.ObjectId.isValid(lotId)) {
    throw new HttpError(404, 'Project or lot not found.');
  }
  const session = await Project.startSession();
  try {
    let result!: ProjectAssignResponse;
    await session.withTransaction(async () => {
      const [project, lot] = await Promise.all([
        Project.findById(projectId).session(session),
        ArchiveLot.findById(lotId).session(session),
      ]);
      if (!project) throw new HttpError(404, 'Project not found.');
      if (!lot) throw new HttpError(404, 'Lot not found.');

      const member = (lot.projectIds ?? []).some((id) => String(id) === String(project._id));
      if (member) {
        lot.projectIds = (lot.projectIds ?? []).filter(
          (id) => String(id) !== String(project._id),
        );
        // Older lots may still carry a sync link to this project: drop it too.
        if (lot.syncProjectId && String(lot.syncProjectId) === String(project._id)) {
          lot.syncProjectId = null;
        }
        await lot.save({ session });
        project.lotCount = Math.max(0, project.lotCount - 1);
        await project.save({ session });

        const lotCode = lot.namingCode ?? lot.lotReference;
        await writeMembershipEntries(session, {
          lotId: lot._id,
          lotCode,
          format: lot.format ?? null,
          projectId: project._id,
          projectCode: project.code,
          projectName: project.name,
          kind: 'project_lot_removed',
          title: `Lot ${lotCode} removed from project ${project.code}`,
          detail: project.name,
          actor: ctx,
        });
      }
      result = { projectId: String(project._id), lotId: String(lot._id), lotCount: project.lotCount };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/* ----------------------------------------------------------------- assignee */

/** Set or clear a lot's assignee (admin only, route-gated by `project:assign`). */
export async function setLotAssignee(
  lotId: string,
  body: LotAssigneeBody,
  ctx: MutationContext,
): Promise<{ lotId: string; assigneeId: string | null; assigneeName: string | null }> {
  await connectToDatabase();
  let name: string | null = null;
  if (body.assigneeId) {
    const u = await User.findById(body.assigneeId).select('name').lean();
    if (!u) throw new HttpError(400, 'Unknown user selected.');
    name = u.name as string;
  }
  await withAudit({
    lotId,
    actor: auditActor(ctx),
    kind: 'lot_assigned',
    title: name ? `Assigned to ${name}` : 'Assignee removed',
    mutate: async (lot) => {
      lot.assignee = body.assigneeId ? new Types.ObjectId(body.assigneeId) : null;
      lot.assigneeName = name;
      return null;
    },
  });
  return { lotId, assigneeId: body.assigneeId, assigneeName: name };
}
