import { ReferenceList } from '@/models/ReferenceList';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';

/**
 * Server-side access to Tier-2 vocabularies (the `referencelists` collection).
 *
 * Every consumer — routes validating stored values, UI option loaders — goes
 * through here. Hardcoded option arrays in components are a bug; the admin owns
 * these words, not the code.
 *
 * Display rule (history safety): resolve the current label, fall back to the raw
 * stored value so retired values keep rendering on old records.
 */

export interface ReferenceItem {
  value: string;
  label: string;
  active: boolean;
  sortOrder: number;
  usageCount: number;
  meta: Record<string, unknown>;
}

function toItems(doc: {
  items: { value: string; label: string; active: boolean; sortOrder: number; usageCount: number; meta: unknown }[];
}): ReferenceItem[] {
  return doc.items
    .map((i) => ({
      value: i.value,
      label: i.label,
      active: i.active,
      sortOrder: i.sortOrder,
      usageCount: i.usageCount,
      meta: (i.meta ?? {}) as Record<string, unknown>,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** All items of a vocabulary, sorted. Throws 404 when the list does not exist. */
export async function getReferenceList(key: string): Promise<ReferenceItem[]> {
  await connectToDatabase();
  const doc = await ReferenceList.findOne({ key }).lean();
  if (!doc) throw new HttpError(404, `Reference list '${key}' not found.`);
  return toItems(doc);
}

/** Vocabulary identity for admin screens and lookup headers. Throws 404 when missing. */
export async function getReferenceListMeta(key: string): Promise<{ key: string; label: string; group: string }> {
  await connectToDatabase();
  const doc = await ReferenceList.findOne({ key }).lean();
  if (!doc) throw new HttpError(404, `Reference list '${key}' not found.`);
  return { key: doc.key, label: doc.label, group: doc.group };
}

/** Active items only — the set a form may offer for new records. */
export async function getActiveReferenceItems(key: string): Promise<ReferenceItem[]> {
  return (await getReferenceList(key)).filter((i) => i.active);
}

/** Current label with fallback to the stored value (retired values keep rendering). */
export async function resolveReferenceLabel(key: string, value: string): Promise<string> {
  const doc = await ReferenceList.findOne({ key }).lean();
  const found = doc?.items.find((i: { value: string }) => i.value === value);
  return found?.label ?? value;
}

/**
 * Asserts `value` is an ACTIVE member of the vocabulary. Inactive-but-known values
 * are rejected for new writes (410 Gone would imply a resource; here the value
 * exists, it is just retired — 400 with a plain message).
 */
export async function assertActiveReferenceValue(key: string, value: string): Promise<void> {
  const items = await getReferenceList(key);
  const found = items.find((i) => i.value === value);
  if (!found) {
    throw new HttpError(400, `'${value}' is not a known value of '${key}'.`);
  }
  if (!found.active) {
    throw new HttpError(400, `'${found.label}' has been retired from '${key}'. Pick a current value.`);
  }
}
