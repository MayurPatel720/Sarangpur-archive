/**
 * The columns of a lot's Excel (Items tab), in one place — the grid, the Excel export /
 * import and the column menus all read this list.
 *
 * Four departments, each a band of columns (row 1 of the exported sheet is the department,
 * row 2 the column names):
 *
 *   Details                 Media type · Archive code · Sender's code · Date · Place · Name on tape ·
 *                           Name on case · Phy source · Remark · Duplicate code
 *   Decision                digital · redigital · discard · Remark
 *   Digitalization & Storage  Captured · Dig source · File path · Phy storage loc. · Return / discard ·
 *                           MLS tagged · Remark
 *   Logging                 Status · Logging date · Logger's name
 *
 * Users can add their own columns to a lot's Excel (`lot.customColumns`) — each one belongs
 * to one of the departments above and is stored per item under `custom[key]`.
 *
 * Some columns belong to one media format only (`formats` / `notFormats`) — Prasadi sheets
 * show their own set; see `appliesToFormat`.
 *
 * TO CHANGE A COLUMN: edit its line below. `field` is the key the grid PATCH accepts
 * (`ItemsBulkSet`); a column without `field` is read-only (or has its own flow).
 */

export const DEPARTMENTS = [
  { id: 'details', label: 'Details' },
  { id: 'decision', label: 'Decision' },
  { id: 'storage', label: 'Digitalization & Storage' },
  { id: 'logging', label: 'Logging' },
  { id: 'removal', label: 'Removal' },
] as const;
export type DeptId = (typeof DEPARTMENTS)[number]['id'];
export const DEPT_IDS = DEPARTMENTS.map((d) => d.id) as [DeptId, ...DeptId[]];
/** Departments a team can add its own columns to — Removal belongs to Prasadi's remove flow only. */
export const CUSTOM_DEPARTMENTS = DEPARTMENTS.filter((d) => d.id !== 'removal');
export type CustomDeptId = Exclude<DeptId, 'removal'>;
export const CUSTOM_DEPT_IDS = CUSTOM_DEPARTMENTS.map((d) => d.id) as [CustomDeptId, ...CustomDeptId[]];
export const deptLabel = (id: string) => (id === 'lot' ? 'Lot' : (DEPARTMENTS.find((d) => d.id === id)?.label ?? id));

export type ColumnKind =
  | 'readonly' //  shown, never edited here
  | 'text'
  | 'longtext'
  | 'dateRange' // dd/mm/yyyy - dd/mm/yyyy
  | 'date' //      dd/mm/yyyy
  | 'ref' //       admin-managed dropdown list (see `refList`)
  | 'yesno' //     Yes / No / blank (three-state)
  | 'flag' //      Yes / blank (two-state)
  | 'disposition' // Return / Discard / blank
  | 'code' //      the item code (own popup)
  | 'duplicate' // duplicate code (own flow)
  | 'weeks' //     whole number of weeks, always shown as "3 weeks"
  | 'info' //      computed text, shown but never edited here
  | 'number' //    whole number
  | 'photo' //     the item's photos: a thumbnail, click to open them (see item images)
  | 'status'; //   Prasadi: Active / Inactive / Details Missing (worked out; click to change)

export interface ColumnSpec {
  id: string;
  label: string;
  /** `lot` = the Master Excel's lot / project columns (not part of a lot's own Excel). */
  dept: DeptId | 'lot';
  kind: ColumnKind;
  /** Key in `ItemsBulkSet` for editable columns. */
  field?: string;
  width: number;
  /** Reference-list key for `kind: 'ref'`. */
  refList?: string;
  /** Short hint shown as the header tooltip. */
  hint?: string;
  /** Only on sheets of these media formats (default: every format). */
  formats?: string[];
  /** Left out of sheets of these media formats (default: none). */
  notFormats?: string[];
  /**
   * Format-specific value kept in the item's `attrs` map under `field` (so a new column needs no
   * model, type or API change — only a line here). Without it the value has its own item field.
   */
  attr?: boolean;
  /** Label to show instead of `label` on sheets of a given media format (e.g. Date → "Date received" for Prasadi). */
  labels?: Record<string, string>;
  /** Columns cleared when this one changes (a dependent dropdown: changing Category clears Subcategory). */
  resets?: string[];
  /** For a dependent `ref` column: the list items carry `meta[metaKey]` = the parent column's value. */
  refParent?: { column: string; metaKey: string };
  /** Extra check the server runs on the saved value. */
  check?: 'itemCodes';
  /** A starred field: while it is empty the item shows "Details Missing" (saving is never blocked). */
  required?: boolean;
  /** Shown in the grid but changed only from its own dialog (the Remove-from-archive form), never in the cell, the bulk bar or an import. */
  viaDialog?: boolean;
  /** Keep this column in the Master Excel's "All formats" view even though some formats leave it out. */
  common?: boolean;
}

