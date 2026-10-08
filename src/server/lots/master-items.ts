import { Types } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { FORMATS, dataTypesMatching } from '@/lib/domain';
import { parseDateRange } from '@/lib/date-range';
import { ArchiveLot } from '@/models/ArchiveLot';
import { LotItem } from '@/models/LotItem';
import { Project } from '@/models/Project';
import { getReferenceList } from '@/server/reference';
import { requireFormatScope } from '@/server/format-scope';
import { can } from '@/server/permissions';
import { mediaSubtypeListKeyAsync } from '@/server/lots/queries';
import { toGridRow, type ItemLean } from '@/server/lots/item-grid';
import type { MasterQuery, MasterResponse } from '@/types/master';

/**
 * The Master Excel: every item of every lot, with its lot and project, filtered and paginated
 * on the server. No $lookup (AGENTS rule 4) — lot-level filters (lot no, project, stage,
 * data type) resolve to lot ids first, item filters run on `lotitems`, and the lot / project
 * names of the page's rows are read with one `$in` query each.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (v: string) => ({ $regex: escapeRe(v), $options: 'i' });
const MAX_LOT_IDS = 100_000;

type Filter = Record<string, unknown>;

/** Yes / No / blank on a three-state boolean (blank = unanswered, i.e. null or missing). */
function tri(f: Filter, path: string, v: string | undefined) {
  if (v === 'yes') f[path] = true;
  else if (v === 'no') f[path] = false;
  else if (v === 'blank') f[path] = null;
}
/** Yes / No on a two-state flag (No = anything that is not true). */
function flag(f: Filter, path: string, v: string | undefined) {
  if (v === 'yes') f[path] = true;
  else if (v === 'no' || v === 'blank') f[path] = { $ne: true };
}

