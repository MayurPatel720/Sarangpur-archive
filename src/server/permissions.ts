/**
 * Permission registry + role-grant checks.
 *
 * The split that makes roles admin-manageable without breaking code:
 *
 * - Permission KEYS are a contract owned by this file. Route handlers check
 *   `can(grants, 'decision:record')`, so renaming a key would silently break the
 *   check. New features add new keys here, next to the code that enforces them.
 * - Which keys each ROLE holds is pure data in the `roles` collection, editable in
 *   `/admin/roles`. No hierarchy: access is grant presence only, so custom roles
 *   never fall into rank-ordering cracks. `rank` on the Role doc is display order.
 *
 * `can()` itself is synchronous over an already-loaded grant list. Route handlers
 * must load the role's LIVE grants from the database per mutation (see
 * `loadRoleGrants`) so revoking a permission takes effect instantly, even for
 * logged-in sessions carrying a stale JWT.
 */

export const PERMISSIONS = [
  // Dashboard
  'dashboard:view',
  // Register / intake
  'lot:view',
  'lot:create',
  'lot:edit',
  /** Edit lots in terminal stages (storage / returned / discarded). Locked legal record. */
  'lot:editTerminal',
  // Decision
  'decision:view',
  'decision:record',
  'override:request',
  'override:approve',
  // Digitize
  'digitize:view',
  'scan:record',
  'reconcile:trigger',
  // MLS
  'mls:view',
  'mls:tag',
  'duplicate:resolve',
  // Returns
  'returns:view',
  'return:manage',
  // Disposal
  'discards:view',
  'discard:confirm',
  'discard:reverse',
  // Attachments (view rides on lot:view)
  'attachment:upload',
  // Admin
  'user:manage',
  'settings:manage',
  'lists:manage',
  'roles:manage',
  'audit:view',
  'audit:export',
  'storage:view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** The four seeded role keys. Mirror `ROLES` in domain.ts. */
export const SYSTEM_ROLE_KEYS = ['volunteer', 'reviewer', 'lead_reviewer', 'admin'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

/**
 * Seed grant sets. Encode the original role hierarchy as grants: each step up adds
 * capabilities, nothing is ever removed. Custom roles compose freely from PERMISSIONS.
 */
export const SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Permission[]> = {
  volunteer: [
    'dashboard:view',
    'lot:view',
    'lot:create',
    'lot:edit',
    'digitize:view',
    'scan:record',
    'reconcile:trigger',
    'returns:view',
    'return:manage',
    'discards:view',
    'attachment:upload',
  ],
  reviewer: [
    'dashboard:view',
    'lot:view',
    'lot:create',
    'lot:edit',
    'decision:view',
    'decision:record',
    'override:request',
    'digitize:view',
    'scan:record',
    'reconcile:trigger',
    'mls:view',
    'mls:tag',
    'returns:view',
    'return:manage',
    'discards:view',
    'discard:confirm',
    'attachment:upload',
  ],
  lead_reviewer: [
    'dashboard:view',
    'lot:view',
    'lot:create',
    'lot:edit',
    'decision:view',
    'decision:record',
    'override:request',
    'override:approve',
    'digitize:view',
    'scan:record',
    'reconcile:trigger',
    'mls:view',
    'mls:tag',
    'duplicate:resolve',
    'returns:view',
    'return:manage',
    'discards:view',
    'discard:confirm',
    'attachment:upload',
  ],
  admin: [...PERMISSIONS],
};

export const SYSTEM_ROLE_META: { key: SystemRoleKey; label: string; rank: number }[] = [
  { key: 'volunteer', label: 'Volunteer', rank: 0 },
  { key: 'reviewer', label: 'Reviewer', rank: 1 },
  { key: 'lead_reviewer', label: 'Lead Reviewer', rank: 2 },
  { key: 'admin', label: 'Admin', rank: 3 },
];

/** Pure grant check. `grants` must be the role's live permissions from the database. */
export function can(grants: readonly string[], permission: Permission): boolean {
  return grants.includes(permission);
}

/** Grants that confer full system management (used by the lockout invariants). */
const MANAGEMENT_GRANTS: Permission[] = ['user:manage', 'roles:manage'];

export interface RoleLike {
  key: string;
  active: boolean;
  permissions: string[];
}

export interface UserLike {
  username: string;
  active: boolean;
  role: string;
}

/**
 * Lockout invariants, kept pure (plain in/out) so the role/user mutation layer and
 * unit tests share them. Returns human-readable violations; empty means safe.
 *
 * Rule 1: at least one ACTIVE role must hold every management grant.
 * Rule 2: at least one ACTIVE user must sit in a managing role.
 */
export function checkSystemSafety(roles: RoleLike[], users: UserLike[]): string[] {
  const violations: string[] = [];

  const managingRoles = roles.filter(
    (r) => r.active && MANAGEMENT_GRANTS.every((g) => r.permissions.includes(g)),
  );
  if (managingRoles.length === 0) {
    violations.push(
      'No active role holds all management grants (user:manage, roles:manage). The system would be unadministrable.',
    );
  }

  const managingKeys = new Set(managingRoles.map((r) => r.key));
  const managingUsers = users.filter((u) => u.active && managingKeys.has(u.role));
  if (managingUsers.length === 0) {
    violations.push(
      'No active user sits in a managing role. Nobody could sign in to administer the system.',
    );
  }

  return violations;
}

/** Guard for self-destructive user edits, evaluated before any user mutation. */
export function checkSelfEdit(
  actorUserId: string,
  targetUserId: string,
  patch: { role?: string; active?: boolean },
): string | null {
  if (actorUserId !== targetUserId) return null;
  if (patch.role !== undefined) return 'You cannot change your own role.';
  if (patch.active === false) return 'You cannot deactivate yourself.';
  return null;
}