type FormatRule = Pick<ColumnSpec, 'formats' | 'notFormats'>;

/** Does this column belong on a sheet of the given media format? `null` = no format known: show it. */
export const appliesToFormat = (c: FormatRule, format: string | null): boolean =>
  format === null || ((!c.formats || c.formats.includes(format)) && !c.notFormats?.includes(format));

/** A column every media format has — what the Master Excel shows when no single format is chosen. */
export const isCommonColumn = (c: FormatRule & { common?: boolean }): boolean => c.common === true || (!c.formats && !c.notFormats);

/** The column's label on a sheet of the given format (a few columns read differently, e.g. Prasadi's "Date received"). */
export const labelFor = (c: Pick<ColumnSpec, 'label' | 'labels'>, format: string | null): string =>
  (format !== null && c.labels?.[format]) || c.label;

/**
 * A format's own column order (within each department), where it differs from the registry's.
 * Prasadi follows the requirements document, number by number:
 *   1 Title · 2 Category · 3 Subcategory · 4 Guru · 5 Date used by Guru · 6 Area used by Guru ·
 *   7 Item details · 8 Quantity · 9 Item history · 10 Occasion (prasang) · 11 Date received ·
 *   12 Received by · 13 Location (Room, Cabinet, Shelf) · 14 Related media
 * with the Status first, the item's Photo next to its Title (then its Photo Archive reference),
 * Place read as "Location used by Guru", and the shared columns (Sender's code, Phy source, Remark) after them. Columns not listed keep their registry order, after the listed ones.
 */
export const FORMAT_COLUMN_ORDER: Record<string, string[]> = {
  prasadi: [
    'status', 'itemName', 'photo', 'photoArchive', 'category', 'subcategory', 'blessedBy', 'place', 'usedOn', 'usedArea',
    'description', 'quantity', 'history', 'event', 'dateRange', 'receivedFrom', 'receivedBy', 'room', 'cabinet', 'shelf',
    'relatedMedia', 'itemCondition',
  ],
};

/**
 * The columns of one media format's sheet, ready to show: only the ones that apply, labelled the way
 * that format reads them, in its own order. The identity columns (Media type, Archive code) stay first
 * and departments keep their order; custom columns stay last in their department.
 */
export function forFormat<T extends Pick<ColumnSpec, 'id' | 'label' | 'labels' | 'dept' | 'kind' | 'formats' | 'notFormats'>>(cols: T[], format: string): T[] {
  const applicable = cols.filter((c) => appliesToFormat(c, format)).map((c) => ({ ...c, label: labelFor(c, format) }));
  const order = FORMAT_COLUMN_ORDER[format];
  if (!order) return applicable;
  const rank = (c: T) => {
    if (c.kind === 'readonly' || c.kind === 'code') return -1; // identity columns first
    const i = order.indexOf(c.id);
    return i === -1 ? order.length : i;
  };
  // Stable sort inside each department; the departments themselves keep their first-seen order.
  const depts: string[] = [];
  for (const c of applicable) if (!depts.includes(c.dept)) depts.push(c.dept);
  return depts.flatMap((d) => {
    const group = applicable.filter((c) => c.dept === d);
    return group.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  });
}

/** Every name a column answers to — its base label and each per-format one — for matching an imported header. */
export const allLabels = (c: Pick<ColumnSpec, 'label' | 'labels'>): string[] => [c.label, ...Object.values(c.labels ?? {})];


