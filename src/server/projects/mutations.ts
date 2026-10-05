import { Types, type ClientSession } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { can } from '@/server/permissions';
import { assertNotPast, assertRealDay, createTaskInSession } from '@/server/tasks/mutations';
import { connectToDatabase } from '@/lib/mongo';
import { Project } from '@/models/Project';
import { ArchiveLot } from '@/models/ArchiveLot';
import { ActivityLog } from '@/models/ActivityLog';
import { User } from '@/models/User';
import { withAudit, auditActor } from '@/server/audit';
import { generateProjectCode } from '@/server/codes';
import { insertLotInSession, validateLotVocab, replaceMediaLines, type LotInsertBody } from '@/server/lots/mutations';
import type {
  LotAssigneeBody,
  ProjectAddMediaInput,
  ProjectAssignBody,
  ProjectAssignResponse,
  ProjectCreateInput,
  ProjectCreateResponse,
  ProjectShared,
  ProjectSharedPatch,
  ProjectTaskBody,
  ProjectTaskInput,
  ProjectUpdateBody,
  ProjectUpdateResponse,
} from '@/types/project';
import { SHARED_KEYS } from '@/types/project';
import { shapeProjectRow } from './queries';
import {
  applySharedToLot,
  assertSharedVocab,
  fanOutShared,
  lotSharedPatch,
  mergeProjectShared,
} from './sync';

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

/* -------------------------------------------------------------------- tasks */

type TaskIn = ProjectTaskBody;

/**
 * Validates the per-format tasks of a create / add-media request BEFORE any write:
 * the `task:assign` grant (403), one task per format, each format one of the lots
 * being created, a real due date that is not in the past. Returns them keyed by format.
 */
function prepareTasks(
  tasks: ProjectTaskInput[] | undefined,
  lotFormats: string[],
  ctx: MutationContext,
  today: string | undefined,
  what: string,
): Map<string, TaskIn> {
  const out = new Map<string, TaskIn>();
  if (!tasks || tasks.length === 0) return out;
  if (!can(ctx.grants, 'task:assign')) {
    throw new HttpError(403, 'Your role cannot assign tasks. Choose only the lot owner.');
  }
  for (const raw of tasks) {
    const t = raw as TaskIn;
    const label = FORMAT_LABELS[t.format];
    if (out.has(t.format)) throw new HttpError(400, `${label} lot task: given more than once.`);
    if (!lotFormats.includes(t.format)) {
      throw new HttpError(400, `${label} lot task: ${what}`);
    }
    if (t.dueDate) {
      try {
        assertRealDay(t.dueDate);
        assertNotPast(t.dueDate, today);
      } catch (e) {
        if (e instanceof HttpError) throw new HttpError(e.status, `${label} lot task: ${e.message}`);
        throw e;
      }
    }
    out.set(t.format, t);
  }
  return out;
}

/** Task title is resolved here from the FINAL project name, never trusted from the client. */
function lotTaskTitle(format: Format, projectName: string): string {
  return `${FORMAT_LABELS[format]} lot — ${projectName}`.slice(0, 160);
}

/**
 * Creates one lot's task inside the caller's transaction (same helper as POST /api/tasks,
 * so history + notifications are written identically). A failure names the format.
 */
async function createLotTask(
  t: TaskIn,
  lot: { id: string },
  project: { id: string; name: string },
  ctx: MutationContext,
  session: ClientSession,
): Promise<string> {
  try {
    return await createTaskInSession(
      {
        title: lotTaskTitle(t.format, project.name),
        description: t.description || undefined,
        assigneeIds: t.assigneeIds,
        priority: t.priority,
        dueDate: t.dueDate,
        format: t.format,
        lotId: lot.id,
        projectId: project.id,
        checklist: t.checklist,
      },
      ctx,
      session,
    );
  } catch (e) {
    if (e instanceof HttpError) throw new HttpError(e.status, `${FORMAT_LABELS[t.format]} lot task: ${e.message}`);
    throw e;
  }
}

/* ------------------------------------------------------------------- create */

type Line = ProjectCreateInput['mediaLines'][number];

