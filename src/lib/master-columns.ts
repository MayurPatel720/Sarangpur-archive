import { BUILTIN_COLUMNS, type ColumnSpec } from '@/lib/item-columns';

/**
 * Columns of the Master Excel: the lot / project columns first, then every column of a lot's
 * own Excel (plus a computed Result). Columns a team adds to ONE lot's Excel are not shown here
 * — they only exist for that lot.
 */
export const MASTER_LOT_COLUMNS: ColumnSpec[] = [
  { id: 'lotNo', label: 'Lot no', dept: 'lot', kind: 'readonly', width: 130 },
  { id: 'projectNo', label: 'Project no', dept: 'lot', kind: 'readonly', width: 130 },
  { id: 'lotStage', label: 'Lot stage', dept: 'lot', kind: 'readonly', width: 120 },
  { id: 'assignee', label: 'Assigned to', dept: 'lot', kind: 'readonly', width: 150 },
];

const RESULT_COLUMN: ColumnSpec = { id: 'result', label: 'Result', dept: 'decision', kind: 'readonly', width: 130 };

export const MASTER_COLUMNS: ColumnSpec[] = [
  ...MASTER_LOT_COLUMNS,
  ...BUILTIN_COLUMNS.flatMap((c) => (c.id === 'decisionRemark' ? [c, RESULT_COLUMN] : [c])),
];

/** How a column is filtered: the API query parameter and the kind of input. */
export type MasterFilter =
  | { param: string; type: 'text' }
  | { param: string; type: 'yesno' }
  | { param: string; type: 'select'; options: { value: string; label: string }[] | 'stage' | 'dataType' | 'physicalSource' };

export const MASTER_FILTERS: Record<string, MasterFilter> = {
  lotNo: { param: 'lot', type: 'text' },
  projectNo: { param: 'project', type: 'text' },
  lotStage: { param: 'stage', type: 'select', options: 'stage' },
  mediaType: { param: 'dataType', type: 'select', options: 'dataType' },
  code: { param: 'code', type: 'text' },
  senderCode: { param: 'senderCode', type: 'text' },
  dateRange: { param: 'date', type: 'text' },
  place: { param: 'place', type: 'text' },
  nameOnTape: { param: 'nameOnTape', type: 'text' },
  nameOnCase: { param: 'nameOnCase', type: 'text' },
  physicalSource: { param: 'physicalSource', type: 'text' },
  remarks: { param: 'remarks', type: 'text' },
  duplicateCode: { param: 'duplicateCode', type: 'text' },
  digital: { param: 'digital', type: 'yesno' },
  redigital: { param: 'redigital', type: 'yesno' },
  discard: { param: 'discard', type: 'yesno' },
  decisionRemark: { param: 'decisionRemark', type: 'text' },
  result: {
    param: 'result',
    type: 'select',
    options: [
      { value: 'archive', label: 'Digitize' },
      { value: 'discard', label: 'Discard' },
      { value: 'undecided', label: 'Undecided' },
    ],
  },
  captured: { param: 'captured', type: 'yesno' },
  digitalSource: { param: 'digitalSource', type: 'text' },
  fileName: { param: 'fileName', type: 'text' },
  phyStorageLoc: { param: 'phyStorageLoc', type: 'text' },
  disposition: {
    param: 'disposition',
    type: 'select',
    options: [
      { value: 'return', label: 'Return' },
      { value: 'discard', label: 'Discard' },
      { value: 'blank', label: 'Blank' },
    ],
  },
  taggedInMls: { param: 'taggedInMls', type: 'yesno' },
  storageRemark: { param: 'storageRemark', type: 'text' },
  logged: { param: 'logged', type: 'yesno' },
  loggerName: { param: 'loggerName', type: 'text' },
};
