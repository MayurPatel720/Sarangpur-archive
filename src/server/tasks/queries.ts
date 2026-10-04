import { Types, type PipelineStage } from 'mongoose';
import {
  ACTIVITY_SEVERITY,
  STAGE_ACTION_LABELS,
  TASK_OPEN_STATUSES,
  WORK_ON_LOT_VERB,
  type ActivityKind,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/domain';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError, type MutationContext } from '@/lib/api';
import { ActivityLog } from '@/models/ActivityLog';
import { ArchiveLot } from '@/models/ArchiveLot';
import { Task } from '@/models/Task';
import { can } from '@/server/permissions';
import { getStageGraph, type StageGraph } from '@/server/reference/runtime';
import {
  taskListPipeline,
  taskMatch,
  taskPanelPipeline,
  taskPeoplePipeline,
  type Pipeline,
  type TaskFilter,
} from './pipelines';
import type {
  DerivedTask,
  TaskDetailResponse,
  TaskListQuery,
  TaskListResponse,
  TaskPanelQuery,
  TaskPanelResponse,
  TaskRow,
} from '@/types/task';

/** Single cast from plain-data pipelines to Mongoose stages (rule 2). */
const asPipeline = (p: Pipeline): PipelineStage[] => p as unknown as PipelineStage[];

const oid = (id: string) => new Types.ObjectId(id);

/** Per-group cap in the panel; the true total rides alongside so the UI can say "+N more". */
const PANEL_GROUP_CAP = 25;
/** A finished task stays in "Done recently" for 24 hours, then drops off the panel. */
const RECENT_DONE_DAYS = 1;
const DERIVED_CAP = 15;

/** The caller's calendar day (sent by the browser), else the server's UTC day. */
export function resolveToday(today?: string): string {
  return today ?? new Date().toISOString().slice(0, 10);
}

export function isTaskAdmin(ctx: MutationContext): boolean {
  return can(ctx.grants, 'task:viewAll');
}

export function requireCtx(ctx: MutationContext | null): MutationContext {
  if (!ctx) throw new HttpError(401, 'Sign in to continue.');
  return ctx;
}

/** Fields the shape/permission helpers read, satisfied by both lean docs and aggregate rows. */
interface TaskLike {
  _id: unknown;
  title: string;
  format: string;
  status: string;
  blockedReason?: string | null;
  priority: string;
  dueDate?: string | null;
  assignees?: { id: unknown; name: string }[];
  /** Pre-migration shape (see scripts/backfill-task-assignees.ts); read-tolerated only. */
  assignee?: unknown;
  assigneeName?: string;
  createdBy: unknown;
  createdByName: string;
  lot?: unknown;
  lotCode?: string | null;
  project?: unknown;
  projectCode?: string | null;
  checklistTotal?: number;
  checklistDone?: number;
  commentCount?: number;
  doneAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The task's people as `{id, name}`, tolerating a document the backfill has not converted yet. */
export function assigneesOf(
  doc: Pick<TaskLike, 'assignees' | 'assignee' | 'assigneeName'>,
): { id: string; name: string }[] {
  if (doc.assignees && doc.assignees.length > 0) {
    return doc.assignees.map((a) => ({ id: String(a.id), name: a.name }));
  }
  return doc.assignee ? [{ id: String(doc.assignee), name: doc.assigneeName ?? 'Unknown' }] : [];
}

export function isAssignee(doc: Pick<TaskLike, 'assignees' | 'assignee' | 'assigneeName'>, userId: string): boolean {
  return assigneesOf(doc).some((a) => a.id === userId);
}

export function isOverdue(
  task: { status: string; dueDate?: string | null },
  today: string,
): boolean {
  return (
    (TASK_OPEN_STATUSES as string[]).includes(task.status) &&
    typeof task.dueDate === 'string' &&
    task.dueDate < today
  );
}

export function shapeTaskRow(doc: TaskLike, today: string): TaskRow {
  return {
    id: String(doc._id),
    title: doc.title,
    format: doc.format as TaskRow['format'],
    status: doc.status as TaskStatus,
    blockedReason: doc.blockedReason ?? null,
    priority: doc.priority as TaskPriority,
    dueDate: doc.dueDate ?? null,
    overdue: isOverdue(doc, today),
    assignees: assigneesOf(doc),
    createdById: String(doc.createdBy),
    createdByName: doc.createdByName,
    lotId: doc.lot ? String(doc.lot) : null,
    lotCode: doc.lotCode ?? null,
    projectId: doc.project ? String(doc.project) : null,
    projectCode: doc.projectCode ?? null,
    checklistTotal: doc.checklistTotal ?? 0,
    checklistDone: doc.checklistDone ?? 0,
    commentCount: doc.commentCount ?? 0,
    doneAt: doc.doneAt ? new Date(doc.doneAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

/* ---------------------------------------------------------------- permissions */

type Actable = Pick<TaskLike, 'assignees' | 'assignee' | 'assigneeName' | 'createdBy'>;

/** Admin sees everything; everyone else only tasks they are an assignee or the creator of. */
export function canViewTask(task: Actable, ctx: MutationContext): boolean {
  return isTaskAdmin(ctx) || isAssignee(task, ctx.userId) || String(task.createdBy) === ctx.userId;
}

/** May change status / checklist / comments: any assignee, the creator, or an assigner. */
export function canActOnTask(task: Actable, ctx: MutationContext): boolean {
  return can(ctx.grants, 'task:assign') || isAssignee(task, ctx.userId) || String(task.createdBy) === ctx.userId;
}

export function assertCanActOnTask(task: Actable, ctx: MutationContext): void {
  if (!canActOnTask(task, ctx)) {
    throw new HttpError(403, 'Only an assignee, the person who set the task, or an admin can change it.');
  }
}

/* ----------------------------------------------------------------------- list */

function filterFor(
  q: Pick<TaskListQuery, 'format' | 'assignee' | 'status' | 'priority' | 'due' | 'dueFrom' | 'dueTo' | 'lot' | 'project' | 'q'>,
  ctx: MutationContext,
): TaskFilter {
  const f: TaskFilter = {};
  if (!isTaskAdmin(ctx)) f.visibleTo = oid(ctx.userId);
  if (q.format) f.format = q.format;
  if (q.assignee) f.assignee = oid(q.assignee === 'me' ? ctx.userId : q.assignee);
  if (q.status) f.status = q.status;
  if (q.priority) f.priority = q.priority;
  if (q.due) f.due = q.due;
  if (q.dueFrom) f.dueFrom = q.dueFrom;
  if (q.dueTo) f.dueTo = q.dueTo;
  if (q.lot) f.lot = oid(q.lot);
  if (q.project) f.project = oid(q.project);
  if (q.q) f.q = q.q;
  return f;
}

export async function listTasks(
  query: TaskListQuery,
  ctx: MutationContext,
): Promise<TaskListResponse> {
  await connectToDatabase();
  const today = resolveToday(query.today);
  const match = taskMatch(filterFor(query, ctx), today);
  const skip = (query.page - 1) * query.pageSize;

  const [facet] = await Task.aggregate<{ rows: TaskLike[]; total: { n: number }[] }>(
    asPipeline(taskListPipeline(match, today, skip, query.pageSize)),
  );
  return {
    rows: (facet?.rows ?? []).map((r) => shapeTaskRow(r, today)),
    total: facet?.total[0]?.n ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/* ---------------------------------------------------------------------- panel */

function pickGroup(
  facet: Record<string, unknown[]>,
  key: string,
  today: string,
): { rows: TaskRow[]; total: number } {
  const rows = (facet[key] ?? []) as TaskLike[];
  const total = ((facet[`${key}Total`] ?? [])[0] as { n: number } | undefined)?.n ?? 0;
  return { rows: rows.map((r) => shapeTaskRow(r, today)), total };
}

/** What a stage asks of the lot's assignee. Role flags on the stage graph beat the static map. */
export function stageAction(stage: string, graph: StageGraph): string {
  if (graph.decision.includes(stage)) return 'Decide';
  if (graph.scan.includes(stage)) return 'Scan';
  if (graph.mlsTag.includes(stage)) return 'Tag';
  return STAGE_ACTION_LABELS[stage] ?? WORK_ON_LOT_VERB;
}

/**
 * Lots in flight that are assigned to `userId`, as read-only task-like rows. No Task
 * document exists for these: they come straight off `ArchiveLot.assignee` (indexed).
 */
async function derivedRows(
  userId: string,
  format: string | undefined,
): Promise<{ rows: DerivedTask[]; total: number }> {
  const graph = await getStageGraph();
  const filter = {
    assignee: oid(userId),
    stage: { $in: graph.inFlight },
    ...(format ? { format } : {}),
  };
  const [docs, total] = await Promise.all([
    ArchiveLot.find(filter)
      .sort({ stageEnteredAt: 1 })
      .limit(DERIVED_CAP)
      .select('lotReference namingCode format stage stageEnteredAt')
      .lean(),
    ArchiveLot.countDocuments(filter),
  ]);
  return {
    rows: docs.map((d) => ({
      lotId: String(d._id),
      lotCode: d.namingCode ?? d.lotReference,
      format: d.format,
      stage: d.stage,
      action: stageAction(d.stage, graph),
      stageEnteredAt: new Date(d.stageEnteredAt).toISOString(),
    })),
    total,
  };
}

export async function getTaskPanel(
  query: TaskPanelQuery,
  ctx: MutationContext,
): Promise<TaskPanelResponse> {
  await connectToDatabase();
  const today = resolveToday(query.today);
  const admin = isTaskAdmin(ctx);
  // Non-admins can never widen to someone else's tasks; the assignee filter is admin-only.
  const assigneeId = admin ? query.assignee : undefined;

  const base = filterFor({ format: query.format }, ctx);
  const match = taskMatch(
    assigneeId ? { ...base, assignee: oid(assigneeId) } : base,
    today,
  );
  const recentSince = new Date(Date.now() - RECENT_DONE_DAYS * 86_400_000);

  const [panelFacet, people, derived] = await Promise.all([
    Task.aggregate<Record<string, unknown[]>>(
      asPipeline(taskPanelPipeline(match, today, recentSince, PANEL_GROUP_CAP)),
    ),
    admin
      ? Task.aggregate<{ _id: Types.ObjectId; userName: string; open: number; overdue: number; blocked: number }>(
          asPipeline(taskPeoplePipeline(taskMatch(base, today), today)),
        )
      : Promise.resolve([]),
    // Derived rows follow the person being looked at: the filtered person for an
    // admin, otherwise the viewer's own lots.
    derivedRows(assigneeId ?? ctx.userId, query.format),
  ]);

  const facet = panelFacet[0] ?? {};
  return {
    today,
    overdue: pickGroup(facet, 'overdue', today),
    dueToday: pickGroup(facet, 'dueToday', today),
    upcoming: pickGroup(facet, 'upcoming', today),
    doneRecently: pickGroup(facet, 'doneRecently', today),
    derived,
    people: people.map((p) => ({
      userId: String(p._id),
      userName: p.userName,
      open: p.open,
      overdue: p.overdue,
      blocked: p.blocked,
    })),
  };
}

/* --------------------------------------------------------------------- detail */

const HISTORY_LIMIT = 100;

export async function getTaskDetail(
  taskId: string,
  ctx: MutationContext,
  todayParam?: string,
): Promise<TaskDetailResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(taskId)) throw new HttpError(404, 'Task not found.');
  const doc = await Task.findById(taskId).lean();
  // 404 (not 403) for someone else's task: do not reveal that it exists.
  if (!doc || !canViewTask(doc, ctx)) throw new HttpError(404, 'Task not found.');

  const history = await ActivityLog.find({ task: doc._id })
    .sort({ at: -1 })
    .limit(HISTORY_LIMIT)
    .select('kind title detail actorName at')
    .lean();

  return buildDetail(doc, history, ctx, resolveToday(todayParam));
}

type HistoryRow = {
  _id: unknown;
  kind: string;
  title: string;
  detail?: string | null;
  actorName: string;
  at: Date;
};

type TaskDetailDoc = TaskLike & {
  description?: string | null;
  checklist?: { _id: unknown; text: string; done: boolean }[];
  comments?: { _id: unknown; author: unknown; authorName: string; text: string; at: Date }[];
};

/** Shared by the read path and every mutation, so a write answers with exactly what a read would. */
export function buildDetail(
  doc: TaskDetailDoc,
  history: HistoryRow[],
  ctx: MutationContext,
  today: string,
): TaskDetailResponse {
  const canAssign = can(ctx.grants, 'task:assign');
  const cancelled = doc.status === 'cancelled';
  return {
    task: {
      ...shapeTaskRow(doc, today),
      description: doc.description ?? null,
      checklist: (doc.checklist ?? []).map((c) => ({ id: String(c._id), text: c.text, done: c.done })),
      comments: (doc.comments ?? []).map((c) => ({
        id: String(c._id),
        authorId: String(c.author),
        authorName: c.authorName,
        text: c.text,
        at: new Date(c.at).toISOString(),
      })),
    },
    history: history.map((h) => ({
      id: String(h._id),
      kind: h.kind,
      title: h.title,
      detail: h.detail ?? '',
      actorName: h.actorName,
      at: new Date(h.at).toISOString(),
      severity: ACTIVITY_SEVERITY[h.kind as ActivityKind] ?? 'neutral',
    })),
    can: {
      changeStatus: canActOnTask(doc, ctx) && (!cancelled || canAssign),
      cancel: canAssign,
      edit: canAssign,
    },
  };
}