/** Groups media lines by format, keeping first-seen order (one child lot per format). */
function groupByFormat(lines: Line[]): { format: string; lines: Line[] }[] {
  const groups = new Map<string, Line[]>();
  for (const l of lines) {
    const g = groups.get(l.format);
    if (g) g.push(l);
    else groups.set(l.format, [l]);
  }
  return [...groups.entries()].map(([format, ls]) => ({ format, lines: ls }));
}

/** Project shared values → the lot-create body fields (names are identical by design). */
function sharedToLotFields(shared: ProjectShared): Omit<LotInsertBody, 'mediaLines'> {
  return { ...shared, facilitator: shared.facilitator ?? null } as Omit<LotInsertBody, 'mediaLines'>;
}

/** Strip undefined/empty so `Project.shared` only holds real values. */
function compactShared(shared: ProjectShared): ProjectShared {
  const out: Record<string, unknown> = {};
  for (const k of SHARED_KEYS) {
    const v = (shared as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out as ProjectShared;
}

export async function createProject(
  body: ProjectCreateInput,
  ctx: MutationContext,
): Promise<ProjectCreateResponse> {
  const shared = compactShared((body.shared ?? {}) as ProjectShared);
  await assertSharedVocab(shared as ProjectSharedPatch);
  const groups = groupByFormat(body.mediaLines);
  const assignments = new Map((body.assignments ?? []).map((a) => [a.format, a.assigneeId ?? null]));
  for (const f of assignments.keys()) {
    if (!groups.some((g) => g.format === f)) {
      throw new HttpError(400, `Assignment given for "${f}", but no media line uses that format.`);
    }
  }
  const taskByFormat = prepareTasks(
    body.tasks,
    groups.map((g) => g.format),
    ctx,
    body.today,
    'no media line uses that format.',
  );
  // Vocabulary is checked per child lot BEFORE the transaction opens.
  const vocabs = await Promise.all(
    groups.map((g) =>
      validateLotVocab({ ...sharedToLotFields(shared), mediaLines: g.lines } as LotInsertBody),
    ),
  );

  await connectToDatabase();
  const session = await Project.startSession();
  try {
    let id = '';
    let code = '';
    const lots: { id: string; lotReference: string; format: string }[] = [];
    const tasks: { id: string; format: string }[] = [];
    await session.withTransaction(async () => {
      lots.length = 0;
      tasks.length = 0;
      code = await generateProjectCode(session);

      const userIds = [
        ...(body.coordinatorId ? [body.coordinatorId] : []),
        ...[...assignments.values()].filter((v): v is string => Boolean(v)),
      ];
      const names = await resolveUserNames([...new Set(userIds)], session);

      const [project] = await Project.create(
        [
          {
            code,
            name: body.name.trim(),
            description: body.description?.trim() || null,
            createdBy: new Types.ObjectId(ctx.userId),
            coordinator: body.coordinatorId ? new Types.ObjectId(body.coordinatorId) : null,
            coordinatorName: body.coordinatorId ? (names.get(body.coordinatorId) ?? null) : null,
            shared,
            lotCount: 0,
          },
        ],
        { session },
      );

      for (const [i, g] of groups.entries()) {
        const assigneeId = assignments.get(g.format) ?? null;
        const lot = await insertLotInSession(
          { ...sharedToLotFields(shared), mediaLines: g.lines } as LotInsertBody,
          vocabs[i]!,
          ctx,
          session,
          {
            syncProjectId: project!._id,
            projectIds: [project!._id],
            assignee: assigneeId ? { id: assigneeId, name: names.get(assigneeId) ?? 'Unknown' } : null,
          },
        );
        lots.push({ id: lot.id, lotReference: lot.lotReference, format: lot.format });
        const t = taskByFormat.get(g.format);
        if (t) {
          const taskId = await createLotTask(t, lot, { id: String(project!._id), name: project!.name }, ctx, session);
          tasks.push({ id: taskId, format: g.format });
        }
      }
      project!.lotCount = lots.length;
      await project!.save({ session });

      await ActivityLog.create(
        [
          {
            lot: null,
            lotCode: null,
            project: project!._id,
            projectCode: code,
            kind: 'project_created',
            title: `Project ${code} created`,
            detail: `${project!.name} · ${lots.length} ${lots.length === 1 ? 'lot' : 'lots'}: ${lots
              .map((l) => l.lotReference)
              .join(', ')}`,
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
    return { id, code, lots, tasks };
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
  if (body.shared) await assertSharedVocab(body.shared);
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
      if (body.shared !== undefined) {
        const before = { ...((project.shared ?? {}) as Record<string, unknown>) };
        const next = { ...before };
        for (const [k, v] of Object.entries(body.shared)) {
          if (v === undefined) continue;
          if (v === null) delete next[k];
          else next[k] = v;
        }
        track('shared', before, next);
        project.set('shared', next);
        project.markModified('shared');
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
    // One value for the whole project: push the change to every synced child lot.
    if (body.shared && Object.keys(body.shared).length > 0) {
      const u = updated as { code: string };
      await fanOutShared(projectId, body.shared, ctx, { detail: `Edited on project ${u.code}` });
    }
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
 * Add an existing lot to a project and start syncing it. THE PROJECT WINS: the
 * project's shared values overwrite the lot's; where the project has no value for
 * a field and the lot does, the lot's value fills the project (and so every
 * sibling). Idempotent — re-adding writes no duplicate membership entries.
 * A lot already synced with a DIFFERENT project is refused.
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
    let attached = false;
    await session.withTransaction(async () => {
      attached = false;
      const [project, lot] = await Promise.all([
        Project.findById(projectId).session(session),
        ArchiveLot.findById(body.lotId).session(session),
      ]);
      if (!project) throw new HttpError(404, 'Project not found.');
      if (!lot) throw new HttpError(404, 'Lot not found.');
      if (lot.syncProjectId && String(lot.syncProjectId) !== String(project._id)) {
        throw new HttpError(409, 'This lot already shares its details with another project. Remove it from that project first.');
      }

      const names = body.assigneeId ? await resolveUserNames([body.assigneeId], session) : new Map<string, string>();
      if (body.assigneeId) {
        lot.assignee = new Types.ObjectId(body.assigneeId);
        lot.assigneeName = names.get(body.assigneeId) ?? null;
      }

      const already = (lot.projectIds ?? []).some((id) => String(id) === String(project._id));
      if (!already) {
        lot.projectIds = [...(lot.projectIds ?? []), project._id];
        project.lotCount += 1;
        await project.save({ session });
      }
      if (!lot.syncProjectId) {
        lot.syncProjectId = project._id;
        attached = true;
      }
      await lot.save({ session });

      if (!already) {
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

    if (attached) {
      // Phase 2 (own transactions, via withAudit): project values → lot, then lot-only
      // values → project → siblings.
      const project = await Project.findById(projectId).lean();
      const lotDoc = await ArchiveLot.findById(body.lotId).lean();
      if (project && lotDoc) {
        const projectShared = (project.shared ?? {}) as Record<string, unknown>;
        const lotValues = lotSharedPatch(lotDoc, SHARED_KEYS) as Record<string, unknown>;
        const fill: Record<string, unknown> = {};
        for (const k of SHARED_KEYS) {
          const has = projectShared[k] !== undefined && projectShared[k] !== null;
          const lotHas = lotValues[k] !== undefined && lotValues[k] !== null;
          if (!has && lotHas) fill[k] = lotValues[k];
        }
        if (Object.keys(projectShared).length > 0) {
          await withAudit({
            lotId: body.lotId,
            actor: auditActor(ctx),
            skipAccessCheck: true,
            kind: 'intake_updated',
            title: 'Details synced from project',
            detail: `Project ${project.code} values now apply to this lot.`,
            mutate: async (lot) => {
              applySharedToLot(lot, projectShared as ProjectSharedPatch);
              return null;
            },
          });
        }
        if (Object.keys(fill).length > 0) {
          await mergeProjectShared(project._id, fill as ProjectSharedPatch);
          await fanOutShared(project._id, fill as ProjectSharedPatch, ctx, {
            excludeLotId: body.lotId,
            detail: `Filled from lot ${lotDoc.lotReference} · project ${project.code}`,
          });
        }
      }
    }
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
        // The lot keeps the values it has now, but stops mirroring the project.
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

/* -------------------------------------------------------------- add media */

/**
 * Admin adds more media to a project. A format that already has a child lot appends
 * the new lines to it (the lot must still be in Intake); a new format creates a new
 * child lot carrying the project's shared values.
 */
export async function addProjectMedia(
  projectId: string,
  body: ProjectAddMediaInput,
  ctx: MutationContext,
): Promise<{ lots: { id: string; lotReference: string; format: string; created: boolean }[] }> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId)) throw new HttpError(404, 'Project not found.');
  const project = await Project.findById(projectId).lean();
  if (!project) throw new HttpError(404, 'Project not found.');
  const shared = (project.shared ?? {}) as ProjectShared;
  const groups = groupByFormat(body.mediaLines as Line[]);
  const assignments = new Map((body.assignments ?? []).map((a) => [a.format, a.assigneeId ?? null]));
  const out: { id: string; lotReference: string; format: string; created: boolean }[] = [];

  // Tasks are only for formats that get a NEW lot — an existing format already has its
  // owner (and possibly its task), and is never assigned a second time.
  const existingFormats = new Set(
    (await ArchiveLot.find({ syncProjectId: project._id }).select('format').lean()).map((l) => String(l.format)),
  );
  const newFormats = groups.map((g) => g.format).filter((f) => !existingFormats.has(f));
  const taskByFormat = prepareTasks(
    body.tasks,
    newFormats,
    ctx,
    body.today,
    'that format already has a lot in this project, so it cannot be assigned again.',
  );
  // Fail fast on bad assignees before any lot is written (the in-transaction check stays authoritative).
  if (taskByFormat.size > 0) {
    const ids = [...new Set([...taskByFormat.values()].flatMap((t) => t.assigneeIds))];
    const users = await User.find({ _id: { $in: ids } }).select('name active').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    for (const t of taskByFormat.values()) {
      for (const id of t.assigneeIds) {
        const u = byId.get(id);
        if (!u) throw new HttpError(400, `${FORMAT_LABELS[t.format]} lot task: Unknown assignee.`);
        if (!u.active) throw new HttpError(400, `${FORMAT_LABELS[t.format]} lot task: ${u.name} is not an active user.`);
      }
    }
  }

  for (const g of groups) {
    const existing = await ArchiveLot.findOne({ syncProjectId: project._id, format: g.format })
      .select('lotReference mediaLines __v')
      .lean();
    if (existing) {
      const lines = [
        ...((existing.mediaLines ?? []) as Line[]).map((l) => ({
          format: l.format,
          dataType: l.dataType,
          mediaSubtype: l.mediaSubtype,
          quantity: l.quantity,
          quantityRemarks: l.quantityRemarks ?? undefined,
        })),
        ...g.lines,
      ];
      await replaceMediaLines(String(existing._id), { version: existing.__v ?? 0, mediaLines: lines }, ctx);
      out.push({ id: String(existing._id), lotReference: existing.lotReference, format: g.format, created: false });
      continue;
    }
    const lotBody = { ...sharedToLotFields(shared), mediaLines: g.lines } as LotInsertBody;
    const vocab = await validateLotVocab(lotBody);
    const assigneeId = assignments.get(g.format) ?? null;
    const session = await Project.startSession();
    try {
      await session.withTransaction(async () => {
        const names = assigneeId ? await resolveUserNames([assigneeId], session) : new Map<string, string>();
        const lot = await insertLotInSession(lotBody, vocab, ctx, session, {
          syncProjectId: project._id,
          projectIds: [project._id],
          assignee: assigneeId ? { id: assigneeId, name: names.get(assigneeId) ?? 'Unknown' } : null,
        });
        await Project.updateOne({ _id: project._id }, { $inc: { lotCount: 1 } }, { session });
        const t = taskByFormat.get(g.format);
        if (t) await createLotTask(t, lot, { id: String(project._id), name: project.name }, ctx, session);
        out.push({ id: lot.id, lotReference: lot.lotReference, format: lot.format, created: true });
      });
    } finally {
      await session.endSession();
    }
  }
  return { lots: out };
}
