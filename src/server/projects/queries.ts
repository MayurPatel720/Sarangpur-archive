import { Types, type PipelineStage } from 'mongoose';
import { ACTIVITY_SEVERITY, type ActivityKind } from '@/lib/domain';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import { Project } from '@/models/Project';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { ActivityLog } from '@/models/ActivityLog';
import { User } from '@/models/User';
import { escapeRegex } from '@/server/lots/queries';
import { intakeMissing } from '@/lib/intake-gate';
import {
  projectActivityPipeline,
  projectItemStatsPipeline,
  projectLotStagesPipeline,
  type Pipeline,
} from './pipelines';
import type {
  LotProjectsResponse,
  ProjectDetailQuery,
  ProjectDetailResponse,
  ProjectListQuery,
  ProjectListResponse,
  ProjectRow,
} from '@/types/project';

/** Single cast from plain-data pipelines to Mongoose stages (rule 2). */
const asPipeline = (p: Pipeline): PipelineStage[] => p as unknown as PipelineStage[];

export function shapeProjectRow(doc: {
  _id: unknown;
  code: string;
  name: string;
  description?: string | null;
  lotCount: number;
  startDate?: Date | null;
  targetDate?: Date | null;
  coordinatorName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRow {
  return {
    id: String(doc._id),
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    lotCount: doc.lotCount,
    startDate: doc.startDate ? new Date(doc.startDate).toISOString() : null,
    targetDate: doc.targetDate ? new Date(doc.targetDate).toISOString() : null,
    coordinatorName: doc.coordinatorName ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

/** Paginated project list, newest first. `search` matches code or name. */
export async function listProjects(query: ProjectListQuery): Promise<ProjectListResponse> {
  await connectToDatabase();
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ code: rx }, { name: rx }];
  }
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean(),
    Project.countDocuments(filter),
  ]);
  return { rows: docs.map(shapeProjectRow), total, page: query.page, pageSize: query.pageSize };
}

/* ------------------------------------------------------------------ detail */

