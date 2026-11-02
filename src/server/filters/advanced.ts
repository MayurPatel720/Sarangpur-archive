import { Types } from 'mongoose';
import { HttpError } from '@/lib/api';
import {
  activeRules,
  FILTER_FIELDS,
  LOT_FILTER_FIELDS,
  PROJECT_FILTER_FIELDS,
  type AdvancedFilter,
  type FilterField,
  type FilterRule,
} from '@/lib/advanced-filters';
import { ArchiveLot } from '@/models/ArchiveLot';

/**
 * Turns an advanced filter into a MongoDB filter. Every field and condition is looked up in a fixed
 * table here, so a request can only ever ask for what is listed in `lib/advanced-filters`. No $lookup:
 * conditions on a project's lots are answered with one `distinct` over the lots, then an `_id` match.
 */

type Clause = Record<string, unknown>;

// local copy: lots/queries imports this file, so it cannot import from there
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lot fields: where each one lives in the document (a mixed lot keeps format / data type on its lines too). */
const LOT_PATHS: Record<string, string[]> = {
  lotReference: ['lotReference'],
  namingCode: ['namingCode'],
  owner: ['owner.name'],
  mediaSubtype: ['mediaSubtype', 'mediaLines.mediaSubtype'],
  originSource: ['originSource'],
  format: ['format', 'mediaLines.format'],
  dataType: ['dataType', 'mediaLines.dataType'],
  stage: ['stage'],
  decision: ['decision.status'],
  returnStatus: ['return.status'],
  quantity: ['quantity'],
  dateReceived: ['dateReceived'],
  assignee: ['assignee'],
  receiver: ['receiver'],
};

const PROJECT_PATHS: Record<string, string[]> = {
  code: ['code'],
  name: ['name'],
  description: ['description'],
  coordinator: ['coordinator'],
  createdAt: ['createdAt'],
  lotCount: ['lotCount'],
};

/** Day boundaries in India Standard Time, the archive's own calendar. */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00.000+05:30`);
const nextDay = (iso: string) => new Date(dayStart(iso).getTime() + 86_400_000);

function badValue(field: FilterField): never {
  throw new HttpError(400, `Invalid filter value for “${field.label}”.`);
}

function asObjectId(value: string, field: FilterField): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) badValue(field);
  return new Types.ObjectId(value);
}

/** The condition on one path for one rule (`not` rules are wrapped by the caller for multi-path fields). */
function condition(rule: FilterRule, field: FilterField): { cond: unknown; negate: boolean } {
  const v = (rule.value ?? '').trim();
  const v2 = (rule.value2 ?? '').trim();
  const asNumber = (s: string) => {
    const n = Number(s);
    if (!Number.isFinite(n)) badValue(field);
    return n;
  };
  const asDay = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(dayStart(s).getTime())) badValue(field);
    return s;
  };
  switch (rule.op) {
    case 'empty':
      return { cond: { $in: [null, ''] }, negate: false };
    case 'not_empty':
      return { cond: { $nin: [null, ''] }, negate: false };
    case 'contains':
      return { cond: new RegExp(escapeRegex(v), 'i'), negate: false };
    case 'not_contains':
      return { cond: new RegExp(escapeRegex(v), 'i'), negate: true };
    case 'starts':
      return { cond: new RegExp(`^${escapeRegex(v)}`, 'i'), negate: false };
    case 'eq':
      if (field.type === 'text') return { cond: new RegExp(`^${escapeRegex(v)}$`, 'i'), negate: false };
      if (field.type === 'number') return { cond: asNumber(v), negate: false };
      return { cond: field.type === 'user' ? asObjectId(v, field) : v, negate: false };
    case 'neq':
      if (field.type === 'text') return { cond: new RegExp(`^${escapeRegex(v)}$`, 'i'), negate: true };
      if (field.type === 'number') return { cond: asNumber(v), negate: true };
      return { cond: field.type === 'user' ? asObjectId(v, field) : v, negate: true };
    case 'gt':
      return { cond: { $gt: asNumber(v) }, negate: false };
    case 'gte':
      return { cond: { $gte: asNumber(v) }, negate: false };
    case 'lt':
      return { cond: { $lt: asNumber(v) }, negate: false };
    case 'lte':
      return { cond: { $lte: asNumber(v) }, negate: false };
    case 'between':
      if (field.type === 'date') return { cond: { $gte: dayStart(asDay(v)), $lt: nextDay(asDay(v2)) }, negate: false };
      return { cond: { $gte: asNumber(v), $lte: asNumber(v2) }, negate: false };
    case 'on':
      return { cond: { $gte: dayStart(asDay(v)), $lt: nextDay(v) }, negate: false };
    case 'before':
      return { cond: { $lt: dayStart(asDay(v)) }, negate: false };
    case 'after':
      return { cond: { $gte: nextDay(asDay(v)) }, negate: false };
    default:
      throw new HttpError(400, `Unknown filter condition “${rule.op}”.`);
  }
}

/** One rule on one or more paths: positive rules match ANY path, negative rules match NO path. */
function clauseFor(rule: FilterRule, field: FilterField, paths: string[]): Clause {
  const { cond, negate } = condition(rule, field);
  const on = (path: string): Clause => ({ [path]: cond });
  if (!negate) return paths.length === 1 ? on(paths[0]!) : { $or: paths.map(on) };
  return { $nor: paths.map(on) };
}

function combine(match: AdvancedFilter['match'], clauses: Clause[]): Clause | null {
  if (clauses.length === 0) return null;
  return match === 'any' ? { $or: clauses } : { $and: clauses };
}

/** The Mongo filter for the lot list, or null when the filter has no complete row. */
export function buildLotAdvanced(f: AdvancedFilter): Clause | null {
  const clauses = activeRules(f, LOT_FILTER_FIELDS).map((rule) => {
    const field = FILTER_FIELDS.lots.find((x) => x.id === rule.field)!;
    return clauseFor(rule, field, LOT_PATHS[field.id]!);
  });
  return combine(f.match, clauses);
}

/** The Mongo filter for the project list (async: lot-based fields look the matching projects up first). */
export async function buildProjectAdvanced(f: AdvancedFilter): Promise<Clause | null> {
  const clauses: Clause[] = [];
  for (const rule of activeRules(f, PROJECT_FILTER_FIELDS)) {
    const field = FILTER_FIELDS.projects.find((x) => x.id === rule.field)!;
    const direct = PROJECT_PATHS[field.id];
    if (direct) {
      clauses.push(clauseFor(rule, field, direct));
      continue;
    }
    const v = (rule.value ?? '').trim();
    const lotMatch: Clause =
      field.id === 'lotFormat'
        ? { $or: [{ format: v }, { 'mediaLines.format': v }] }
        : field.id === 'lotStage'
          ? { stage: v }
          : { assignee: asObjectId(v, field) };
    const ids = await ArchiveLot.distinct('projectIds', lotMatch);
    clauses.push({ _id: rule.op === 'neq' ? { $nin: ids } : { $in: ids } });
  }
  return combine(f.match, clauses);
}
