import { Types, type ClientSession } from 'mongoose';
import { FORMATS, TASK_STATUS_LABELS, type TaskStatus } from '@/lib/domain';
import { HttpError, type MutationContext } from '@/lib/api';
import { ArchiveLot } from '@/models/ArchiveLot';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { auditActor, withTaskAudit, type TaskAuditEntry, type TaskNotice } from '@/server/audit';
import { can } from '@/server/permissions';
import { assertCanActOnTask, assigneesOf, getTaskDetail } from './queries';
import type {
  TaskChecklistBody,
  TaskCommentBody,
  TaskCreateInput,
  TaskDetailResponse,
  TaskStatusBody,
  TaskUpdateBody,
} from '@/types/task';

/**
 * Task writes. Every mutation runs through `withTaskAudit()` — one transaction that
 * applies the change, writes the `ActivityLog` history rows and the recipients'
 * `Notification` rows. Each function answers with the freshly read detail.
 *
 * Authority (enforced here, never only in the UI):
 *  - create / edit / reassign / cancel      → `task:assign` (route-gated)
 *  - status (not cancel) / checklist / comments → any assignee, the creator, or an assigner
 *
 * Notifications never go to the actor (`withTaskAudit` drops them).
 */

const MAX_COMMENTS = 200;

/** A real calendar day, not just the right shape (rejects 2026-02-31). */
function assertRealDay(day: string): void {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) {
    throw new HttpError(400, `"${day}" is not a real calendar date.`);
  }
}

/** Resolve a set of user ids to active users (deduped, order kept). Names are denormalised from here. */
async function resolveAssignees(
  ids: string[],
  session: ClientSession,
): Promise<{ id: string; name: string }[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new HttpError(400, 'A task needs at least one assignee.');
  const users = await User.find({ _id: { $in: unique } })
    .select('name active')
    .session(session)
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return unique.map((id) => {
    const user = byId.get(id);
    if (!user) throw new HttpError(400, 'Unknown assignee.');
    if (!user.active) throw new HttpError(400, `${user.name} is not an active user.`);
    return { id, name: user.name as string };
  });
}

const names = (people: { name: string }[]) => people.map((p) => p.name).join(', ');

/** Lot link: the lot's own format wins over anything the caller sent. */
async function resolveLot(id: string, session: ClientSession) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, 'Unknown lot.');
  const lot = await ArchiveLot.findById(id)
    .select('lotReference namingCode format')
    .session(session)
    .lean();
  if (!lot) throw new HttpError(400, 'Unknown lot.');
  if (!(FORMATS as readonly string[]).includes(lot.format)) {
    throw new HttpError(400, `Lot ${lot.lotReference} has format "${lot.format}", which tasks do not support.`);
  }
  return {
    id: lot._id as Types.ObjectId,
    code: (lot.namingCode ?? lot.lotReference) as string,
    format: lot.format as (typeof FORMATS)[number],
  };
}

async function resolveProject(id: string, session: ClientSession) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, 'Unknown project.');
  const project = await Project.findById(id).select('code').session(session).lean();
  if (!project) throw new HttpError(400, 'Unknown project.');
  return { id: project._id as Types.ObjectId, code: project.code as string };
}

/* ------------------------------------------------------------------- create */

export async function createTask(
  body: TaskCreateInput,
  ctx: MutationContext,
): Promise<TaskDetailResponse> {
  if (body.dueDate) assertRealDay(body.dueDate);

  const id = await withTaskAudit({
    actor: auditActor(ctx),
    mutate: async (_none, session) => {
      const assignees = await resolveAssignees(body.assigneeIds, session);
      const lot = body.lotId ? await resolveLot(body.lotId, session) : null;
      const project = body.projectId ? await resolveProject(body.projectId, session) : null;
      const format = lot?.format ?? body.format;
      if (!format) throw new HttpError(400, 'Pick a format, or link a lot (the task takes its format).');

      const items = (body.checklist ?? []).map((text) => ({ text, done: false }));
      const task = new Task({
        title: body.title,
        description: body.description ?? null,
        format,
        status: 'todo',
        priority: body.priority ?? 'normal',
        dueDate: body.dueDate ?? null,
        assignees: assignees.map((a) => ({ id: new Types.ObjectId(a.id), name: a.name })),
        createdBy: new Types.ObjectId(ctx.userId),
        createdByName: ctx.userName,
        lot: lot?.id ?? null,
        lotCode: lot?.code ?? null,
        project: project?.id ?? null,
        projectCode: project?.code ?? null,
        checklist: items,
        checklistTotal: items.length,
        checklistDone: 0,
      });

      const bits = [`Assigned to ${names(assignees)}`];
      if (body.dueDate) bits.push(`due ${body.dueDate}`);
      if (lot) bits.push(`lot ${lot.code}`);
      if (project) bits.push(`project ${project.code}`);

      return {
        task,
        result: String(task._id),
        entries: [{ kind: 'task_created', title: 'Task created', detail: bits.join(' · ') }],
        notices: assignees.map((a) => ({
          userId: a.id,
          kind: 'task_assigned' as const,
          text: `${ctx.userName} assigned you "${body.title}"`,
        })),
      };
    },
  });
  return getTaskDetail(id, ctx);
}