/*
 * Prasadi = a physical holy item blessed by a Guru (Mahant Swami, Pramukh Swami, Yogiji, Shastriji
 * Maharaj …). It is stored, stickered with its archive code and tracked here. A lot's intake form
 * already records who it came from, so these columns describe the ITEM: title, category, Guru,
 * when / where it was used, details, quantity, history, occasion, who received it, related media,
 * its photos, condition, whether the sticker is on, and where it is kept (room / cabinet / shelf).
 * Tape / case names, the digital-copy source and duplicate links only make sense for media, so
 * Prasadi sheets leave them out.
 */
export const PRASADI_FORMAT = 'prasadi';
const PRASADI = [PRASADI_FORMAT];

export const BUILTIN_COLUMNS: ColumnSpec[] = [
  // Details
  { id: 'mediaType', label: 'Media type', dept: 'details', kind: 'readonly', width: 190 },
  { id: 'code', label: 'Archive code', dept: 'details', kind: 'code', width: 200, hint: 'Click a code to change its abbreviations or number.' },
  { id: 'senderCode', label: "Sender's code", dept: 'details', kind: 'text', field: 'senderCode', width: 140 },
  { id: 'dateRange', label: 'Date', dept: 'details', kind: 'dateRange', field: 'dateRange', width: 210, labels: { prasadi: 'Date received' }, hint: 'dd/mm/yyyy or a range: dd/mm/yyyy - dd/mm/yyyy' },
  { id: 'place', label: 'Place', dept: 'details', kind: 'text', field: 'place', width: 160, labels: { prasadi: 'Location used by Guru' }, hint: 'More than one place: separate with commas.' },
  // Prasadi — what the item is, who used it and where it came from (see docs: "Prasadi Item Requirements").
  { id: 'status', label: 'Status', dept: 'details', kind: 'status', width: 150, formats: PRASADI, hint: 'Active, Inactive (removed from the archive) or Details Missing (a starred field is still empty). Click to see what is missing or to remove the item.' },
  { id: 'itemName', required: true, label: 'Title', dept: 'details', kind: 'text', field: 'itemName', width: 200, formats: PRASADI, hint: 'What it is, e.g. Mala, Vastra, Charnarvind, Walking stick.' },
  { id: 'photo', required: true, label: 'Photo', dept: 'details', kind: 'photo', width: 180, formats: PRASADI, hint: 'Click to see, take or add photos of this item (up to 5; the first is the cover).' },
  { id: 'photoArchive', label: 'Photo Archive', dept: 'details', kind: 'text', field: 'photoArchive', attr: true, width: 190, formats: PRASADI, hint: 'The photo-archive reference of a photo of this item, e.g. PSM.SPUR.1116874.' },
  { id: 'category', required: true, label: 'Category', dept: 'details', kind: 'ref', field: 'category', attr: true, refList: 'prasadiCategory', resets: ['subcategory'], width: 170, formats: PRASADI },
  { id: 'subcategory', label: 'Subcategory', dept: 'details', kind: 'ref', field: 'subcategory', attr: true, refList: 'prasadiSubcategory', refParent: { column: 'category', metaKey: 'category' }, width: 190, formats: PRASADI, hint: 'Pick the Category first — only its subcategories are offered.' },
  { id: 'blessedBy', required: true, label: 'Guru', dept: 'details', kind: 'ref', field: 'blessedBy', attr: true, refList: 'guru', width: 200, formats: PRASADI, hint: 'The Guru who used / blessed it.' },
  { id: 'usedOn', label: 'Date used by Guru', dept: 'details', kind: 'dateRange', field: 'usedOn', attr: true, width: 200, formats: PRASADI, hint: 'dd/mm/yyyy, a range, or just a year.' },
  { id: 'usedArea', label: 'Area used by Guru', dept: 'details', kind: 'text', field: 'usedArea', attr: true, width: 190, formats: PRASADI },
  { id: 'description', required: true, label: 'Item details', dept: 'details', kind: 'text', field: 'description', width: 260, formats: PRASADI, hint: 'Brand / model, colour, size, material, markings — enough to recognise it (e.g. RayBan).' },
  { id: 'quantity', required: true, label: 'Quantity', dept: 'details', kind: 'number', field: 'quantity', attr: true, width: 110, formats: PRASADI, hint: 'How many of this item (a whole number).' },
  { id: 'history', label: 'Item history', dept: 'details', kind: 'longtext', field: 'history', attr: true, width: 280, formats: PRASADI, hint: 'Where it came from and how it was used.' },
  { id: 'event', label: 'Occasion', dept: 'details', kind: 'text', field: 'event', width: 200, formats: PRASADI, hint: 'The prasang: when / how it was given, e.g. Diksha day, home visit, festival.' },
  { id: 'receivedFrom', label: 'Received From', dept: 'details', kind: 'text', field: 'receivedFrom', attr: true, width: 180, formats: PRASADI, hint: 'Who gave it to the archive.' },
  { id: 'receivedBy', label: 'Received by', dept: 'details', kind: 'text', field: 'receivedBy', attr: true, width: 170, formats: PRASADI, hint: 'The point of contact who received it.' },
  { id: 'relatedMedia', label: 'Related media', dept: 'details', kind: 'text', field: 'relatedMedia', attr: true, check: 'itemCodes', width: 220, formats: PRASADI, hint: 'Archive codes of related photos / videos, separated by commas.' },
  { id: 'itemCondition', label: 'Condition', dept: 'details', kind: 'text', field: 'itemCondition', width: 150, formats: PRASADI, hint: 'e.g. Good, Fragile, Needs care.' },
  { id: 'nameOnTape', label: 'Name on tape', dept: 'details', kind: 'text', field: 'nameOnTape', width: 170, notFormats: PRASADI },
  { id: 'nameOnCase', label: 'Name on case', dept: 'details', kind: 'text', field: 'nameOnCase', width: 170, notFormats: PRASADI },
  { id: 'physicalSource', label: 'Phy source', dept: 'details', kind: 'text', field: 'physicalSource', width: 160 },
  { id: 'remarks', label: 'Remark', dept: 'details', kind: 'text', field: 'remarks', width: 180 },
  { id: 'duplicateCode', label: 'Duplicate code', dept: 'details', kind: 'duplicate', width: 210, notFormats: PRASADI, hint: 'Type the code of the item this one duplicates (any lot).' },
  // Decision
  // (Prasadi cannot be digitized: it is kept physically, so it has no Decision columns.)
  { id: 'digital', label: 'Digital', dept: 'decision', kind: 'yesno', field: 'digital', width: 100, notFormats: PRASADI },
  { id: 'redigital', label: 'Redigital', dept: 'decision', kind: 'yesno', field: 'redigital', width: 110, notFormats: PRASADI },
  { id: 'discard', label: 'Discard', dept: 'decision', kind: 'yesno', field: 'discard', width: 100, notFormats: PRASADI },
  { id: 'decisionRemark', label: 'Remark', dept: 'decision', kind: 'text', field: 'decisionRemark', width: 180, notFormats: PRASADI },
  // Digitalization & Storage
  { id: 'captured', label: 'Captured', dept: 'storage', kind: 'flag', field: 'captured', width: 110, notFormats: PRASADI },
  { id: 'digitalSource', label: 'Dig source', dept: 'storage', kind: 'text', field: 'digitalSource', width: 150, notFormats: PRASADI, hint: 'Where the digital copy came from, e.g. Mumbai.' },
  { id: 'fileName', label: 'File path', dept: 'storage', kind: 'text', field: 'fileName', width: 240 },
  { id: 'phyStorageLoc', label: 'Phy storage loc.', dept: 'storage', kind: 'text', field: 'phyStorageLoc', width: 170, notFormats: PRASADI, common: true },
  { id: 'room', required: true, label: 'Room', dept: 'details', kind: 'ref', field: 'room', attr: true, refList: 'prasadiRoom', width: 220, formats: PRASADI },
  { id: 'cabinet', label: 'Cabinet', dept: 'details', kind: 'text', field: 'cabinet', attr: true, width: 110, formats: PRASADI, hint: 'Cabinet number.' },
  { id: 'shelf', label: 'Shelf', dept: 'details', kind: 'text', field: 'shelf', attr: true, width: 100, formats: PRASADI, hint: 'Shelf number.' },
  { id: 'stickerApplied', label: 'Sticker applied', dept: 'storage', kind: 'flag', field: 'stickerApplied', attr: true, width: 130, formats: PRASADI, hint: 'Yes = the archive-code sticker is on the item.' },
  { id: 'recheckWeeks', label: 'Re-check in', dept: 'storage', kind: 'weeks', field: 'recheckWeeks', width: 130, formats: PRASADI, hint: 'Type a number of weeks. When they pass, the item shows on the Alerts page to be checked again.' },
  { id: 'nextCheckDue', label: 'Next check due', dept: 'storage', kind: 'info', width: 140, formats: PRASADI },
  { id: 'lastCheckedAt', label: 'Last checked', dept: 'storage', kind: 'info', width: 130, formats: PRASADI },
  { id: 'disposition', label: 'Return / discard', dept: 'storage', kind: 'disposition', field: 'disposition', width: 150 },
  { id: 'taggedInMls', label: 'MLS tagged', dept: 'storage', kind: 'flag', field: 'taggedInMls', width: 120 },
  { id: 'storageRemark', label: 'Remark', dept: 'storage', kind: 'text', field: 'storageRemark', width: 180 },
  // Logging
  { id: 'logged', label: 'Status', dept: 'logging', kind: 'flag', field: 'logged', width: 100, hint: 'Yes = this row has been logged.' },
  { id: 'loggedAt', label: 'Logging date', dept: 'logging', kind: 'date', field: 'loggedAt', width: 140 },
  { id: 'loggerName', label: "Logger's name", dept: 'logging', kind: 'text', field: 'loggerName', width: 160 },
  // Removal — filled in when a Prasadi item is taken out of the archive (Status → Inactive).
  { id: 'removedOn', label: 'Date removed from archive', dept: 'removal', kind: 'date', field: 'removedOn', attr: true, viaDialog: true, width: 190, formats: PRASADI },
  { id: 'sentBy', label: 'Item sent by', dept: 'removal', kind: 'text', field: 'sentBy', attr: true, viaDialog: true, width: 170, formats: PRASADI },
  { id: 'sentFrom', label: 'Location item sent from', dept: 'removal', kind: 'text', field: 'sentFrom', attr: true, viaDialog: true, width: 190, formats: PRASADI },
  { id: 'requestedBy', label: 'Item request person', dept: 'removal', kind: 'text', field: 'requestedBy', attr: true, viaDialog: true, width: 180, formats: PRASADI },
  { id: 'newLocation', label: 'New item location', dept: 'removal', kind: 'text', field: 'newLocation', attr: true, viaDialog: true, width: 190, formats: PRASADI },
  { id: 'sentTo', label: 'Item sent to', dept: 'removal', kind: 'text', field: 'sentTo', attr: true, viaDialog: true, width: 170, formats: PRASADI },
  { id: 'receivedAtNewOn', label: 'Date received at new location', dept: 'removal', kind: 'date', field: 'receivedAtNewOn', attr: true, viaDialog: true, width: 210, formats: PRASADI },
  { id: 'requestHistory', label: 'Request history', dept: 'removal', kind: 'longtext', field: 'requestHistory', attr: true, viaDialog: true, width: 300, formats: PRASADI },
];

/** Columns that can never be hidden — the row's identity. */
export const ALWAYS_VISIBLE = new Set(['code']);

export type CustomColumnType = 'text' | 'number' | 'yesno' | 'date';
export const CUSTOM_COLUMN_TYPES: { id: CustomColumnType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'yesno', label: 'Yes / No' },
  { id: 'date', label: 'Date' },
];

export interface CustomColumn {
  key: string;
  label: string;
  type: CustomColumnType;
  dept: CustomDeptId;
}

/** Built-in columns + the lot's custom ones, in department order (custom last within a department). */
export function allColumns(custom: CustomColumn[]): (ColumnSpec & { custom?: CustomColumn })[] {
  const extra = custom.map((c) => ({
    id: c.key,
    label: c.label,
    dept: c.dept,
    kind: (c.type === 'yesno' ? 'yesno' : c.type === 'date' ? 'date' : 'text') as ColumnKind,
    width: 160,
    custom: c,
  }));
  return DEPARTMENTS.flatMap((d) => [
    ...BUILTIN_COLUMNS.filter((c) => c.dept === d.id),
    ...extra.filter((c) => c.dept === d.id),
  ]);
}
