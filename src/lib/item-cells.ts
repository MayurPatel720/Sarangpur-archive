import { DATA_TYPE_LABELS, FORMAT_LABELS, type DataType, type Format } from '@/lib/domain';
import { isoDayToDmy } from '@/lib/date-range';
import type { ColumnSpec, CustomColumn } from '@/lib/item-columns';
import type { GridItem } from '@/types/items';

/**
 * The text a grid cell shows — also what the Excel export writes and what the import
 * compares against, so "what you see is what you export is what you re-import".
 * Pure; shared by the browser and the server.
 */

const yn = (v: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : '');

/** `Photo · Print — Album · Physical + Digital`. */
export function mediaTypeText(row: Pick<GridItem, 'format' | 'dataType' | 'subtypeLabel'>): string {
  const fmt = FORMAT_LABELS[row.format as Format] ?? row.format;
  const dt = DATA_TYPE_LABELS[row.dataType as DataType] ?? row.dataType;
  return `${fmt} · ${row.subtypeLabel} · ${dt}`;
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
  switch (spec.id) {
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
      return row.captured ? 'Yes' : '';
    case 'digitalSource':
      return row.digitalSource ?? '';
    case 'fileName':
      return row.fileName ?? '';
    case 'phyStorageLoc':
      return row.phyStorageLoc ?? '';
    case 'disposition':
      return row.disposition === 'return' ? 'Return' : row.disposition === 'discard' ? 'Discard' : '';
    case 'taggedInMls':
      return row.taggedInMls ? 'Yes' : '';
    case 'storageRemark':
      return row.storageRemark ?? '';
    case 'logged':
      return row.logged ? 'Yes' : '';
    case 'loggedAt':
      return row.loggedAt;
    case 'loggerName':
      return row.loggerName ?? '';
    default:
      return '';
  }
}