/* ------------------------------------------------------------------- update */

export async function updateTask(
  taskId: string,
  body: TaskUpdateBody,
  ctx: MutationContext,
): Promise<TaskDetailResponse> {
  if (body.dueDate) assertRealDay(body.dueDate);

  await withTaskAudit({
    taskId,
    actor: auditActor(ctx),
    mutate: async (task, session) => {
      if (!task) throw new HttpError(404, 'Task not found.');
      const entries: TaskAuditEntry[] = [];
      const notices: TaskNotice[] = [];
      const changes: { field: string; from: unknown; to: unknown }[] = [];
      const note = (field: string, from: unknown, to: unknown) => {
        if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
      };

      if (body.title !== undefined && body.title !== task.title) {
        note('title', task.title, body.title);
        task.title = body.title;
      }
      if (body.description !== undefined && (body.description || null) !== (task.description ?? null)) {
        note('description', task.description ?? null, body.description || null);
        task.description = body.description || null;
      }
      if (body.priority !== undefined && body.priority !== task.priority) {
        note('priority', task.priority, body.priority);
        task.priority = body.priority;
      }
      if (body.dueDate !== undefined && body.dueDate !== (task.dueDate ?? null)) {
        note('dueDate', task.dueDate ?? null, body.dueDate);
        task.dueDate = body.dueDate;
      }

      // Links first: a linked lot decides the format.
      if (body.lotId !== undefined) {
        const lot = body.lotId ? await resolveLot(body.lotId, session) : null;
        if (String(task.lot ?? '') !== String(lot?.id ?? '')) {
          note('lot', task.lotCode ?? null, lot?.code ?? null);
          task.lot = lot?.id ?? null;
          task.lotCode = lot?.code ?? null;
        }
        if (lot && lot.format !== task.format) {
          note('format', task.format, lot.format);
          task.format = lot.format;
        }
      }
      if (body.projectId !== undefined) {
        const project = body.projectId ? await resolveProject(body.projectId, session) : null;
        if (String(task.project ?? '') !== String(project?.id ?? '')) {
          note('project', task.projectCode ?? null, project?.code ?? null);
          task.project = project?.id ?? null;
          task.projectCode = project?.code ?? null;
        }
      }
      if (body.format !== undefined && body.format !== task.format) {
        if (task.lot) throw new HttpError(400, 'The format follows the linked lot. Unlink the lot to change it.');
        note('format', task.format, body.format);
        task.format = body.format;
      }

      if (changes.length > 0) {
        entries.push({
          kind: 'task_updated',
          title: `Task edited: ${changes.map((c) => c.field).join(', ')}`,
          changes,
        });
      }

      if (body.assigneeIds !== undefined) {
        const current = assigneesOf(task);
        const currentIds = new Set(current.map((p) => p.id));
        const wantedIds = new Set(body.assigneeIds);
        // Only newcomers must be active users; someone already on the task may stay.
        const newIds = [...wantedIds].filter((id) => !currentIds.has(id));
        const added = newIds.length > 0 ? await resolveAssignees(newIds, session) : [];
        const removed = current.filter((p) => !wantedIds.has(p.id));

        if (added.length > 0 || removed.length > 0) {
          // Keep existing people (and their stored names) in place; append the new ones.
          const kept = current.filter((p) => wantedIds.has(p.id));
          task.set(
            'assignees',
            [...kept, ...added].map((p) => ({ id: new Types.ObjectId(p.id), name: p.name })),
          );
          const bits: string[] = [];
          if (added.length > 0) bits.push(`added ${names(added)}`);
          if (removed.length > 0) bits.push(`removed ${names(removed)}`);
          const text = bits.join(', ');
          entries.push({
            kind: 'task_reassigned',
            title: `Assignees: ${text}`,
            detail: `Now: ${names([...kept, ...added])}`,
            changes: [{ field: 'assignees', from: names(current), to: names([...kept, ...added]) }],
          });
          for (const p of added) {
            notices.push({ userId: p.id, kind: 'task_assigned', text: `${ctx.userName} assigned you "${task.title}"` });
          }
          for (const p of removed) {
            notices.push({ userId: p.id, kind: 'task_removed', text: `${ctx.userName} removed you from "${task.title}"` });
          }
        }
      }

      return { task, result: undefined, entries, notices };
    },
  });
  return getTaskDetail(taskId, ctx);
}

/* ------------------------------------------------------------------- status */

