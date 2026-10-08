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
 * TO CHANGE A COLUMN: edit its line below. `field` is the key the grid PATCH accepts
 * (`ItemsBulkSet`); a column without `field` is read-only (or has its own flow).
 */

export const DEPARTMENTS = [
  { id: 'details', label: 'Details' },
  { id: 'decision', label: 'Decision' },
  { id: 'storage', label: 'Digitalization & Storage' },
  { id: 'logging', label: 'Logging' },
] as const;
export type DeptId = (typeof DEPARTMENTS)[number]['id'];
export const DEPT_IDS = DEPARTMENTS.map((d) => d.id) as [DeptId, ...DeptId[]];
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
  | 'duplicate'; // duplicate code (own flow)

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
}

export const BUILTIN_COLUMNS: ColumnSpec[] = [
  // Details
  { id: 'mediaType', label: 'Media type', dept: 'details', kind: 'readonly', width: 190 },
  { id: 'code', label: 'Archive code', dept: 'details', kind: 'code', width: 200, hint: 'Click a code to change its abbreviations or number.' },
  { id: 'senderCode', label: "Sender's code", dept: 'details', kind: 'text', field: 'senderCode', width: 140 },
  { id: 'dateRange', label: 'Date', dept: 'details', kind: 'dateRange', field: 'dateRange', width: 210, hint: 'dd/mm/yyyy or a range: dd/mm/yyyy - dd/mm/yyyy' },
  { id: 'place', label: 'Place', dept: 'details', kind: 'text', field: 'place', width: 160, hint: 'More than one place: separate with commas.' },
  { id: 'nameOnTape', label: 'Name on tape', dept: 'details', kind: 'text', field: 'nameOnTape', width: 170 },
  { id: 'nameOnCase', label: 'Name on case', dept: 'details', kind: 'text', field: 'nameOnCase', width: 170 },
  { id: 'physicalSource', label: 'Phy source', dept: 'details', kind: 'ref', field: 'physicalSource', refList: 'physicalSource', width: 160 },
  { id: 'remarks', label: 'Remark', dept: 'details', kind: 'text', field: 'remarks', width: 180 },
  { id: 'duplicateCode', label: 'Duplicate code', dept: 'details', kind: 'duplicate', width: 210, hint: 'Type the code of the item this one duplicates (any lot).' },
  // Decision
  { id: 'digital', label: 'Digital', dept: 'decision', kind: 'yesno', field: 'digital', width: 100 },
  { id: 'redigital', label: 'Redigital', dept: 'decision', kind: 'yesno', field: 'redigital', width: 110 },
  { id: 'discard', label: 'Discard', dept: 'decision', kind: 'yesno', field: 'discard', width: 100 },
  { id: 'decisionRemark', label: 'Remark', dept: 'decision', kind: 'text', field: 'decisionRemark', width: 180 },
  // Digitalization & Storage
  { id: 'captured', label: 'Captured', dept: 'storage', kind: 'flag', field: 'captured', width: 110 },
  { id: 'digitalSource', label: 'Dig source', dept: 'storage', kind: 'text', field: 'digitalSource', width: 150, hint: 'Where the digital copy came from, e.g. Mumbai.' },
  { id: 'fileName', label: 'File path', dept: 'storage', kind: 'text', field: 'fileName', width: 240 },
  { id: 'phyStorageLoc', label: 'Phy storage loc.', dept: 'storage', kind: 'text', field: 'phyStorageLoc', width: 170 },
  { id: 'disposition', label: 'Return / discard', dept: 'storage', kind: 'disposition', field: 'disposition', width: 150 },
  { id: 'taggedInMls', label: 'MLS tagged', dept: 'storage', kind: 'flag', field: 'taggedInMls', width: 120 },
  { id: 'storageRemark', label: 'Remark', dept: 'storage', kind: 'text', field: 'storageRemark', width: 180 },
  // Logging
  { id: 'logged', label: 'Status', dept: 'logging', kind: 'flag', field: 'logged', width: 100, hint: 'Yes = this row has been logged.' },
  { id: 'loggedAt', label: 'Logging date', dept: 'logging', kind: 'date', field: 'loggedAt', width: 140 },
  { id: 'loggerName', label: "Logger's name", dept: 'logging', kind: 'text', field: 'loggerName', width: 160 },
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
  dept: DeptId;
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
