/**
 * Item-code shape, shared by the server and the Items grid (pure — no imports).
 *
 *   ALB-surat-0001-R-000
 *   │   │     │    │ └ last three digits: the copy number. 000 unless the user sets another free value on an
 *   │   │     │    │   original (R); each duplicate (D) of the same original counts up from 000
 *   │   │     │    └── kind: R = raw / original, D = duplicate of another item; an admin can add more letters (M, P …)
 *   │   │     └─────── running number, shared by every lot that uses the same two abbreviations
 *   │   └───────────── second abbreviation (a place such as "surat")
 *   └───────────────── first abbreviation (a media type such as "ALB")
 *
 * The user chooses the two abbreviations; the number is handed out automatically
 * (next free after the highest in use) but may be set by the user, which leaves the
 * numbers in between free for later.
 */

export const ABBR_PATTERN = /^[A-Za-z0-9]{1,12}$/;

/** The kind letter (1–3 capitals). R and D always exist; the admin list `itemCodeKind` adds more (M, P …). */
export type ItemCodeKind = string;
export const KIND_ORIGINAL = 'R';
export const KIND_DUPLICATE = 'D';
export const KIND_PATTERN = /^[A-Z]{1,3}$/;

export function kindError(kind: string): string | null {
  if (!KIND_PATTERN.test(kind)) return 'The code letter must be 1–3 capital letters.';
  return null;
}

export interface ItemCodeParts {
  abbr1: string;
  abbr2: string;
  no: number;
  kind: ItemCodeKind;
  copy: number;
}

const CODE_PATTERN = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d{4,})-([A-Z]{1,3})-(\d{3,})$/;

export function parseItemCodeParts(code: string): ItemCodeParts | null {
  const m = CODE_PATTERN.exec(code.trim());
  if (!m) return null;
  return {
    abbr1: m[1] as string,
    abbr2: m[2] as string,
    no: Number(m[3]),
    kind: m[4] as ItemCodeKind,
    copy: Number(m[5]),
  };
}

export function buildItemCode(p: ItemCodeParts): string {
  return `${p.abbr1}-${p.abbr2}-${String(p.no).padStart(4, '0')}-${p.kind}-${String(p.copy).padStart(3, '0')}`;
}

/**
 * An item whose archive code was cleared by Discard → "Yes and clear code":
 * `NEG-MUM-R-DISCARD_1` (the code's own first three parts, then DISCARD_n), or an older `discard-1`.
 */
export const isDiscardCode = (code: string): boolean => /-DISCARD_\d+$/.test(code) || /^discard-\d+$/.test(code);

/** The first three parts of a code (`NEG-MUM-R`): the key of its discard count. */
export const discardPrefixOf = (p: Pick<ItemCodeParts, 'abbr1' | 'abbr2' | 'kind'>): string => `${p.abbr1}-${p.abbr2}-${p.kind}`;

export const buildDiscardCode = (p: Pick<ItemCodeParts, 'abbr1' | 'abbr2' | 'kind'>, n: number): string => `${discardPrefixOf(p)}-DISCARD_${n}`;

/** `ALB-surat` — the pair that owns one running number sequence. */
export function codeKeyOf(abbr1: string, abbr2: string): string {
  return `${abbr1}-${abbr2}`;
}

export function abbrError(label: string, value: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  if (!ABBR_PATTERN.test(value.trim())) return `${label} must be 1–12 letters or digits, no spaces or dashes.`;
  return null;
}
