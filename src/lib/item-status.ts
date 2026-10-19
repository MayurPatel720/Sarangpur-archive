import { BUILTIN_COLUMNS, PRASADI_FORMAT, type ColumnSpec } from '@/lib/item-columns';
import type { GridItem } from '@/types/items';

/**
 * A Prasadi item's status — pure, shared by the grid, the Master Excel filter, the server and the
 * verify script.
 *
 *   Inactive         taken out of the archive (stored: attrs.status = 'inactive', with the removal details)
 *   Details Missing  Active, but a starred (required) field is still empty — worked out, never stored
 *   Active           everything starred is filled in
 *
 * Saving is never blocked by a missing starred field; the status just says what is still needed.
 */

export const ITEM_STATUSES = ['active', 'inactive', 'details_missing'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  details_missing: 'Details Missing',
};

/** The starred columns of a format — from the registry's `required` flags. */
export const requiredColumns = (format: string): ColumnSpec[] =>
  BUILTIN_COLUMNS.filter((c) => c.required && (!c.formats || c.formats.includes(format)) && !c.notFormats?.includes(format));

const filled = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== '';

type StatusRow = Pick<GridItem, 'format' | 'attrs' | 'imageCount'> & Record<string, unknown>;

function hasValue(row: StatusRow, c: ColumnSpec): boolean {
  if (c.kind === 'photo') return (row.imageCount ?? 0) > 0;
  if (c.attr) return filled(row.attrs?.[c.id]);
  return filled(row[c.field ?? c.id]);
}

/** The starred fields still empty on this item (empty list = complete). */
export function missingRequired(row: StatusRow): ColumnSpec[] {
  return requiredColumns(row.format).filter((c) => !hasValue(row, c));
}

export const isInactive = (row: Pick<GridItem, 'attrs'>): boolean => row.attrs?.status === 'inactive';

/** `null` for formats that have no status (everything except Prasadi). */
export function itemStatus(row: StatusRow): ItemStatus | null {
  if (row.format !== PRASADI_FORMAT) return null;
  if (isInactive(row)) return 'inactive';
  return missingRequired(row).length > 0 ? 'details_missing' : 'active';
}

/** The removal form's fields, in order, from the registry's Removal department. */
export const REMOVAL_COLUMNS = BUILTIN_COLUMNS.filter((c) => c.dept === 'removal');
/** These three must be given to remove an item. */
export const REMOVAL_REQUIRED = ['removedOn', 'newLocation', 'sentTo'] as const;