export async function setTaskStatus(
  taskId: string,
  body: TaskStatusBody,
  ctx: MutationContext,
): Promise<TaskDetailResponse> {
  await withTaskAudit({
    taskId,
    actor: auditActor(ctx),
    mutate: async (task) => {
      if (!task) throw new HttpError(404, 'Task not found.');
      assertCanActOnTask(task, ctx);

      const from = task.status as TaskStatus;
      const to = body.status;
      const canAssign = can(ctx.grants, 'task:assign');
      if (to === 'cancelled' && !canAssign) throw new HttpError(403, 'Only an admin can cancel a task.');
      if (from === 'cancelled' && !canAssign) {
        throw new HttpError(403, 'A cancelled task can only be reopened by an admin.');
      }
      if (from === to) throw new HttpError(400, `The task is already ${TASK_STATUS_LABELS[to].toLowerCase()}.`);

      const now = new Date();
      task.status = to;
      task.blockedReason = to === 'blocked' ? (body.blockedReason ?? '') : null;
      task.doneAt = to === 'done' ? now : null;
      task.cancelledAt = to === 'cancelled' ? now : null;

      const label = `${TASK_STATUS_LABELS[from]} → ${TASK_STATUS_LABELS[to]}`;
      // Everyone on the task hears about it; blocked / done are reported to the creator
      // in their own words. The actor is dropped by withTaskAudit.
      const creatorId = String(task.createdBy);
      const notices: TaskNotice[] = [...new Set([...assigneesOf(task).map((p) => p.id), creatorId])].map(
        (userId) => {
          if (userId === creatorId && (to === 'blocked' || to === 'done')) {
            return {
              userId,
              kind: to === 'blocked' ? ('task_blocked' as const) : ('task_done' as const),
              text:
                to === 'blocked'
                  ? `${ctx.userName} is blocked on "${task.title}": ${body.blockedReason ?? ''}`
                  : `${ctx.userName} marked "${task.title}" done`,
            };
          }
          return {
            userId,
            kind: to === 'cancelled' ? ('task_cancelled' as const) : ('task_status' as const),
            text: `${ctx.userName} set "${task.title}" to ${TASK_STATUS_LABELS[to]}`,
          };
        },
      );

      return {
        task,
        result: undefined,
        entries: [
          {
            kind: 'task_status_changed',
            title: `Status: ${label}`,
            detail: to === 'blocked' ? body.blockedReason : undefined,
            changes: [{ field: 'status', from: TASK_STATUS_LABELS[from], to: TASK_STATUS_LABELS[to] }],
          },
        ],
        notices,
      };
    },
  });
  return getTaskDetail(taskId, ctx);
}

/* ----------------------------------------------------------------- comments */

export async function addTaskComment(
  taskId: string,
  body: TaskCommentBody,
  ctx: MutationContext,
): Promise<TaskDetailResponse> {
  await withTaskAudit({
    taskId,
    actor: auditActor(ctx),
    mutate: async (task) => {
      if (!task) throw new HttpError(404, 'Task not found.');
      assertCanActOnTask(task, ctx);
      if (task.comments.length >= MAX_COMMENTS) {
        throw new HttpError(400, `A task holds at most ${MAX_COMMENTS} comments.`);
      }

      task.comments.push({
        author: new Types.ObjectId(ctx.userId),
        authorName: ctx.userName,
        text: body.text,
        at: new Date(),
      });
      task.commentCount = task.comments.length;

      const recipients = [...new Set([...assigneesOf(task).map((p) => p.id), String(task.createdBy)])];
      return {
        task,
        result: undefined,
        entries: [
          {
            kind: 'task_comment_added',
            title: 'Comment added',
            detail: body.text.length > 140 ? `${body.text.slice(0, 140)}…` : body.text,
          },
        ],
        notices: recipients.map((userId) => ({
          userId,
          kind: 'task_comment' as const,
          text: `${ctx.userName} commented on "${task.title}"`,
        })),
      };
    },
  });
  return getTaskDetail(taskId, ctx);
}

/* ---------------------------------------------------------------- checklist */

export async function setTaskChecklist(
  taskId: string,
  body: TaskChecklistBody,
  ctx: MutationContext,
): Promise<TaskDetailResponse> {
  await withTaskAudit({
    taskId,
    actor: auditActor(ctx),
    mutate: async (task) => {
      if (!task) throw new HttpError(404, 'Task not found.');
      assertCanActOnTask(task, ctx);

      const before = new Map(task.checklist.map((c) => [String(c._id), c]));
      const keep = new Set<string>();
      const next = body.items.map((i) => {
        const known = i.id && before.has(i.id) ? i.id : null;
        if (known) keep.add(known);
        return {
          ...(known ? { _id: new Types.ObjectId(known) } : {}),
          text: i.text,
          done: i.done,
        };
      });
      const added = next.filter((n) => !('_id' in n)).length;
      const removed = [...before.keys()].filter((k) => !keep.has(k)).length;

      task.set('checklist', next);
      task.checklistTotal = next.length;
      task.checklistDone = next.filter((n) => n.done).length;

      const detail = [added ? `${added} added` : '', removed ? `${removed} removed` : '']
        .filter(Boolean)
        .join(', ');
      return {
        task,
        result: undefined,
        entries: [
          {
            kind: 'task_checklist_updated',
            title: `Checklist: ${task.checklistDone} of ${task.checklistTotal} done`,
            detail: detail || undefined,
          },
        ],
      };
    },
  });
  return getTaskDetail(taskId, ctx);
}