/** Mirrors the register row mapper in lots/queries (kept local, like search/queries). */
function prettify(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function returnSeverity(doc: {
  return?: { status?: string; dueAt?: Date | string | null } | null;
}): 'neutral' | 'info' | 'good' | 'warning' | 'critical' {
  const status = doc.return?.status ?? 'not_requested';
  if (status === 'returned') return 'good';
  if ((status === 'pending' || status === 'in_progress') && doc.return?.dueAt) {
    if (new Date(doc.return.dueAt).getTime() < Date.now()) return 'warning';
    return 'info';
  }
  return 'neutral';
}

export function shapeProjectActivity(
  rows: {
    _id: unknown;
    kind: string;
    title: string;
    detail?: string | null;
    lotCode?: string | null;
    projectCode?: string | null;
    actorName: string;
    at: Date | string;
  }[],
) {
  return rows.map((r) => ({
    id: String(r._id),
    kind: r.kind as ActivityKind,
    title: r.title,
    detail: r.detail ?? '',
    lotCode: r.lotCode ?? null,
    projectCode: r.projectCode ?? null,
    actorName: r.actorName,
    at: (r.at instanceof Date ? r.at : new Date(r.at)).toISOString(),
    severity: ACTIVITY_SEVERITY[r.kind as ActivityKind] ?? 'neutral',
  }));
}

export async function getProjectDetail(
  projectId: string,
  lotsQuery: ProjectDetailQuery,
): Promise<ProjectDetailResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(projectId)) throw new HttpError(404, 'Project not found.');
  const project = await Project.findById(projectId).lean();
  if (!project) throw new HttpError(404, 'Project not found.');

  const memberFilter = { projectIds: project._id };
  const lotSkip = (lotsQuery.lotPage - 1) * lotsQuery.lotPageSize;

  const [memberIds, lotDocs, lotsTotal, stageRows, activityRows, users] = await Promise.all([
    ArchiveLot.find(memberFilter)
      .select('lotReference format quantity assignee assigneeName syncProjectId')
      .lean(),
    ArchiveLot.find(memberFilter)
      .sort({ dateReceived: -1 })
      .skip(lotSkip)
      .limit(lotsQuery.lotPageSize)
      .lean(),
    ArchiveLot.countDocuments(memberFilter),
    ArchiveLot.aggregate<{ _id: string; count: number }>(
      asPipeline(projectLotStagesPipeline(project._id)),
    ),
    ActivityLog.aggregate<{
      _id: unknown;
      kind: string;
      title: string;
      detail?: string | null;
      lotCode?: string | null;
      projectCode?: string | null;
      actorName: string;
      at: Date | string;
    }>(asPipeline(projectActivityPipeline(project._id, 20))),
    User.find({
      _id: {
        $in: project.coordinator ? [project.coordinator] : [],
      },
    })
      .select('name')
      .lean(),
  ]);

  const [itemStats] = await LotItem.aggregate<{
    _id: null;
    total: number;
    selected: number;
    digitized: number;
    tagged: number;
  }>(asPipeline(projectItemStatsPipeline(memberIds.map((d) => d._id))));

  const nameById = new Map(users.map((u) => [String(u._id), u.name as string]));
  const receiverIds = [...new Set(lotDocs.map((d) => String(d.receiver)))];
  const receivers = await User.find({ _id: { $in: receiverIds } }).select('name').lean();
  const receiverNames = new Map(receivers.map((u) => [String(u._id), u.name as string]));

  const teamCounts = new Map<string, { name: string; count: number }>();
  for (const m of memberIds) {
    if (!m.assignee) continue;
    const key = String(m.assignee);
    const prev = teamCounts.get(key);
    if (prev) prev.count += 1;
    else teamCounts.set(key, { name: m.assigneeName ?? 'Unknown', count: 1 });
  }

  const stats = itemStats ?? { total: 0, selected: 0, digitized: 0, tagged: 0 };
  return {
    project: {
      ...shapeProjectRow(project),
      coordinatorId: project.coordinator ? String(project.coordinator) : null,
      shared: (project.shared ?? {}) as ProjectDetailResponse['project']['shared'],
      // Team is derived: whoever is assigned a lot in this project.
      team: [...teamCounts.entries()].map(([userId, t]) => ({
        userId,
        userName: t.name,
        lotCount: t.count,
      })),
      lotsByFormat: memberIds.map((m) => ({
        lotId: String(m._id),
        lotReference: m.lotReference,
        format: m.format,
        quantity: m.quantity,
        assigneeId: m.assignee ? String(m.assignee) : null,
        assigneeName: m.assigneeName ?? null,
      })),
      missing: intakeMissing(
        (project.shared ?? {}) as { dateReceived?: string; originSource?: string; owner?: { name?: string } },
      ),
    },
    progress: {
      lotsTotal,
      lotsByStage: stageRows.map((s) => ({ stage: s._id, count: s.count })),
      totalItems: stats.total,
      selectedItems: stats.selected,
      digitizedItems: stats.digitized,
      taggedItems: stats.tagged,
    },
    lots: {
      rows: lotDocs.map((d) => ({
        id: String(d._id),
        lotReference: d.lotReference,
        namingCode: d.namingCode ?? null,
        dateReceived: d.dateReceived ? d.dateReceived.toISOString() : null,
        ownerName: d.owner?.name ?? '',
        assigneeName: d.assigneeName ?? null,
        pointOfContactName: d.pointsOfContact?.[0]?.name ?? null,
        format: d.format,
        mediaSubtype: d.mediaSubtype,
        quantity: d.quantity,
        dataType: d.dataType,
        decision: d.decision?.status ?? 'pending',
        stage: d.stage,
        receiverName: receiverNames.get(String(d.receiver)) ?? 'Unknown',
        returnLabel: prettify(d.return?.status ?? 'not_requested'),
        returnSeverity: returnSeverity(d),
      })),
      total: lotsTotal,
      page: lotsQuery.lotPage,
      pageSize: lotsQuery.lotPageSize,
    },
    recentActivity: shapeProjectActivity(activityRows),
  };
}

/** Projects a lot belongs to — chips for the lot detail page. */
export async function getLotProjects(lotId: string): Promise<LotProjectsResponse> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(lotId)) throw new HttpError(404, 'Lot not found.');
  const lot = await ArchiveLot.findById(lotId).select('projectIds').lean();
  if (!lot) throw new HttpError(404, 'Lot not found.');
  const ids = lot.projectIds ?? [];
  if (ids.length === 0) return { projects: [] };
  const docs = await Project.find({ _id: { $in: ids } })
    .select('code name')
    .sort({ code: 1 })
    .lean();
  return {
    projects: docs.map((d) => ({ id: String(d._id), code: d.code, name: d.name })),
  };
}
