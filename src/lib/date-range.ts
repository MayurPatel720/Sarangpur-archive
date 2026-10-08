/**
 * The Items grid "Date" column: one cell holding a range, `dd/mm/yyyy - dd/mm/yyyy`.
 * Stored as two calendar days (`dateFrom`, `dateTo`, ISO `YYYY-MM-DD`). Pure — shared
 * by the grid, the Excel import and the server.
 *
 * Accepted input (archive photos often have only a year or a month):
 *   12/03/1998                    one day
 *   12/03/1998 - 20/03/1998       a range (also "–", "—" or "to")
 *   03/1998                       the whole month
 *   1998                          the whole year
 */

const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

const pad2 = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

type Bound = { from: string; to: string } | null;

function parseOne(text: string): Bound {
  const t = text.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
    const day = iso(y, mo, d);
    return { from: day, to: day };
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12) return null;
    return { from: iso(y, mo, 1), to: iso(y, mo, daysIn(y, mo)) };
  }
  m = /^(\d{4})$/.exec(t);
  if (m) {
    const y = Number(m[1]);
    if (y < MIN_YEAR || y > MAX_YEAR) return null;
    return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
  }
  return null;
}

export type DateRangeParse = { ok: true; from: string; to: string } | { ok: false; error: string };

export function parseDateRange(text: string): DateRangeParse {
  const t = text.trim();
  const bad: DateRangeParse = { ok: false, error: 'Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy.' };
  if (!t) return bad;
  const parts = t.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  if (parts.length === 1) {
    const one = parseOne(parts[0]!);
    return one ? { ok: true, ...one } : bad;
  }
  if (parts.length === 2) {
    const a = parseOne(parts[0]!);
    const b = parseOne(parts[1]!);
    if (!a || !b) return bad;
    if (a.from > b.to) return { ok: false, error: 'The start date is after the end date.' };
    return { ok: true, from: a.from, to: b.to };
  }
  return bad;
}

/** `dd/mm/yyyy` for an ISO day (takes the first 10 chars, so full timestamps work). */
export function isoDayToDmy(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** `12/03/1998` for a single day, `12/03/1998 - 20/03/1998` for a range, '' for none. */
export function formatDateRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = isoDayToDmy(from);
  const b = isoDayToDmy(to);
  if (!a && !b) return '';
  if (!b || a === b) return a || b;
  if (!a) return b;
  return `${a} - ${b}`;
}
