import { z } from 'zod';

/**
 * Advanced filters for the lot and project lists: a few "field · condition · value" rows joined by
 * ALL / ANY. The browser sends them as one JSON string (`adv`); the server only accepts the fields and
 * conditions listed here (never a raw field name), so nothing user-typed reaches a query unchecked.
 */

export type FilterFieldType = 'text' | 'number' | 'date' | 'select' | 'user';
export type FilterOptions = 'format' | 'stage' | 'decision' | 'dataType' | 'returnStatus' | 'originSource';

export interface FilterField {
  id: string;
  label: string;
  type: FilterFieldType;
  /** Which admin-managed list fills a `select` field. */
  options?: FilterOptions;
  /** Conditions allowed for this field, when fewer than its type's usual set. */
  ops?: readonly string[];
}

export const OPERATORS: Record<FilterFieldType, readonly { id: string; label: string }[]> = {
  text: [
    { id: 'contains', label: 'contains' },
    { id: 'not_contains', label: 'does not contain' },
    { id: 'eq', label: 'is' },
    { id: 'neq', label: 'is not' },
    { id: 'starts', label: 'starts with' },
    { id: 'empty', label: 'is empty' },
    { id: 'not_empty', label: 'is not empty' },
  ],
  number: [
    { id: 'eq', label: 'equals' },
    { id: 'neq', label: 'does not equal' },
    { id: 'gt', label: 'is more than' },
    { id: 'gte', label: 'is at least' },
    { id: 'lt', label: 'is less than' },
    { id: 'lte', label: 'is at most' },
    { id: 'between', label: 'is between' },
  ],
  date: [
    { id: 'on', label: 'is on' },
    { id: 'before', label: 'is before' },
    { id: 'after', label: 'is after' },
    { id: 'between', label: 'is between' },
    { id: 'empty', label: 'is empty' },
    { id: 'not_empty', label: 'is not empty' },
  ],
  select: [
    { id: 'eq', label: 'is' },
    { id: 'neq', label: 'is not' },
    { id: 'empty', label: 'is empty' },
    { id: 'not_empty', label: 'is not empty' },
  ],
  user: [
    { id: 'eq', label: 'is' },
    { id: 'neq', label: 'is not' },
    { id: 'empty', label: 'is empty' },
    { id: 'not_empty', label: 'is not empty' },
  ],
};

export const LOT_FILTER_FIELDS: readonly FilterField[] = [
  { id: 'lotReference', label: 'Lot number', type: 'text' },
  { id: 'namingCode', label: 'Naming code', type: 'text' },
  { id: 'owner', label: 'Owner name', type: 'text' },
  { id: 'mediaSubtype', label: 'Media sub-type', type: 'text' },
  { id: 'originSource', label: 'Origin', type: 'select', options: 'originSource' },
  { id: 'format', label: 'Format', type: 'select', options: 'format' },
  { id: 'dataType', label: 'Data type', type: 'select', options: 'dataType' },
  { id: 'stage', label: 'Stage', type: 'select', options: 'stage' },
  { id: 'decision', label: 'Decision', type: 'select', options: 'decision' },
  { id: 'returnStatus', label: 'Return status', type: 'select', options: 'returnStatus' },
  { id: 'quantity', label: 'Quantity', type: 'number' },
  { id: 'dateReceived', label: 'Date received', type: 'date' },
  { id: 'assignee', label: 'Assignee', type: 'user' },
  { id: 'receiver', label: 'Receiver', type: 'user' },
];

export const PROJECT_FILTER_FIELDS: readonly FilterField[] = [
  { id: 'code', label: 'Project code', type: 'text' },
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'description', label: 'Description', type: 'text' },
  { id: 'coordinator', label: 'Coordinator', type: 'user' },
  { id: 'createdAt', label: 'Created on', type: 'date', ops: ['on', 'before', 'after', 'between'] },
  { id: 'lotCount', label: 'Number of lots', type: 'number' },
  { id: 'lotFormat', label: 'Has a lot of format', type: 'select', options: 'format', ops: ['eq', 'neq'] },
  { id: 'lotStage', label: 'Has a lot at stage', type: 'select', options: 'stage', ops: ['eq', 'neq'] },
  { id: 'lotAssignee', label: 'Has a lot assigned to', type: 'user', ops: ['eq', 'neq'] },
];

export type FilterEntity = 'lots' | 'projects';
export const FILTER_FIELDS: Record<FilterEntity, readonly FilterField[]> = {
  lots: LOT_FILTER_FIELDS,
  projects: PROJECT_FILTER_FIELDS,
};

export const MAX_FILTER_RULES = 10;

export const filterRuleSchema = z.object({
  field: z.string().max(40),
  op: z.string().max(20),
  value: z.string().max(200).optional(),
  value2: z.string().max(200).optional(),
});
export const advancedFilterSchema = z.object({
  match: z.enum(['all', 'any']).default('all'),
  rules: z.array(filterRuleSchema).max(MAX_FILTER_RULES),
});
export type FilterRule = z.output<typeof filterRuleSchema>;
export type AdvancedFilter = z.output<typeof advancedFilterSchema>;

export const EMPTY_ADVANCED: AdvancedFilter = { match: 'all', rules: [] };

export const opsFor = (field: FilterField) => OPERATORS[field.type].filter((o) => !field.ops || field.ops.includes(o.id));

const NEEDS_NO_VALUE = new Set(['empty', 'not_empty']);

/** A row that can be applied: it names a known field and condition and has the value(s) that condition needs. */
export function isRuleComplete(rule: FilterRule, fields: readonly FilterField[]): boolean {
  const field = fields.find((f) => f.id === rule.field);
  if (!field || !opsFor(field).some((o) => o.id === rule.op)) return false;
  if (NEEDS_NO_VALUE.has(rule.op)) return true;
  if (!rule.value?.trim()) return false;
  if (rule.op === 'between' && !rule.value2?.trim()) return false;
  if (field.type === 'number' && (!Number.isFinite(Number(rule.value)) || (rule.op === 'between' && !Number.isFinite(Number(rule.value2))))) return false;
  return true;
}

/** The completed rows of a filter. */
export const activeRules = (f: AdvancedFilter | null, fields: readonly FilterField[]): FilterRule[] =>
  f ? f.rules.filter((r) => isRuleComplete(r, fields)) : [];

/** The `adv` string from a URL / request; null when absent, empty or not a valid filter. */
export function parseAdvanced(raw: string | null | undefined): AdvancedFilter | null {
  if (!raw) return null;
  try {
    const parsed = advancedFilterSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** What the page keeps in its state and sends: '' when no row is complete. */
export function serializeAdvanced(f: AdvancedFilter, fields: readonly FilterField[]): string {
  const rules = activeRules(f, fields);
  return rules.length === 0 ? '' : JSON.stringify({ match: f.match, rules });
}
