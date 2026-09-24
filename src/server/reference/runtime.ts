/**
 * Server-side vocabulary runtime: stage graph + active-value helpers with a
 * short in-process cache.
 *
 * The cache is invalidated on every list PATCH/DELETE via
 * `invalidateReferenceCache()`. TTL is a safety net for multi-instance deploys
 * where one process's write cannot poke another's Map.
 */

import { ReferenceList } from '@/models/ReferenceList';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import {
  IN_FLIGHT_STAGES,
  STAGES,
  STAGE_LABELS,
  TERMINAL_STAGES,
  type Stage,
} from '@/lib/domain';

export interface StageGraph {
  /** Active stage values, catalog order (board column order). */
  all: string[];
  inFlight: string[];
  terminal: string[];
  board: string[];
  /** Stages from which a working lot may be discarded. */
  discardable: string[];
  /** Stages whose SLA is decisionPendingDays. */
  decision: string[];
  /** Stages whose SLA is scanStuckDays. */
  scan: string[];
  /** Stages that feed the "awaiting MLS tag" counter. */
  mlsTag: string[];
  labels: Record<string, string>;
}

export function defaultStageGraph(): StageGraph {
  return {
    all: [...STAGES],
    inFlight: [...IN_FLIGHT_STAGES],
    terminal: [...TERMINAL_STAGES],
    board: [...STAGES],
    discardable: ['metadata', 'scanning', 'mls_tag', 'storage'],
    decision: ['decision'],
    scan: ['scanning'],
    mlsTag: ['mls_tag'],
    labels: { ...STAGE_LABELS },
  };
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; items: { value: string; label: string; active: boolean; sortOrder: number; meta: Record<string, unknown> }[] }>();

export function invalidateReferenceCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

async function loadItems(key: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  await connectToDatabase();
  const doc = await ReferenceList.findOne({ key }).lean();
  const items = (doc?.items ?? [])
    .map((i) => ({
      value: i.value,
      label: i.label,
      active: i.active,
      sortOrder: i.sortOrder,
      meta: (i.meta ?? {}) as Record<string, unknown>,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  cache.set(key, { at: Date.now(), items });
  return items;
}

/** Active stage graph from the `stage` list, falling back to domain defaults. */
export async function getStageGraph(): Promise<StageGraph> {
  try {
    const items = await loadItems('stage');
    const actives = items.filter((i) => i.active);
    if (actives.length === 0) return defaultStageGraph();
    const flag = (i: { meta: Record<string, unknown> }, k: string) => i.meta[k] === true;
    const role = (i: { meta: Record<string, unknown> }) => String(i.meta.alertRole ?? '');
    return {
      all: actives.map((i) => i.value),
      inFlight: actives.filter((i) => flag(i, 'inFlight')).map((i) => i.value),
      terminal: actives.filter((i) => flag(i, 'terminal')).map((i) => i.value),
      board: actives.filter((i) => flag(i, 'board')).map((i) => i.value),
      discardable: actives.filter((i) => flag(i, 'discardable')).map((i) => i.value),
      decision: actives.filter((i) => role(i) === 'decision').map((i) => i.value),
      scan: actives.filter((i) => role(i) === 'scan').map((i) => i.value),
      mlsTag: actives.filter((i) => role(i) === 'mls').map((i) => i.value),
      labels: Object.fromEntries(items.map((i) => [i.value, i.label])),
    };
  } catch {
    return defaultStageGraph();
  }
}

/** Active values of a list (empty if the list is missing). */
export async function activeValues(key: string): Promise<string[]> {
  try {
    return (await loadItems(key)).filter((i) => i.active).map((i) => i.value);
  } catch {
    return [];
  }
}

/** Values of a list whose meta flag is true (empty if the list is missing). */
export async function activeValuesWithFlag(key: string, flag: string): Promise<string[]> {
  try {
    return (await loadItems(key))
      .filter((i) => i.active && i.meta[flag] === true)
      .map((i) => i.value);
  } catch {
    return [];
  }
}

/** Assert `value` is an ACTIVE member of `key`. */
export async function assertActive(key: string, value: string): Promise<void> {
  let items: Awaited<ReturnType<typeof loadItems>>;
  try {
    items = await loadItems(key);
  } catch {
    throw new HttpError(400, `'${value}' is not a known value of '${key}'.`);
  }
  const found = items.find((i) => i.value === value);
  if (!found) {
    throw new HttpError(400, `'${value}' is not a known value of '${key}'.`);
  }
  if (!found.active) {
    throw new HttpError(400, `'${found.label}' has been retired from '${key}'. Pick a current value.`);
  }
}

/** Subtype list key for a format, from the `format` list meta. Free text when empty. */
export async function subtypeListKeyForFormat(format: string): Promise<string | null> {
  try {
    const items = await loadItems('format');
    const f = items.find((i) => i.value === format && i.active);
    if (!f) return null;
    const raw = f.meta.subtypeListKey;
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    if (format === 'photo' || format === 'video' || format === 'audio') {
      return `mediaSubtype.${format}`;
    }
    return null;
  }
}

/** Sync fallback used by pure scripts that never touch MongoDB. */
export function subtypeListKeySync(format: string): string | null {
  if (format === 'photo' || format === 'video' || format === 'audio') {
    return `mediaSubtype.${format}`;
  }
  return null;
}

export type { Stage };
