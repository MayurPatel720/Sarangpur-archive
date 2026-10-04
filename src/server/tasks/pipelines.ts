/**
 * Task aggregation pipelines — plain data, no Mongoose import (AGENTS.md rule 2), so
 * `scripts/verify-pipelines.ts` can run them through `mingo`.
 *
 * Nothing here needs a `$lookup`: names, lot/project codes and the checklist/comment
 * counters are denormalised onto the task at write time (see models/Task.ts).
 *
 * `today` is always a `YYYY-MM-DD` calendar day. Due dates are stored in the same
 * form, so "overdue" is a plain string comparison and never depends on a timezone.
 */

import { TASK_OPEN_STATUSES } from '@/lib/domain';

export type Pipeline = Record<string, unknown>[];

export interface TaskFilter {
  format?: string;
  /**
   * Visibility confinement for non-admins: only tasks this user is an assignee or the creator
   * of. Admins (`task:viewAll`) leave it unset. Already cast to whatever type the
   * collection stores (ObjectId in production, a plain string in the mingo fixture).
   */
  visibleTo?: unknown;
  assignee?: unknown;
  status?: string;
  priority?: string;
  due?: 'overdue' | 'today' | 'upcoming' | 'none';
  dueFrom?: string;
  dueTo?: string;
  lot?: unknown;
  project?: unknown;
  /** Free text over title, lot/project code and the people's names (any assignee). */
  q?: string;
}

const OPEN = [...TASK_OPEN_STATUSES];
const NO_DATE_SORT = '9999-12-31';

/** True when the task has a due date strictly before `today`. */
const hasDue = { $eq: [{ $type: '$dueDate' }, 'string'] };
const dueBefore = (today: string) => ({ $and: [hasDue, { $lt: ['$dueDate', today] }] });

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The `$match` for a filter. Pure data; the caller supplies the id casts. */
export function taskMatch(f: TaskFilter, today: string): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (f.visibleTo !== undefined) {
    and.push({ $or: [{ 'assignees.id': f.visibleTo }, { createdBy: f.visibleTo }] });
  }
  if (f.format) and.push({ format: f.format });
  if (f.assignee !== undefined) and.push({ 'assignees.id': f.assignee });
  if (f.status) and.push({ status: f.status });
  if (f.priority) and.push({ priority: f.priority });
  if (f.lot !== undefined) and.push({ lot: f.lot });
  if (f.project !== undefined) and.push({ project: f.project });

  // Due-date buckets only make sense for work still to do.
  if (f.due === 'overdue') {
    and.push({ status: { $in: OPEN } }, { dueDate: { $lt: today, $type: 'string' } });
  } else if (f.due === 'today') {
    and.push({ status: { $in: OPEN } }, { dueDate: today });
  } else if (f.due === 'upcoming') {
    and.push({ status: { $in: OPEN } }, { dueDate: { $gt: today, $type: 'string' } });
  } else if (f.due === 'none') {
    and.push({ status: { $in: OPEN } }, { dueDate: null });
  }
  if (f.dueFrom) and.push({ dueDate: { $gte: f.dueFrom, $type: 'string' } });
  if (f.dueTo) and.push({ dueDate: { $lte: f.dueTo, $type: 'string' } });

  if (f.q) {
    const rx = { $regex: escapeRegex(f.q), $options: 'i' };
    and.push({
      $or: [
        { title: rx },
        { lotCode: rx },
        { projectCode: rx },
        { 'assignees.name': rx },
        { createdByName: rx },
      ],
    });
  }

  return and.length > 0 ? { $and: and } : {};
}

/** Strip the helper fields and the heavy arrays — rows only carry counters. */
const ROW_PROJECTION = { $project: { checklist: 0, comments: 0, sortRank: 0, dueSort: 0, urgentFirst: 0 } };

/**
 * The paginated list: overdue first, then urgent, then by due date (no date last),
 * with finished work (done / cancelled) after all open work. One pass, facet for the
 * page and the total.
 */
export function taskListPipeline(
  match: Record<string, unknown>,
  today: string,
  skip: number,
  limit: number,
): Pipeline {
  return [
    { $match: match },
    {
      $addFields: {
        sortRank: {
          $cond: [
            { $not: [{ $in: ['$status', OPEN] }] },
            3,
            { $cond: [dueBefore(today), 0, { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 2] }] },
          ],
        },
        dueSort: { $ifNull: ['$dueDate', NO_DATE_SORT] },
      },
    },
    { $sort: { sortRank: 1, dueSort: 1, createdAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }, ROW_PROJECTION],
        total: [{ $count: 'n' }],
      },
    },
  ];
}

/**
 * Today's-tasks panel: four capped groups and their true totals in one pass.
 *
 *  - overdue      open, due before today
 *  - dueToday     open, due today
 *  - upcoming     open, due later or with no date
 *  - doneRecently finished since `recentSince`, newest first
 *
 * Cancelled tasks never appear. Inside the open groups, urgent comes first, then the
 * due date, so the most pressing card is always at the top of its group.
 */
export function taskPanelPipeline(
  match: Record<string, unknown>,
  today: string,
  recentSince: Date,
  cap: number,
): Pipeline {
  const open = { status: { $in: OPEN } };
  const groups: Record<string, Record<string, unknown>> = {
    overdue: { $and: [open, { dueDate: { $lt: today, $type: 'string' } }] },
    dueToday: { $and: [open, { dueDate: today }] },
    upcoming: {
      $and: [open, { $or: [{ dueDate: { $gt: today, $type: 'string' } }, { dueDate: null }] }],
    },
  };
  const openSort = { $sort: { urgentFirst: 1, dueSort: 1, createdAt: -1, _id: -1 } };

  const facet: Record<string, Pipeline> = {};
  for (const [key, cond] of Object.entries(groups)) {
    facet[key] = [{ $match: cond }, openSort, { $limit: cap }, ROW_PROJECTION];
    facet[`${key}Total`] = [{ $match: cond }, { $count: 'n' }];
  }
  const doneCond = { status: 'done', doneAt: { $gte: recentSince } };
  facet.doneRecently = [
    { $match: doneCond },
    { $sort: { doneAt: -1, _id: -1 } },
    { $limit: cap },
    ROW_PROJECTION,
  ];
  facet.doneRecentlyTotal = [{ $match: doneCond }, { $count: 'n' }];

  return [
    { $match: match },
    {
      $addFields: {
        urgentFirst: { $cond: [{ $eq: ['$priority', 'urgent'] }, 0, 1] },
        dueSort: { $ifNull: ['$dueDate', NO_DATE_SORT] },
      },
    },
    { $facet: facet },
  ];
}

/**
 * Admin per-person strip: open / overdue / blocked counts per assignee, over open work
 * only. A task with two assignees counts once for EACH of them (`$unwind`). Callers pass a match WITHOUT the assignee filter so the strip stays whole while
 * one person is selected.
 */
export function taskPeoplePipeline(match: Record<string, unknown>, today: string): Pipeline {
  return [
    { $match: { $and: [match, { status: { $in: OPEN } }] } },
    { $unwind: '$assignees' },
    {
      $group: {
        _id: '$assignees.id',
        userName: { $first: '$assignees.name' },
        open: { $sum: 1 },
        overdue: { $sum: { $cond: [dueBefore(today), 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
      },
    },
    { $sort: { overdue: -1, blocked: -1, open: -1, userName: 1 } },
  ];
}
