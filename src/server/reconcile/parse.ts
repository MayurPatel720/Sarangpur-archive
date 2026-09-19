/**
 * Filename → item-code parsing (SPEC §4.5 step 2). Pure, unit-tested in
 * `scripts/verify-reconcile.ts`. Item codes look like `NEG-MUM-072-01-04`:
 * `{PREFIX}-{ORIGIN}-{SEQ}-{GROUP}-{ITEM}`.
 */

/** Canonical item-code shape: 3 letters, 3 letters, 3 digits, 2 digits, 2 digits. */
const ITEM_CODE_PATTERN = /^([A-Z]{3})-([A-Z]{3})-(\d{3})-(\d{2})-(\d{2})$/;

export interface ParsedItemCode {
  prefix: string;
  origin: string;
  seq: string;
  groupNo: number;
  itemNo: number;
  /** The canonical code the filename maps to. */
  itemCode: string;
}

/**
 * Normalise a raw filename for matching: strip directories, drop the extension,
 * trim whitespace, uppercase. `neg-mum-072-01-04.tif` → `NEG-MUM-072-01-04`.
 */
export function normaliseStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  return stem.trim().toUpperCase();
}

/**
 * Parse a filename stem against the item-code pattern. Returns the parsed code,
 * or null for unrecognised filenames (stored with `matchedItemCode: null`).
 */
export function parseItemCode(filename: string): ParsedItemCode | null {
  const stem = normaliseStem(filename);
  const match = ITEM_CODE_PATTERN.exec(stem);
  if (!match) return null;
  const [, prefix, origin, seq, group, item] = match;
  return {
    prefix: prefix as string,
    origin: origin as string,
    seq: seq as string,
    groupNo: Number(group),
    itemNo: Number(item),
    itemCode: stem,
  };
}
