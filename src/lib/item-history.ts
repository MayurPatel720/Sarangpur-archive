/**
 * Version history of a lot's Excel (see src/server/lots/history.ts).
 *
 * Every write to a lot's items is bracketed: the touched rows are read before and after, and the two
 * "images" are stored as one change set. An image holds only the TRACKED fields below — what a person can
 * change in the sheet or through the workflow — not counters kept by other collections (photos) or by the
 * scan reconciler (file size / hash). Undo and restore write an image back; nothing is recalculated from
 * the old values, so every kind of change (cell edit, import, re-code, added rows, a decision that
 * finalized the lot …) can be reversed the same way.
 */

export type ItemImage = Record<string, unknown>;

/** Item fields kept in an image. */
export const TRACKED_FIELDS = [
  'format', 'code', 'clearedCode', 'groupNo', 'itemNo', 'lineIndex', 'sortOrder',
  'selectedForDigitization', 'notDigitizedReason', 'digitized', 'fileName', 'taggedInMls',
  'name', 'nameOnCase', 'description', 'place', 'event', 'physicalSource', 'itemCondition', 'remarks', 'digitalSource',
  'senderCode', 'dateFrom', 'dateTo', 'nameOnTape', 'duplicateCode', 'phyStorageLoc', 'storageRemark',
  'logged', 'loggedAt', 'loggerName',
  'attrs', 'custom', 'masterCustom',
  'recheckWeeks', 'nextCheckDue', 'lastCheckedAt', 'lastCheckedByName',
  'decision', 'dispositionStatus', 'dispositionDoneAt', 'dispositionDoneByName', 'returnInfo', 'lotReference',
] as const;

/** Fields whose value is an object: they are compared and shown one key at a time (`decision.digital`). */
export const OBJECT_FIELDS = ['attrs', 'custom', 'masterCustom', 'decision', 'returnInfo'] as const;

const isObjectField = (f: string) => (OBJECT_FIELDS as readonly string[]).includes(f);

/** A stable, comparable form of any value (Dates → ISO, ObjectIds → hex, keys sorted). */
export function normalize(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown> & { _bsontype?: string; toHexString?: () => string };
      if (o._bsontype === 'ObjectId' || typeof o.toHexString === 'function') return String(v);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) {
        const w = walk(o[k]);
        if (w !== null) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** The tracked fields of an item document (undefined / missing fields are left out). */
export function imageOf(doc: Record<string, unknown> | null | undefined): ItemImage | null {
  if (!doc) return null;
  const out: ItemImage = {};
  for (const f of TRACKED_FIELDS) {
    const v = doc[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}

export const sameImage = (a: ItemImage | null | undefined, b: ItemImage | null | undefined): boolean =>
  normalize(a ?? null) === normalize(b ?? null);

const keysOf = (v: unknown): string[] =>
  v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? Object.keys(v as Record<string, unknown>) : [];

/** The field paths that differ between two images (`place`, `decision.digital`, `custom.c_3` …). */
export function changedPaths(before: ItemImage | null, after: ItemImage | null): string[] {
  const a = before ?? {};
  const b = after ?? {};
  const out: string[] = [];
  for (const f of TRACKED_FIELDS) {
    if (isObjectField(f)) {
      const keys = new Set([...keysOf(a[f]), ...keysOf(b[f])]);
      for (const k of keys) {
        if (normalize((a[f] as Record<string, unknown> | undefined)?.[k]) !== normalize((b[f] as Record<string, unknown> | undefined)?.[k])) {
          out.push(`${f}.${k}`);
        }
      }
      if (keys.size === 0 && normalize(a[f]) !== normalize(b[f])) out.push(f);
    } else if (normalize(a[f]) !== normalize(b[f])) {
      out.push(f);
    }
  }
  return out;
}

/** The value at a field path of an image. */
export function valueAt(image: ItemImage | null, path: string): unknown {
  if (!image) return undefined;
  const [head, ...rest] = path.split('.');
  let v: unknown = image[head!];
  for (const k of rest) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** Sessions: one person's edits on one lot with less than this between them are one session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** How many rows a change set may carry before the lot-wide checkpoint is used instead of per-row detail. */
export const MAX_ROWS_PER_CHANGE = 25_000;

/** Kinds of change set. `undo` also covers redo (a redo is the undo of an undo). */
export const CHANGE_KINDS = [
  'edit', 'bulk', 'import', 'add_items', 'discard_clear', 'recode', 'duplicate', 'reorder', 'media_lines', 'status', 'workflow', 'undo', 'restore',
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** "Place on 12 items", "Digital, Redigital + 2 more · 1 item": the label of an edit. `keys` are the set keys of the save. */
export function describeEdit(keys: string[], itemCount: number, labelOf: (key: string) => string): string {
  const names = [...new Set(keys.map(labelOf))];
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` + ${names.length - 3} more` : '';
  return `${shown || 'Edit'}${more} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
}

/** The lot-level state saved with a change set (what a decision / stage move changes). */
export interface LotState {
  stage: string;
  stageEnteredAt: Date | string | null;
  namingCode: string | null;
  decision: Record<string, unknown> | null;
  expectedFileCount: number;
  foundFileCount: number;
  return: Record<string, unknown> | null;
  discard: Record<string, unknown> | null;
}
