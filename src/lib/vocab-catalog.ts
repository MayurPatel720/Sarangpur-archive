/**
 * Seed catalog for admin-manageable vocabularies.
 *
 * Tier `open`   — free label/value CRUD. Values are immutable after create;
 *                 deactivating a value is how you retire it.
 * Tier `system` — the app reads meta (stage flags, format subtype lists) to
 *                 drive pipelines and validation. Labels/sort/active/meta are
 *                 editable; values never change.
 *
 * Pure data: no Mongoose, no side effects. `scripts/seed-data.ts` and the
 * admin mutations both import from here so protection and seed stay aligned.
 */

export type ListTier = 'open' | 'system';

export interface CatalogMetaField {
  field: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  unique: boolean;
}

export interface CatalogItem {
  value: string;
  label: string;
  active: boolean;
  sortOrder: number;
  meta: Record<string, unknown>;
}

export interface CatalogList {
  key: string;
  label: string;
  group: string;
  tier: ListTier;
  protected: boolean;
  metaSchema: CatalogMetaField[];
  items: CatalogItem[];
}

function items(
  rows: { value: string; label: string; meta?: Record<string, unknown> }[],
): CatalogItem[] {
  return rows.map((r, i) => ({
    value: r.value,
    label: r.label,
    active: true,
    sortOrder: i,
    meta: r.meta ?? {},
  }));
}

const NO_META: CatalogMetaField[] = [];

/** Stage flags used by the dashboard board, SLA alerts, and summary KPIs. */
const STAGE_META_SCHEMA: CatalogMetaField[] = [
  { field: 'terminal', type: 'boolean', required: false, unique: false },
  { field: 'board', type: 'boolean', required: false, unique: false },
  { field: 'inFlight', type: 'boolean', required: false, unique: false },
  { field: 'alertRole', type: 'string', required: false, unique: false },
  { field: 'discardable', type: 'boolean', required: false, unique: false },
];

const RETURN_STATUS_META_SCHEMA: CatalogMetaField[] = [
  { field: 'open', type: 'boolean', required: false, unique: false },
];

const FORMAT_META_SCHEMA: CatalogMetaField[] = [
  { field: 'subtypeListKey', type: 'string', required: false, unique: false },
  { field: 'defaultCodePrefix', type: 'string', required: false, unique: false },
];

const DECISION_META_SCHEMA: CatalogMetaField[] = [
  { field: 'disposition', type: 'string', required: false, unique: false },
];