export async function listMasterItems(query: MasterQuery, ctx: MutationContext): Promise<MasterResponse> {
  await connectToDatabase();

  // Format scope: one chosen format (needs its grant), else every format the caller holds.
  const one = requireFormatScope(query.format ?? null, ctx);
  const formats = one ? [one] : FORMATS.filter((f) => can(ctx.grants, `format:${f}`));
  if (formats.length === 0) return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };

  // Someone who may open every format sees every item — no format condition at all, so an item
  // never drops out because of a missing or older `format` value. Others are limited to their formats.
  const f: Filter = one || formats.length < FORMATS.length ? { format: { $in: formats } } : {};

  // ---- lot-level filters → lot ids
  const lotFilter: Filter = {};
  if (query.lot) lotFilter.lotReference = contains(query.lot);
  if (query.stage) lotFilter.stage = query.stage;
  if (query.dataType) lotFilter['mediaLines.dataType'] = { $in: dataTypesMatching(query.dataType) };
  if (query.project) {
    const projects = await Project.find({ $or: [{ code: contains(query.project) }, { name: contains(query.project) }] })
      .select('_id')
      .limit(1000)
      .lean();
    lotFilter.projectIds = { $in: projects.map((p) => p._id) };
  }
  if (Object.keys(lotFilter).length > 0) {
    const lots = await ArchiveLot.find(lotFilter).select('_id').limit(MAX_LOT_IDS).lean();
    f.lot = { $in: lots.map((l) => l._id) };
  }

  // ---- item filters
  if (query.code) f.code = contains(query.code);
  if (query.senderCode) f.senderCode = contains(query.senderCode);
  if (query.place) f.place = contains(query.place);
  if (query.nameOnTape) f.nameOnTape = contains(query.nameOnTape);
  if (query.nameOnCase) f.nameOnCase = contains(query.nameOnCase);
  if (query.physicalSource) f.physicalSource = contains(query.physicalSource);
  if (query.remarks) f.remarks = contains(query.remarks);
  if (query.duplicateCode) f.duplicateCode = contains(query.duplicateCode);
  if (query.digitalSource) f.digitalSource = contains(query.digitalSource);
  if (query.fileName) f.fileName = contains(query.fileName);
  if (query.phyStorageLoc) f.phyStorageLoc = contains(query.phyStorageLoc);
  if (query.storageRemark) f.storageRemark = contains(query.storageRemark);
  if (query.loggerName) f.loggerName = contains(query.loggerName);
  if (query.decisionRemark) f['decision.remark'] = contains(query.decisionRemark);
  if (query.date) {
    const r = parseDateRange(query.date);
    if (r.ok) {
      // Overlap: the item's range touches the typed one.
      f.dateFrom = { $lte: new Date(`${r.to}T00:00:00.000Z`) };
      f.dateTo = { $gte: new Date(`${r.from}T00:00:00.000Z`) };
    }
  }
  tri(f, 'decision.digital', query.digital);
  tri(f, 'decision.redigital', query.redigital);
  tri(f, 'decision.discard', query.discard);
  flag(f, 'digitized', query.captured);
  flag(f, 'taggedInMls', query.taggedInMls);
  flag(f, 'logged', query.logged);
  if (query.disposition === 'blank') f['decision.disposition'] = null;
  else if (query.disposition) f['decision.disposition'] = query.disposition;

  const answered = { $in: [true, false] };
  if (query.result === 'undecided') {
    f.$or = [
      { 'decision.digital': { $nin: [true, false] } },
      { 'decision.redigital': { $nin: [true, false] } },
      { 'decision.discard': { $nin: [true, false] } },
    ];
  } else if (query.result) {
    f['decision.digital'] ??= answered;
    f['decision.redigital'] ??= answered;
    f['decision.discard'] ??= answered;
    if (query.result === 'archive') f.$or = [{ 'decision.digital': true }, { 'decision.redigital': true }];
    if (query.result === 'discard') Object.assign(f, { 'decision.digital': false, 'decision.redigital': false, 'decision.discard': true });
    if (query.result === 'physical') Object.assign(f, { 'decision.digital': false, 'decision.redigital': false, 'decision.discard': false });
  }

  const skip = (query.page - 1) * query.pageSize;
  const [docs, total] = await Promise.all([
    LotItem.find(f).sort({ lot: 1, lineIndex: 1, sortOrder: 1, groupNo: 1, itemNo: 1 }).skip(skip).limit(query.pageSize).lean(),
    LotItem.countDocuments(f),
  ]);
  const items = docs as ItemLean[];
  if (items.length === 0) return { rows: [], total, page: query.page, pageSize: query.pageSize };

  // ---- the page's lots, projects and duplicate back-links (one query each)
  const lotIds = [...new Set(items.map((i) => String(i.lot)))].map((id) => new Types.ObjectId(id));
  const lots = await ArchiveLot.find({ _id: { $in: lotIds } })
    .select('lotReference stage format dataType mediaSubtype mediaLines syncProjectId projectIds assigneeName')
    .lean();
  const lotById = new Map(lots.map((l) => [String(l._id), l]));
  const projectIds = [...new Set(lots.flatMap((l) => (l.syncProjectId ? [l.syncProjectId] : (l.projectIds ?? []).slice(0, 1))).map(String))];
  const projects = await Project.find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) } })
    .select('code name')
    .lean();
  const projectById = new Map(projects.map((p) => [String(p._id), p]));
  const dups = await LotItem.find({ duplicateCode: { $in: items.map((i) => i.code) } })
    .select('code duplicateCode')
    .lean();
  const dupOf = new Map<string, string[]>();
  for (const d of dups) dupOf.set(String(d.duplicateCode), [...(dupOf.get(String(d.duplicateCode)) ?? []), d.code]);

  // Sub-type labels, once per (format, sub-type).
  const labels = new Map<string, string>();
  const labelFor = async (format: string, subtype: string) => {
    const key = `${format}|${subtype}`;
    const hit = labels.get(key);
    if (hit !== undefined) return hit;
    const listKey = await mediaSubtypeListKeyAsync(format);
    const label = listKey ? ((await getReferenceList(listKey)).find((i) => i.value === subtype)?.label ?? subtype) : subtype;
    labels.set(key, label);
    return label;
  };

  const rows: MasterResponse['rows'] = [];
  for (const it of items) {
    const lot = lotById.get(String(it.lot));
    if (!lot) continue;
    const lines = (lot.mediaLines ?? []) as { format: string; dataType: string; mediaSubtype: string }[];
    const labelByLine = await Promise.all(lines.map((l) => labelFor(l.format, l.mediaSubtype)));
    const row = toGridRow(it, {
      format: lot.format,
      dataType: lot.dataType,
      mediaSubtype: lot.mediaSubtype,
      lines,
      labelByLine,
      duplicatedBy: dupOf.get(it.code) ?? [],
    });
    const pid = lot.syncProjectId ? String(lot.syncProjectId) : lot.projectIds?.[0] ? String(lot.projectIds[0]) : '';
    const project = pid ? projectById.get(pid) : undefined;
    rows.push({
      ...row,
      lotId: String(lot._id),
      lotReference: lot.lotReference,
      lotStage: lot.stage,
      projectCode: project?.code ?? '',
      projectName: project?.name ?? '',
      assigneeName: lot.assigneeName ?? '',
    });
  }
  return { rows, total, page: query.page, pageSize: query.pageSize };
}
