import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { Project } from '@/models/Project';
import { ArchiveLot } from '@/models/ArchiveLot';
import { ActivityLog } from '@/models/ActivityLog';
import { User } from '@/models/User';
import type {
  ProjectAssignBody,
  ProjectAssignResponse,
  ProjectCreateInput,
  ProjectCreateResponse,
  ProjectUpdateBody,
  ProjectUpdateResponse,
} from '@/types/project';
import { shapeProjectRow } from './queries';

/**
 * Project writes. Every mutation runs in a transaction that applies the change
 * AND writes the ActivityLog entries — the same all-or-nothing contract as
 * `withAudit()` (withAudit itself is lot-scoped, so project-level entries are
 * written here directly, modelled on `createIntake`'s own transaction).
 *
 * Membership events are written TWICE: once on the lot's trail (lot set) and
 * once on the project's trail (project set), so both histories stay complete.
 * Project create/update entries belong to no lot (`lot: null`).
 */

/** Resolve user ids to names, rejecting unknown ids. Inactive users are allowed. */
async function resolveUserNames(
  ids: string[],
  session: ClientSession,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await User.find({ _id: { $in: ids } })
    .select('name')
    .session(session)
    .lean();
  const names = new Map(docs.map((u) => [String(u._id), u.name as string]));
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length > 0) throw new HttpError(400, 'Unknown user selected.');
  return names;
}

/* ------------------------------------------------------------------- create */

export async function createProject(
  body: ProjectCreateInput,
  ctx: MutationContext,
): Promise<ProjectCreateResponse> {
  await connectToDatabase();
  const session = await Project.startSession();
  try {
    let id = '';
    await session.withTransaction(async () => {
      const code = body.code.trim();
      const existing = await Project.findOne({ code }).session(session).lean();
      if (existing) throw new HttpError(409, `Project code "${code}" is already in use.`);

      const memberIds = [
        ...(body.coordinatorId ? [body.coordinatorId] : []),
        ...(body.team ?? []).map((t) => t.userId),
      ];
      const names = await resolveUserNames([...new Set(memberIds)], session);

      const [project] = await Project.create(
        [
          {
            code,
            name: body.name.trim(),
            description: body.description?.trim() || null,
            createdBy: new Types.ObjectId(ctx.userId),
            coordinator: body.coordinatorId ? new Types.ObjectId(body.coordinatorId) : null,
            coordinatorName: body.coordinatorId
              ? (names.get(body.coordinatorId) ?? null)
              : null,
            team: (body.team ?? []).map((t) => ({
              user: new Types.ObjectId(t.userId),
              label: t.label?.trim() || null,
            })),
            startDate: body.startDate ? new Date(body.startDate) : null,
            targetDate: body.targetDate ? new Date(body.targetDate) : null,
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
    const created = await Project.findById(id).select('code').lean();
    return { id, code: created!.code };
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
      if (body.coordinatorId !== undefined) {
        if (body.coordinatorId) {
          const names = await resolveUserNames([body.coordinatorId], session);
          track('coordinator', project.coordinatorName ?? null, names.get(body.coordinatorId));
          project.coordinator = new Types.ObjectId(body.coordinatorId);
          project.coordinatorName = names.get(body.coordinatorId) ?? null;
        } else {
          track('coordinator', project.coordinatorName ?? null, null);
          project.coordinator = null;
          project.coordinatorName = null;
        }
      }
      if (body.team !== undefined) {
        await resolveUserNames(
          [...new Set(body.team.map((t) => t.userId))],
          session,
        );
        const next = body.team.map((t) => ({
          user: new Types.ObjectId(t.userId),
          label: t.label?.trim() || null,
        }));
        track(
          'team',
          project.team.map((t) => String(t.user)),
          body.team.map((t) => t.userId),
        );
        project.set('team', next);
      }
      if (body.startDate !== undefined) {
        const next = body.startDate ? new Date(body.startDate) : null;
        track('startDate', project.startDate?.toISOString() ?? null, next?.toISOString() ?? null);
        project.startDate = next;
      }
      if (body.targetDate !== undefined) {
        const next = body.targetDate ? new Date(body.targetDate) : null;
        track('targetDate', project.targetDate?.toISOString() ?? null, next?.toISOString() ?? null);
        project.targetDate = next;
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

async function writeMembershipEntries(
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
    // `ordered: true` is required by Mongoose 7/8 when create() gets an array
    // together with a session.
    { session, ordered: true },
  );
}

/**
 * Add a lot to a project. Idempotent — re-adding writes no duplicate entries.
 * Removing the lot's last project is allowed silently: it becomes standalone.
 */
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