export const SEED_SYSTEM_LISTS: CatalogList[] = [
  /* ------------------------------------------------------------- open tier */
  {
    key: 'originSource',
    label: 'Origin sources',
    group: 'Intake',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'MUM', label: 'Mumbai Mandir' },
      { value: 'AHM', label: 'Ahmedabad Mandir' },
      { value: 'SAR', label: 'Sarangpur Mandir' },
      { value: 'OTH', label: 'No Mandir origin' },
    ]),
  },
  {
    key: 'dataType',
    label: 'Data types',
    group: 'Media',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'physical', label: 'Physical' },
      { value: 'digital', label: 'Digital' },
    ]),
  },
  {
    key: 'notDigitizedReason',
    label: 'Not-digitized reasons',
    group: 'Intake',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'duplicate_in_mls', label: 'Duplicate of an item already in MLS' },
      { value: 'condition_too_poor', label: 'Condition too poor to scan' },
      { value: 'not_significant', label: 'Not historically significant' },
      { value: 'other', label: 'Other, recorded at intake' },
    ]),
  },
  {
    key: 'discardReason',
    label: 'Discard reasons',
    group: 'Decisions',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'duplicate', label: 'Duplicate' },
      { value: 'not_scannable', label: 'Not scannable' },
      { value: 'not_significant', label: 'Not significant' },
      { value: 'condition_too_poor', label: 'Condition too poor' },
      { value: 'other', label: 'Other' },
    ]),
  },
  {
    key: 'returnFormat',
    label: 'Return formats',
    group: 'Returns',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'physical', label: 'Physical original' },
      { value: 'digital', label: 'Digital copy' },
      { value: 'both', label: 'Both' },
      { value: 'none', label: 'None' },
    ]),
  },
  {
    key: 'returnStatus',
    label: 'Return statuses',
    group: 'Returns',
    tier: 'open',
    protected: true,
    metaSchema: RETURN_STATUS_META_SCHEMA,
    items: items([
      { value: 'not_requested', label: 'Not requested', meta: { open: false } },
      { value: 'pending', label: 'Pending', meta: { open: true } },
      { value: 'in_progress', label: 'In progress', meta: { open: true } },
      { value: 'returned', label: 'Returned', meta: { open: false } },
    ]),
  },
  {
    key: 'returnMethod',
    label: 'Return methods',
    group: 'Returns',
    tier: 'open',
    protected: false,
    metaSchema: NO_META,
    items: items([
      { value: 'In person', label: 'In person' },
      { value: 'Post', label: 'Post' },
      { value: 'Courier', label: 'Courier' },
      { value: 'Email', label: 'Email' },
    ]),
  },
  {
    key: 'scanStatus',
    label: 'Scan statuses',
    group: 'Digitize',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'pending', label: 'Pending' },
      { value: 'in_progress', label: 'In progress' },
      { value: 'scanned', label: 'Scanned' },
      { value: 'cannot_scan', label: 'Cannot scan' },
    ]),
  },
  {
    key: 'duplicateAction',
    label: 'Duplicate actions',
    group: 'MLS',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'retained', label: 'Retained' },
      { value: 'removed', label: 'Removed' },
      { value: 'merged', label: 'Merged' },
    ]),
  },
  {
    key: 'rightsType',
    label: 'Rights / consent types',
    group: 'Rights & Legal',
    tier: 'open',
    protected: true,
    metaSchema: NO_META,
    items: items([
      { value: 'deed_of_gift', label: 'Deed of gift' },
      { value: 'loan', label: 'Loan' },
      { value: 'verbal_permission', label: 'Verbal permission' },
      { value: 'unknown', label: 'Unknown / unrecorded' },
    ]),
  },
  {
    key: 'mediaSubtype.photo',
    label: 'Photo sub-types',
    group: 'Media',
    tier: 'open',
    protected: true,
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: false }],
    items: items([
      { value: '35MM Film — Album', label: '35MM Film — Album', meta: { codePrefix: 'ALB' } },
      { value: '35MM Film — Negatives', label: '35MM Film — Negatives', meta: { codePrefix: 'NEG' } },
      { value: '35MM Film — Positives', label: '35MM Film — Positives', meta: { codePrefix: 'POS' } },
      { value: '35MM Film — Slides', label: '35MM Film — Slides', meta: { codePrefix: 'SLD' } },
      { value: '120 Film — Negatives', label: '120 Film — Negatives', meta: { codePrefix: 'NEG' } },
      { value: '120 Film — Positives', label: '120 Film — Positives', meta: { codePrefix: 'POS' } },
      { value: '120 Film — Slides', label: '120 Film — Slides', meta: { codePrefix: 'SLD' } },
      { value: 'Large Format — Negatives', label: 'Large Format — Negatives', meta: { codePrefix: 'NEG' } },
      { value: 'Large Format — Positives', label: 'Large Format — Positives', meta: { codePrefix: 'POS' } },
      { value: 'Print — Print', label: 'Print — Print', meta: { codePrefix: 'PRT' } },
      { value: 'Print — Album', label: 'Print — Album', meta: { codePrefix: 'ALB' } },
      { value: 'Digital', label: 'Digital', meta: { codePrefix: 'DIG' } },
    ]),
  },
  {
    key: 'mediaSubtype.video',
    label: 'Video sub-types',
    group: 'Media',
    tier: 'open',
    protected: true,
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: false }],
    items: items([
      { value: '8mm', label: '8mm', meta: { codePrefix: '8MM' } },
      { value: '16mm', label: '16mm', meta: { codePrefix: '16M' } },
      { value: 'DV-CAM', label: 'DV-CAM', meta: { codePrefix: 'DVC' } },
      { value: 'DVD', label: 'DVD', meta: { codePrefix: 'DVD' } },
      { value: 'HI8', label: 'HI8', meta: { codePrefix: 'HI8' } },
      { value: 'Mini DVs', label: 'Mini DVs', meta: { codePrefix: 'MDV' } },
      { value: 'U-matic', label: 'U-matic', meta: { codePrefix: 'UMA' } },
      { value: 'VHS', label: 'VHS', meta: { codePrefix: 'VHS' } },
      { value: 'BetaCAM', label: 'BetaCAM', meta: { codePrefix: 'BET' } },
      { value: 'Digital', label: 'Digital', meta: { codePrefix: 'DIG' } },
    ]),
  },
  {
    key: 'mediaSubtype.audio',
    label: 'Audio sub-types',
    group: 'Media',
    tier: 'open',
    protected: true,
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: false }],
    items: items([
      { value: 'Spools', label: 'Spools', meta: { codePrefix: 'AUD' } },
      { value: 'Cassettes', label: 'Cassettes', meta: { codePrefix: 'AUD' } },
      { value: 'MDC', label: 'MDC', meta: { codePrefix: 'MDC' } },
      { value: 'Digital', label: 'Digital', meta: { codePrefix: 'DIG' } },
    ]),
  },

  /* ---------------------------------------------------------- system tier */
  {
    key: 'format',
    label: 'Formats',
    group: 'Media',
    tier: 'system',
    protected: true,
    metaSchema: FORMAT_META_SCHEMA,
    items: items([
      {
        value: 'photo',
        label: 'Photo',
        meta: { subtypeListKey: 'mediaSubtype.photo', defaultCodePrefix: 'NEG' },
      },
      {
        value: 'video',
        label: 'Video',
        meta: { subtypeListKey: 'mediaSubtype.video', defaultCodePrefix: 'VHS' },
      },
      {
        value: 'audio',
        label: 'Audio',
        meta: { subtypeListKey: 'mediaSubtype.audio', defaultCodePrefix: 'AUD' },
      },
      {
        value: 'documents',
        label: 'Documents',
        meta: { subtypeListKey: '', defaultCodePrefix: 'DOC' },
      },
      {
        value: 'prasadi',
        label: 'Prasadi',
        meta: { subtypeListKey: '', defaultCodePrefix: 'PRS' },
      },
    ]),
  },
  {
    key: 'stage',
    label: 'Stages',
    group: 'Workflow',
    tier: 'system',
    protected: true,
    metaSchema: STAGE_META_SCHEMA,
    items: items([
      { value: 'intake', label: 'Intake', meta: { terminal: false, board: true, inFlight: true, alertRole: '', discardable: false } },
      { value: 'decision', label: 'Decision', meta: { terminal: false, board: true, inFlight: true, alertRole: 'decision', discardable: false } },
      { value: 'metadata', label: 'Metadata', meta: { terminal: false, board: true, inFlight: true, alertRole: '', discardable: true } },
      { value: 'scanning', label: 'Scanning', meta: { terminal: false, board: true, inFlight: true, alertRole: 'scan', discardable: true } },
      { value: 'mls_tag', label: 'MLS tag', meta: { terminal: false, board: true, inFlight: true, alertRole: 'mls', discardable: true } },
      { value: 'storage', label: 'Storage', meta: { terminal: true, board: true, inFlight: false, alertRole: '', discardable: true } },
      { value: 'returned', label: 'Returned', meta: { terminal: true, board: true, inFlight: false, alertRole: '', discardable: false } },
      { value: 'discarded', label: 'Discarded', meta: { terminal: true, board: true, inFlight: false, alertRole: '', discardable: false } },
    ]),
  },
  {
    key: 'decision',
    label: 'Decisions',
    group: 'Decisions',
    tier: 'system',
    protected: true,
    metaSchema: DECISION_META_SCHEMA,
    items: items([
      { value: 'pending', label: 'Pending', meta: { disposition: '' } },
      { value: 'archive', label: 'Archive', meta: { disposition: 'archive' } },
      { value: 'return', label: 'Return', meta: { disposition: 'return' } },
      { value: 'discard', label: 'Discard', meta: { disposition: 'discard' } },
    ]),
  },
];

export const CATALOG_LIST_KEYS: string[] = SEED_SYSTEM_LISTS.map((l) => l.key);

export const PROTECTED_LIST_KEYS: ReadonlySet<string> = new Set(
  SEED_SYSTEM_LISTS.filter((l) => l.protected).map((l) => l.key),
);

/** Catalog entry by key, or undefined for fully custom admin lists. */
export function catalogList(key: string): CatalogList | undefined {
  return SEED_SYSTEM_LISTS.find((l) => l.key === key);
}

/** Wire shape for ReferenceList insert/upsert (matches Mongoose schema). */
export function catalogToSeedDoc(list: CatalogList): Record<string, unknown> {
  return {
    key: list.key,
    label: list.label,
    group: list.group,
    tier: list.tier,
    protected: list.protected,
    metaSchema: list.metaSchema,
    items: list.items.map((i) => ({ ...i, usageCount: 0 })),
    revision: 1,
  };
}
