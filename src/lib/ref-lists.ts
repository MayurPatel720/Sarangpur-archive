import { BUILTIN_COLUMNS, type ColumnSpec } from '@/lib/item-columns';

/**
 * Admin-managed dropdown lists behind the registry's `ref` columns (Prasadi: Guru, Category,
 * Subcategory, Room …). Pure — shared by the grid, the bulk bar, the Excel import / export and the
 * Master Excel, so none of them lists values by hand.
 */

export interface RefItem {
  value: string;
  label: string;
  meta?: Record<string, unknown>;
}
export type RefLists = Record<string, RefItem[]>;

/** Every list the registry's `ref` columns read — what a screen loads once. */
export const REF_LIST_KEYS: string[] = [...new Set(BUILTIN_COLUMNS.flatMap((c) => (c.refList ? [c.refList] : [])))];

/** Current label of a stored value, falling back to the value itself (retired / old free-text values keep showing). */
export function refLabel(lists: RefLists, listKey: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return lists[listKey]?.find((i) => i.value === value)?.label ?? String(value);
}

/**
 * The options a `ref` column offers. A dependent column (Subcategory) offers only the items whose
 * `meta[metaKey]` equals the parent column's current value; with no parent chosen it offers none.
 */
export function refOptions(spec: Pick<ColumnSpec, 'refList' | 'refParent'>, lists: RefLists, parentValue?: unknown): RefItem[] {
  const all = lists[spec.refList ?? ''] ?? [];
  if (!spec.refParent) return all;
  if (parentValue === null || parentValue === undefined || parentValue === '') return [];
  return all.filter((i) => i.meta?.[spec.refParent!.metaKey] === parentValue);
}

/** Find a list item by its stored value OR its label (an imported cell carries the label). */
export function findRefItem(items: RefItem[], text: string): RefItem | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return items.find((i) => i.value.toLowerCase() === t || i.label.toLowerCase().replace(/\s+/g, ' ') === t);
}
