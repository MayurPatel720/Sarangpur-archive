import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { parseDateRange } from '@/lib/date-range';
import { allColumns, deptLabel, type ColumnSpec, type CustomColumn } from '@/lib/item-columns';
import { cellText } from '@/lib/item-cells';
import { getReferenceList } from '@/server/reference';
import { applyItemEdits, getItemsGrid, type ItemEdit } from '@/server/lots/item-grid';
import type { ImportBody, ImportResponse } from '@/types/items';

/**
 * Excel import for a lot's Items tab. The browser reads the .xlsx (src/components/lots/
 * excel-io.ts) and sends rows of `"<department>|<column>" → cell text`; this checks every
 * cell against the same rules as typing it in the grid, shows what would change, and — on
 * `apply` — writes it through the same audited path as a grid save.
 *
 * Rules: rows are matched by Archive code; unknown codes are reported, never created; blank
 * cells are left alone (an import never clears a value); read-only columns (Media type,
 * Archive code, Duplicate code) are ignored. If any cell is invalid nothing is written.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const MAX_SHOWN = 200;

type Spec = ColumnSpec & { custom?: CustomColumn };

function resolveColumn(header: string, specs: Spec[]): Spec | null {
  const [d, ...rest] = header.split('|');
  const label = norm(rest.join('|'));
  const dept = norm(d ?? '');
  const inDept = specs.filter((s) => norm(s.label) === label && (dept === '' || norm(deptLabel(s.dept)) === dept));
  if (inDept.length === 1) return inDept[0]!;
  if (inDept.length === 0 && dept !== '') {
    // The department cell may be missing / reworded — fall back to the label alone when it is unique.
    const byLabel = specs.filter((s) => norm(s.label) === label);
    return byLabel.length === 1 ? byLabel[0]! : null;
  }
  return null;
}

function parseYesNo(text: string): boolean | null | undefined {
  const t = norm(text);
  if (['yes', 'y', 'true', '1'].includes(t)) return true;
  if (['no', 'n', 'false', '0'].includes(t)) return false;
  return undefined;
}

export async function importItems(
  lotId: string,
  body: ImportBody,
  ctx: MutationContext,
): Promise<ImportResponse> {
  const grid = await getItemsGrid(lotId, { userId: ctx.userId, grants: ctx.grants });
  if (!grid.editable.details) {
    throw new HttpError(403, 'You cannot change this lot’s items (read only, finished, or assigned to someone else).');
  }
  const specs = allColumns(grid.customColumns) as Spec[];
  const byCode = new Map(grid.items.map((r) => [r.code, r]));
  const sources = await getReferenceList('physicalSource');
  const refLabel = (_list: string, v: string | null) => (v ? (sources.find((s) => s.value === v)?.label ?? v) : '');

  const unknownCodes: string[] = [];
  const ignored = new Set<string>();
  const changes: ImportResponse['changes'] = [];
  const errors: ImportResponse['errors'] = [];
  const edits = new Map<string, ItemEdit>();
  let matched = 0;
  let changesTotal = 0;

  for (const row of body.rows) {
    const item = byCode.get(row.code);
    if (!item) {
      unknownCodes.push(row.code);
      continue;
    }
    matched += 1;
    for (const [header, raw] of Object.entries(row.cells)) {
      const text = raw.trim();
      if (!text) continue;
      const spec = resolveColumn(header, specs);
      if (!spec) {
        ignored.add(header.split('|').pop() ?? header);
        continue;
      }
      if (spec.kind === 'readonly' || spec.kind === 'code' || spec.kind === 'duplicate') {
        ignored.add(spec.label);
        continue;
      }
      const colName = `${deptLabel(spec.dept)} › ${spec.label}`;
      const bad = (message: string) => errors.push({ code: row.code, column: colName, message });
      if (spec.dept === 'decision' && !spec.custom && !grid.editable.decision) {
        bad('Decisions are locked — this lot has already been decided.');
        continue;
      }
      const before = cellText(item, spec, refLabel);
      if (norm(before) === norm(text)) continue;

      // Parse the cell the way the grid would.
      let value: unknown;
      let shown = text;
      switch (spec.custom ? (spec.custom.type === 'yesno' ? 'yesno' : spec.custom.type === 'date' ? 'date' : spec.custom.type === 'number' ? 'number' : 'text') : spec.kind) {
        case 'yesno': {
          const v = parseYesNo(text);
          if (v === undefined) {
            bad('Use Yes or No.');
            continue;
          }
          value = v;
          shown = v ? 'Yes' : 'No';
          break;
        }
        case 'flag': {
          const v = parseYesNo(text);
          if (v === undefined) {
            bad('Use Yes or No.');
            continue;
          }
          value = v;
          shown = v ? 'Yes' : '';
          break;
        }
        case 'dateRange':
        case 'date': {
          const r = parseDateRange(text);
          if (!r.ok) {
            bad(r.error);
            continue;
          }
          value = text;
          break;
        }
        case 'number': {
          const n = Number(text.replace(/,/g, ''));
          if (!Number.isFinite(n)) {
            bad('Must be a number.');
            continue;
          }
          value = n;
          break;
        }
        case 'ref': {
          const hit = sources.find((s) => norm(s.label) === norm(text) || norm(s.value) === norm(text));
          if (!hit) {
            bad('Not in the Phy source list.');
            continue;
          }
          value = hit.value;
          shown = hit.label;
          break;
        }
        case 'disposition': {
          const t = norm(text);
          if (t !== 'return' && t !== 'discard') {
            bad('Use Return or Discard.');
            continue;
          }
          value = t;
          shown = t === 'return' ? 'Return' : 'Discard';
          break;
        }
        default:
          value = text;
      }
      if (shown === '' && before === '') continue;

      changesTotal += 1;
      if (changes.length < MAX_SHOWN) changes.push({ code: row.code, column: colName, from: before, to: shown });
      const edit = edits.get(item.id) ?? { id: item.id, set: {} };
      if (spec.custom) {
        const c = (edit.set.custom ?? {}) as Record<string, unknown>;
        c[spec.custom.key] = value;
        edit.set.custom = c;
      } else if (spec.field) {
        edit.set[spec.field] = value;
      }
      edits.set(item.id, edit);
    }
  }

  const base: ImportResponse = {
    applied: false,
    matched,
    willChange: edits.size,
    unknownCodes: unknownCodes.slice(0, 50),
    changes,
    changesTotal,
    errors: errors.slice(0, 100),
    ignoredColumns: [...ignored],
    blockedBy: errors.length > 0 ? [`${errors.length} cell${errors.length === 1 ? '' : 's'} need fixing before anything can be imported.`] : [],
  };
  if (!body.apply || errors.length > 0 || edits.size === 0) return base;

  await applyItemEdits(lotId, [...edits.values()], ctx, {
    kind: 'items_imported',
    title: `Imported ${edits.size} ${edits.size === 1 ? 'row' : 'rows'} from Excel`,
    detail: `${changesTotal} cell${changesTotal === 1 ? '' : 's'} changed.`,
  });
  return { ...base, applied: true };
}
