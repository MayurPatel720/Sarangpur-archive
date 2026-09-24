/**
 * Pure seed data for the Module-0 collections (roles, reference lists, settings).
 *
 * Lives in its own module — no database, no side effects — so both `seed.ts`
 * (which writes it) and `verify-seed.ts` (which validates it) import from here.
 * `seed.ts` must never be imported: it runs `main()` at module level.
 *
 * Reference lists come from `src/lib/vocab-catalog.ts` so the admin protection
 * set and the seed inventory cannot drift.
 */

import { SYSTEM_ROLE_GRANTS, SYSTEM_ROLE_META } from '../src/server/permissions';
import { SEED_SYSTEM_LISTS, catalogToSeedDoc, type CatalogList } from '../src/lib/vocab-catalog';

/**
 * Dev-only password stamped onto every generated seed user. Real users are created
 * with `scripts/create-user.ts`, never by editing this.
 */
export const SEED_DEV_PASSWORD = 'archive-dev-123';

export function buildRoles(): Record<string, unknown>[] {
  return SYSTEM_ROLE_META.map((m) => ({
    key: m.key,
    label: m.label,
    rank: m.rank,
    permissions: [...SYSTEM_ROLE_GRANTS[m.key]],
    isSystem: true,
    active: true,
    revision: 1,
    recentChanges: [],
  }));
}

/** Wire-shaped catalog lists for insert/upsert (see src/lib/vocab-catalog.ts). */
export const SEED_REFERENCE_LISTS: Record<string, unknown>[] = SEED_SYSTEM_LISTS.map(catalogToSeedDoc);

export function catalogLists(): CatalogList[] {
  return SEED_SYSTEM_LISTS;
}

export function buildGlobalSettings(): Record<string, unknown> {
  return {
    key: 'global',
    decisionPendingDays: 5,
    scanStuckDays: 7,
    returnGraceDays: 3,
    storageCapacityTb: 96,
    storageLabel: 'MLS reachable',
    storageRoot: '192.168.0.84/MLS/dev/',
    storageUsedTb: 0,
    notifyEmailEnabled: false,
    notifySmsEnabled: false,
    revision: 1,
  };
}
