/**
 * Pure seed data for the Module-0 collections (roles, reference lists, settings).
 *
 * Lives in its own module — no database, no side effects — so both `seed.ts`
 * (which writes it) and `verify-seed.ts` (which validates it) import from here.
 * `seed.ts` must never be imported: it runs `main()` at module level.
 */

import { SYSTEM_ROLE_GRANTS, SYSTEM_ROLE_META } from '../src/server/permissions';

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

export const SEED_REFERENCE_LISTS: Record<string, unknown>[] = [
  {
    key: 'mediaSubtype.photo',
    label: 'Photo sub-types',
    group: 'Media',
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: true }],
    items: [
      { value: 'negative', label: 'Negative', active: true, sortOrder: 0, usageCount: 0, meta: { codePrefix: 'NEG' } },
      { value: 'print', label: 'Print', active: true, sortOrder: 1, usageCount: 0, meta: { codePrefix: 'PRT' } },
      { value: 'slide', label: 'Slide / transparency', active: true, sortOrder: 2, usageCount: 0, meta: { codePrefix: 'SLD' } },
      { value: 'album', label: 'Album page', active: true, sortOrder: 3, usageCount: 0, meta: { codePrefix: 'ALB' } },
    ],
    revision: 1,
  },
  {
    key: 'mediaSubtype.video',
    label: 'Video sub-types',
    group: 'Media',
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: true }],
    items: [
      { value: 'videotape', label: 'Videotape', active: true, sortOrder: 0, usageCount: 0, meta: { codePrefix: 'VID' } },
      { value: 'film_reel', label: 'Film reel', active: true, sortOrder: 1, usageCount: 0, meta: { codePrefix: 'REL' } },
      { value: 'digital_file', label: 'Digital file', active: true, sortOrder: 2, usageCount: 0, meta: { codePrefix: 'VDF' } },
    ],
    revision: 1,
  },
  {
    key: 'mediaSubtype.audio',
    label: 'Audio sub-types',
    group: 'Media',
    metaSchema: [{ field: 'codePrefix', type: 'string', required: true, unique: true }],
    items: [
      { value: 'cassette', label: 'Cassette', active: true, sortOrder: 0, usageCount: 0, meta: { codePrefix: 'AUD' } },
      { value: 'audio_reel', label: 'Audio reel', active: true, sortOrder: 1, usageCount: 0, meta: { codePrefix: 'ARL' } },
      { value: 'digital_file', label: 'Digital file', active: true, sortOrder: 2, usageCount: 0, meta: { codePrefix: 'ADF' } },
    ],
    revision: 1,
  },
  {
    key: 'rightsType',
    label: 'Rights / consent types',
    group: 'Rights & Legal',
    metaSchema: [],
    items: [
      { value: 'deed_of_gift', label: 'Deed of gift', active: true, sortOrder: 0, usageCount: 0, meta: {} },
      { value: 'loan', label: 'Loan', active: true, sortOrder: 1, usageCount: 0, meta: {} },
      { value: 'verbal_permission', label: 'Verbal permission', active: true, sortOrder: 2, usageCount: 0, meta: {} },
      { value: 'unknown', label: 'Unknown / unrecorded', active: true, sortOrder: 3, usageCount: 0, meta: {} },
    ],
    revision: 1,
  },
];

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
