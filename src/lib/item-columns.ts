/**
 * Per-table "Details" columns for the lot Items tab.
 *
 * The Items tab shows one table per exact media subtype ("35MM Film — Slides",
 * "35MM Film — Positives", "Print — Album" ...). A table uses the entry for its
 * exact subtype if one exists in FAMILY_DETAIL_COLUMNS, otherwise its family's entry.
 * A FAMILY is the part of an item's subtype label before " — "
 * ("35MM Film — Negatives" -> "35MM Film"; "Print — Album" -> "Print").
 * A label without " — " is its own family ("Digital").
 *
 * TO CHANGE COLUMNS: edit a line in FAMILY_DETAIL_COLUMNS below. Key it by family
 * ("Print") to cover every subtype of it, or by full subtype ("Print — Album") for one.
 * TO ADD ONE: add one line. Order here is the order on screen. Families not
 * listed (case-insensitive) use DEFAULT_DETAIL_COLUMNS.
 *
 * Item code, Name / title and Media type, and the Decision and Digitization
 * column groups, are always shown for every family.
 */

export type DetailColumnKey =
  | 'nameOnCase'
  | 'description'
  | 'year'
  | 'month'
  | 'place'
  | 'event'
  | 'people'
  | 'physicalSource'
  | 'itemCondition'
  | 'remarks';

export const DEFAULT_DETAIL_COLUMNS: DetailColumnKey[] = [
  'nameOnCase', 'description', 'year', 'month', 'place', 'event', 'people', 'physicalSource', 'itemCondition', 'remarks',
];

export const FAMILY_DETAIL_COLUMNS: Record<string, DetailColumnKey[]> = {
  '35MM Film': ['nameOnCase', 'description', 'year', 'month', 'place', 'event', 'people', 'itemCondition'],
  '120 Film': ['nameOnCase', 'description', 'year', 'month', 'place', 'event', 'people', 'itemCondition'],
  'Large Format': ['nameOnCase', 'description', 'year', 'month', 'place', 'event', 'people', 'itemCondition'],
  Print: ['nameOnCase', 'description', 'year', 'month', 'place', 'event', 'people', 'physicalSource', 'itemCondition'],
  Digital: ['description', 'year', 'month', 'place', 'event', 'people', 'itemCondition', 'remarks'],
};

const SEPARATOR = ' — ';

/** "35MM Film — Negatives" -> "35MM Film"; no separator -> the label itself. */
export function familyOf(subtypeLabel: string): string {
  const i = subtypeLabel.indexOf(SEPARATOR);
  const family = (i === -1 ? subtypeLabel : subtypeLabel.slice(0, i)).trim();
  return family || 'Other';
}

function lookup(name: string): DetailColumnKey[] | undefined {
  const key = Object.keys(FAMILY_DETAIL_COLUMNS).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? FAMILY_DETAIL_COLUMNS[key] : undefined;
}

/** Columns for one table (one exact subtype): its own entry, else its family's, else the default. */
export function detailColumnsFor(subtypeLabel: string): DetailColumnKey[] {
  return lookup(subtypeLabel) ?? lookup(familyOf(subtypeLabel)) ?? DEFAULT_DETAIL_COLUMNS;
}
