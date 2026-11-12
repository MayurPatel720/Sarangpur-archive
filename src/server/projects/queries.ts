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
import { parseAdvanced } from '@/lib/advanced-filters';
import { buildProjectAdvanced } from '@/server/filters/advanced';
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
  createdAt: Date;
  updatedAt: Date;
}): ProjectRow {
  return {
    id: String(doc._id),
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    lotCount: doc.lotCount,
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
  // Conditions on a project's lots each give a list of project ids; the project must be in all of them.
  const idLists: unknown[][] = [];
  if (query.assignee) {
    idLists.push(
      await ArchiveLot.distinct('projectIds', { assignee: new Types.ObjectId(query.assignee) }),
    );
  }
  if (query.format) {
    idLists.push(await ArchiveLot.distinct('projectIds', { $or: [{ format: query.format }, { 'mediaLines.format': query.format }] }));
  }
  if (query.stage) idLists.push(await ArchiveLot.distinct('projectIds', { stage: query.stage }));
  if (idLists.length > 0) {
    filter._id = { $in: idLists.reduce((acc, ids) => acc.filter((id) => ids.some((x) => String(x) === String(id)))) };
  }
  if (query.createdFrom || query.createdTo) {
    filter.createdAt = {
      ...(query.createdFrom ? { $gte: new Date(`${query.createdFrom}T00:00:00.000+05:30`) } : {}),
      ...(query.createdTo ? { $lt: new Date(new Date(`${query.createdTo}T00:00:00.000+05:30`).getTime() + 86_400_000) } : {}),
    };
  }
  const advanced = query.adv ? parseAdvanced(query.adv) : null;
  if (query.adv && !advanced) throw new HttpError(400, 'Invalid advanced filter.');
  const advClause = advanced ? await buildProjectAdvanced(advanced) : null;
  const finalFilter = advClause ? { $and: [filter, advClause] } : filter;
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    Project.find(finalFilter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean(),
    Project.countDocuments(finalFilter),
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

/** What a viewer without the lot's format permission gets for it: the number and the format, nothing else. */
function lockedLotRow(d: { _id: unknown; lotReference: string; format: string }): ProjectDetailResponse['lots']['rows'][number] {
  return {
    locked: true,
    id: String(d._id),
    lotReference: d.lotReference,
    namingCode: null,
    dateReceived: null,
    ownerName: '',
    assigneeName: null,
    assigneeId: null,
    pointOfContactName: null,
    format: d.format,
    mediaSubtype: '',
    quantity: 0,
    dataType: '',
    decision: '',
    stage: '',
    receiverName: '',
    returnLabel: '',
    returnSeverity: 'neutral',
    mediaLines: [],
    scanned: 0,
    scanTarget: 0,
    tagged: 0,
  };
}

export async function getProjectDetail(
  projectId: string,
  lotsQuery: ProjectDetailQuery,
  grants: readonly string[],
): Promise<ProjectDetailResponse> {
  // A lot of a format the viewer's role cannot open is shown as locked: its number and format only.
  const canOpen = (format: string) => grants.includes(`format:${format}`);
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
    // Creator name: one indexed _id lookup (not a $lookup).
    User.find({ _id: project.createdBy }).select('name').lean(),
  ]);

  const [itemStats] = await LotItem.aggregate<{
    _id: null;
    total: number;
    selected: number;
    digitized: number;
    tagged: number;
  }>(asPipeline(projectItemStatsPipeline(memberIds.map((d) => d._id))));

  const lockedCodes = new Set(memberIds.filter((m) => !canOpen(m.format)).map((m) => m.lotReference));
  const createdByName = (users[0]?.name as string | undefined) ?? null;
  const receiverIds = [...new Set(lotDocs.map((d) => String(d.receiver)))];
  const receivers = await User.find({ _id: { $in: receiverIds } }).select('name').lean();
  const receiverNames = new Map(receivers.map((u) => [String(u._id), u.name as string]));

  const teamCounts = new Map<string, { name: string; count: number }>();
  for (const m of memberIds) {
    if (!m.assignee || !canOpen(m.format)) continue;
    const key = String(m.assignee);
    const prev = teamCounts.get(key);
    if (prev) prev.count += 1;
    else teamCounts.set(key, { name: m.assigneeName ?? 'Unknown', count: 1 });
  }

  const stats = itemStats ?? { total: 0, selected: 0, digitized: 0, tagged: 0 };
  return {
    project: {
      ...shapeProjectRow(project),
      createdByName,
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
        quantity: canOpen(m.format) ? m.quantity : 0,
        assigneeId: m.assignee && canOpen(m.format) ? String(m.assignee) : null,
        assigneeName: canOpen(m.format) ? (m.assigneeName ?? null) : null,
      })),
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
      rows: lotDocs.map((d) => !canOpen(d.format) ? lockedLotRow(d) : ({
        locked: false,
        id: String(d._id),
        lotReference: d.lotReference,
        namingCode: d.namingCode ?? null,
        dateReceived: d.dateReceived ? d.dateReceived.toISOString() : null,
        ownerName: d.owner?.name ?? '',
        assigneeName: d.assigneeName ?? null,
        assigneeId: d.assignee ? String(d.assignee) : null,
        mediaLines:
          d.mediaLines && d.mediaLines.length > 0
            ? d.mediaLines.map((l) => ({ mediaSubtype: l.mediaSubtype, quantity: l.quantity }))
            : [{ mediaSubtype: d.mediaSubtype, quantity: d.quantity }],
        scanned: d.digitization?.foundFileCount ?? 0,
        scanTarget: d.digitization?.expectedFileCount || d.quantityToDigitize || 0,
        tagged: d.mls?.taggedCount ?? 0,
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
    // History lines about a locked lot are left out too.
    recentActivity: shapeProjectActivity(activityRows.filter((a) => !a.lotCode || !lockedCodes.has(a.lotCode))),
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
