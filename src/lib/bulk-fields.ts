import { parseDateRange } from '@/lib/date-range';
import { MAX_RECHECK_WEEKS } from '@/lib/recheck';
import { allColumns, appliesToFormat, forFormat, type ColumnSpec, type CustomColumn, type DeptId } from '@/lib/item-columns';
import type { ItemsBulkSet } from '@/types/items';

/**
 * The fields of the bulk edit bar ("set the same value on every ticked row"), worked out from the
 * column registry (src/lib/item-columns.ts) and the lot's own custom columns — nothing is listed by
 * hand, so a new column, a format's own columns (Prasadi) or a team-added column shows up by itself.
 * Pure — shared by the bar and the verify script.
 */

export type BulkInput = 'text' | 'date' | 'yesno' | 'flag' | 'disposition' | 'weeks' | 'number' | 'select';

/** Where the value goes in `ItemsBulkSet`. */
export type BulkTarget =
  | { type: 'field'; key: string } //  top-level key (senderCode, digital, …)
  | { type: 'attr'; key: string } //   `attrs[key]` — a format-specific registry column
  | { type: 'custom'; key: string }; // `custom[key]` — a column the team added to the lot

export interface BulkField {
  id: string;
  label: string;
  dept: DeptId;
  input: BulkInput;
  hint?: string;
  target: BulkTarget;
  /** A Decision column — only offered while decisions are still open. */
  decision: boolean;
  /** For a dropdown: the admin-managed list, and (dependent dropdown) the column whose value narrows it. */
  refList?: string;
  refParent?: { column: string; metaKey: string };
  /** Formats (of the selected rows) this field applies to when it does not apply to all of them; else null. */
  onlyFor: string[] | null;
}

/** The "blank this field" choice. */
export const CLEAR = '__clear';

const SKIPPED_KINDS = new Set<ColumnSpec['kind']>(['readonly', 'code', 'duplicate', 'info', 'photo']);

const inputOf = (c: ColumnSpec & { custom?: CustomColumn }): BulkInput | null => {
  if (c.custom) return c.custom.type; // text | number | yesno | date
  switch (c.kind) {
    case 'text':
    case 'longtext':
    case 'ref':
      return 'text';
    case 'dateRange':
    case 'date':
      return 'date';
    case 'yesno':
      return 'yesno';
    case 'flag':
      return 'flag';
    case 'disposition':
      return 'disposition';
    case 'weeks':
      return 'weeks';
    case 'number':
      return 'number';
    case 'ref':
      return 'select';
    default:
      return null;
  }
};

/** Every field that can be set on rows of the given formats, in the Excel's department order. */
export function bulkFieldsFor(formats: string[], custom: CustomColumn[]): BulkField[] {
  const out: BulkField[] = [];
  // One format ticked: its own column order and labels; several: the registry's.
  const columns = formats.length === 1 ? forFormat(allColumns(custom), formats[0]!) : allColumns(custom);
  for (const c of columns) {
    if (c.dept === 'lot' || SKIPPED_KINDS.has(c.kind)) continue;
    const input = inputOf(c);
    if (!input) continue;
    const target: BulkTarget | null = c.custom
      ? { type: 'custom', key: c.custom.key }
      : c.field
        ? c.attr
          ? { type: 'attr', key: c.field }
          : { type: 'field', key: c.field }
        : null;
    if (!target) continue;
    // Applicable to which of the selected formats? (custom columns belong to every format)
    const applies = c.custom ? formats : formats.filter((f) => appliesToFormat(c, f));
    if (formats.length > 0 && applies.length === 0) continue;
    out.push({
      id: c.id,
      // A column that reads differently for one format (Prasadi: Date → Date received) uses that name when only that format is ticked.
      label: c.label,
      dept: c.dept as DeptId,
      input,
      hint: c.hint,
      target,
      decision: c.dept === 'decision',
      refList: c.refList,
      refParent: c.refParent,
      onlyFor: formats.length > 0 && applies.length < formats.length ? applies : null,
    });
  }
  return out;
}

export type BulkParse = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * One typed value → what the save expects. `raw` is what the bar holds: '' = no change (never
 * reaches here), `CLEAR` = blank it, otherwise the text / choice. Same rules as typing in the grid.
 */
export function parseBulkValue(f: BulkField, raw: string): BulkParse {
  const text = raw.trim();
  if (raw === CLEAR) {
    if (f.input === 'flag') return { ok: false, error: 'Choose Yes or No.' };
    return { ok: true, value: null };
  }
  switch (f.input) {
    case 'text':
    case 'select':
      return { ok: true, value: text };
    case 'date': {
      const r = parseDateRange(text);
      return r.ok ? { ok: true, value: text } : { ok: false, error: r.error };
    }
    case 'yesno':
      return text === 'Yes' ? { ok: true, value: true } : text === 'No' ? { ok: true, value: false } : { ok: false, error: 'Choose Yes, No or Clear.' };
    case 'flag':
      return text === 'Yes' ? { ok: true, value: true } : text === 'No' ? { ok: true, value: false } : { ok: false, error: 'Choose Yes or No.' };
    case 'disposition':
      return text === 'return' || text === 'discard' ? { ok: true, value: text } : { ok: false, error: 'Choose Return or Discard.' };
    case 'weeks': {
      const n = Number(text);
      return Number.isInteger(n) && n >= 1 && n <= MAX_RECHECK_WEEKS
        ? { ok: true, value: n }
        : { ok: false, error: `Use a whole number of weeks (1–${MAX_RECHECK_WEEKS}).` };
    }
    case 'number': {
      const n = Number(text.replace(/,/g, ''));
      return text !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Must be a number.' };
    }
  }
}

/**
 * The bar's values (field id → raw text; blank = leave alone) → an `ItemsBulkSet` plus any
 * per-field problems. Nothing is built when a problem exists.
 */
export function buildBulkSet(
  fields: BulkField[],
  values: Record<string, string>,
): { set: ItemsBulkSet; errors: Record<string, string> } {
  const set: Record<string, unknown> = {};
  const attrs: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.id];
    if (raw === undefined || raw === '') continue;
    const r = parseBulkValue(f, raw);
    if (!r.ok) {
      errors[f.id] = r.error;
      continue;
    }
    if (f.target.type === 'field') set[f.target.key] = r.value;
    else if (f.target.type === 'attr') attrs[f.target.key] = r.value;
    else custom[f.target.key] = r.value;
  }
  if (Object.keys(attrs).length > 0) set.attrs = attrs;
  if (Object.keys(custom).length > 0) set.custom = custom;
  return { set: set as ItemsBulkSet, errors };
}
