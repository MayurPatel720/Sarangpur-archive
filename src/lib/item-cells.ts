import { STAGE_LABELS, type Stage } from '@/lib/domain';
import { isoDayToDmy } from '@/lib/date-range';
import type { ColumnSpec, CustomColumn } from '@/lib/item-columns';
import type { GridItem } from '@/types/items';
import type { MasterRow } from '@/types/master';

/**
 * The text a grid cell shows — also what the Excel export writes and what the import
 * compares against, so "what you see is what you export is what you re-import".
 * Pure; shared by the browser and the server.
 */

const yn = (v: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : '');

/** Just the sub-type: `VHS`, `35MM Film — Negatives` (no format / data-type prefix). */
export function mediaTypeText(row: Pick<GridItem, 'subtypeLabel'>): string {
  return row.subtypeLabel;
}

/** Display text of one cell. `refLabel` resolves an admin-list value to its label. */
export function cellText(
  row: GridItem,
  spec: ColumnSpec & { custom?: CustomColumn },
  refLabel: (list: string, value: string | null) => string = (_l, v) => v ?? '',
): string {
  if (spec.custom) {
    const v = row.custom[spec.custom.key];
    if (v === null || v === undefined) return '';
    if (spec.custom.type === 'yesno') return typeof v === 'boolean' ? yn(v) : '';
    if (spec.custom.type === 'date') return isoDayToDmy(String(v));
    return String(v);
  }
  // Master Excel only — present on its rows, absent on a lot's own Excel.
  const m = row as Partial<MasterRow>;
  switch (spec.id) {
    case 'lotNo':
      return m.lotReference ?? '';
    case 'projectNo':
      return m.projectCode ?? '';
    case 'lotStage':
      return m.lotStage ? (STAGE_LABELS[m.lotStage as Stage] ?? m.lotStage) : '';
    case 'assignee':
      return m.assigneeName ?? '';
    case 'result':
      return row.result === 'archive' ? 'Digitize' : row.result === 'discard' ? 'Discard' : row.result === 'physical' ? 'Keep physical' : 'Undecided';
    case 'mediaType':
      return mediaTypeText(row);
    case 'code':
      return row.code;
    case 'senderCode':
      return row.senderCode ?? '';
    case 'dateRange':
      return row.dateRange;
    case 'place':
      return row.place ?? '';
    case 'nameOnTape':
      return row.nameOnTape ?? '';
    case 'nameOnCase':
      return row.nameOnCase ?? '';
    case 'physicalSource':
      return spec.refList ? refLabel(spec.refList, row.physicalSource) : (row.physicalSource ?? '');
    case 'remarks':
      return row.remarks ?? '';
    case 'duplicateCode':
      return row.duplicateCode ?? '';
    case 'digital':
      return yn(row.digital);
    case 'redigital':
      return yn(row.redigital);
    case 'discard':
      return yn(row.discard);
    case 'decisionRemark':
      return row.decisionRemark ?? '';
    case 'captured':
      return row.captured ? 'Yes' : 'No';
    case 'digitalSource':
      return row.digitalSource ?? '';
    case 'fileName':
      return row.fileName ?? '';
    case 'phyStorageLoc':
      return row.phyStorageLoc ?? '';
    case 'disposition':
      return row.disposition === 'return' ? 'Return' : row.disposition === 'discard' ? 'Discard' : '';
    case 'taggedInMls':
      return row.taggedInMls ? 'Yes' : 'No';
    case 'storageRemark':
      return row.storageRemark ?? '';
    case 'logged':
      return row.logged ? 'Yes' : 'No';
    case 'loggedAt':
      return row.loggedAt;
    case 'loggerName':
      return row.loggerName ?? '';
    default:
      return '';
  }
}
