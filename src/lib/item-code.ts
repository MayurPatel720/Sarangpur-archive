/**
 * Item-code shape, shared by the server and the Items grid (pure — no imports).
 *
 *   ALB-surat-0001-R-000
 *   │   │     │    │ └ copy number (R is always 000; each duplicate of the same original counts up)
 *   │   │     │    └── kind: R = raw / original, D = duplicate of another item
 *   │   │     └─────── running number, shared by every lot that uses the same two abbreviations
 *   │   └───────────── second abbreviation (a place such as "surat")
 *   └───────────────── first abbreviation (a media type such as "ALB")
 *
 * The user chooses the two abbreviations; the number is handed out automatically
 * (next free after the highest in use) but may be set by the user, which leaves the
 * numbers in between free for later.
 */

export const ABBR_PATTERN = /^[A-Za-z0-9]{1,12}$/;

export type ItemCodeKind = 'R' | 'D';

export interface ItemCodeParts {
  abbr1: string;
  abbr2: string;
  no: number;
  kind: ItemCodeKind;
  copy: number;
}

const CODE_PATTERN = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d{4,})-([RD])-(\d{3,})$/;

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

/** `ALB-surat` — the pair that owns one running number sequence. */
export function codeKeyOf(abbr1: string, abbr2: string): string {
  return `${abbr1}-${abbr2}`;
}

export function abbrError(label: string, value: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  if (!ABBR_PATTERN.test(value.trim())) return `${label} must be 1–12 letters or digits, no spaces or dashes.`;
  return null;
}
