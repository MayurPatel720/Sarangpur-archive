import { z } from 'zod';
import { PERMISSIONS } from '@/server/permissions';

/**
 * Wire contracts for the admin module (roles, reference lists, users, settings).
 *
 * Same rule as the dashboard contracts: every route parses its response with
 * these schemas before returning it, and the client infers its types from them.
 * `permissions.ts` is import-safe here — it owns zero imports, so no cycle.
 */

/* -------------------------------------------------------------------- roles */

const permissionSchema = z.enum(PERMISSIONS);

export const roleSchema = z.object({
  key: z.string(),
  label: z.string(),
  rank: z.number(),
  permissions: z.array(z.string()),
  isSystem: z.boolean(),
  active: z.boolean(),
  revision: z.number(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
  recentChanges: z.array(
    z.object({
      at: z.string(),
      actorName: z.string(),
      summary: z.string(),
    }),
  ),
});
export type AdminRole = z.infer<typeof roleSchema>;

export const rolesListResponseSchema = z.object({ roles: z.array(roleSchema) });
export type RolesListResponse = z.infer<typeof rolesListResponseSchema>;

export const roleResponseSchema = z.object({ role: roleSchema });
export type RoleResponse = z.infer<typeof roleResponseSchema>;

export const roleCreateBodySchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,31}$/, 'Key must start with a letter, letters/digits/underscore only.'),
  label: z.string().trim().min(1).max(80),
  rank: z.number().int().default(0),
  permissions: z.array(permissionSchema).default([]),
});
export type RoleCreateBody = z.infer<typeof roleCreateBodySchema>;

export const rolePatchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    permissions: z.array(permissionSchema).optional(),
    active: z.boolean().optional(),
    expectedRevision: z.number().int(),
  })
  .refine(
    (b) => b.label !== undefined || b.permissions !== undefined || b.active !== undefined,
    'Nothing to change.',
  );
export type RolePatchBody = z.infer<typeof rolePatchBodySchema>;

/* ---------------------------------------------------------- reference lists */

export const metaFieldSchema = z.object({
  field: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field must be a valid identifier.'),
  type: z.enum(['string', 'number', 'boolean']),
  required: z.boolean(),
  unique: z.boolean(),
});
export type ListMetaField = z.infer<typeof metaFieldSchema>;

export const listItemSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  active: z.boolean(),
  sortOrder: z.number(),
  usageCount: z.number(),
  meta: z.record(z.string(), z.unknown()),
});
export type AdminListItem = z.infer<typeof listItemSchema>;

export const referenceListSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
  metaSchema: z.array(metaFieldSchema),
  items: z.array(listItemSchema),
  revision: z.number(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type AdminReferenceList = z.infer<typeof referenceListSchema>;

export const listsResponseSchema = z.object({ lists: z.array(referenceListSchema) });
export type ListsResponse = z.infer<typeof listsResponseSchema>;

export const listResponseSchema = z.object({ list: referenceListSchema });
export type ListResponse = z.infer<typeof listResponseSchema>;

export const listCreateBodySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/,
      'Key must be lowercase, dot-namespaced (e.g. mediaSubtype.photo).',
    )
    .max(80),
  label: z.string().trim().min(1).max(120),
  group: z.string().trim().min(1).max(60).default('Custom'),
  metaSchema: z.array(metaFieldSchema).default([]),
});
export type ListCreateBody = z.infer<typeof listCreateBodySchema>;

/** Full item replacement — usageCount is server-owned and merged by value. */
const listPatchItemSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  active: z.boolean(),
  sortOrder: z.number(),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export const listPatchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    group: z.string().trim().min(1).max(60).optional(),
    items: z.array(listPatchItemSchema).optional(),
    expectedRevision: z.number().int(),
  })
  .refine(
    (b) => b.label !== undefined || b.group !== undefined || b.items !== undefined,
    'Nothing to change.',
  );
export type ListPatchBody = z.infer<typeof listPatchBodySchema>;

export const listDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  key: z.string(),
});
export type ListDeleteResponse = z.infer<typeof listDeleteResponseSchema>;

/* ----------------------------------------------------------- public lookup */

export const referenceLookupItemSchema = z.object({
  value: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  meta: z.record(z.string(), z.unknown()),
});

export const referenceLookupResponseSchema = z.object({
  key: z.string(),
  label: z.string(),
  items: z.array(referenceLookupItemSchema),
});
export type ReferenceLookupResponse = z.infer<typeof referenceLookupResponseSchema>;

/* -------------------------------------------------------------------- users */

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  active: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const usersResponseSchema = z.object({ users: z.array(adminUserSchema) });
export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const userResponseSchema = z.object({ user: adminUserSchema });
export type UserResponse = z.infer<typeof userResponseSchema>;

export const userCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(40),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  role: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
});
export type UserCreateBody = z.infer<typeof userCreateBodySchema>;

export const userPatchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    role: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(128).optional(),
    // null clears the email; omitted leaves it untouched.
    email: z.string().trim().email().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change.');
export type UserPatchBody = z.infer<typeof userPatchBodySchema>;

export const meResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleKey: z.string(),
  grants: z.array(z.string()),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/* ----------------------------------------------------------------- settings */

export const settingsSchema = z.object({
  decisionPendingDays: z.number(),
  scanStuckDays: z.number(),
  returnGraceDays: z.number(),
  storageCapacityTb: z.number(),
  notifyEmailEnabled: z.boolean(),
  notifySmsEnabled: z.boolean(),
  revision: z.number(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type AdminSettings = z.infer<typeof settingsSchema>;

export const settingsResponseSchema = z.object({ settings: settingsSchema });
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const settingsPatchBodySchema = z
  .object({
    decisionPendingDays: z.number().int().min(1).optional(),
    scanStuckDays: z.number().int().min(1).optional(),
    returnGraceDays: z.number().int().min(0).optional(),
    storageCapacityTb: z.number().min(1).optional(),
    notifyEmailEnabled: z.boolean().optional(),
    notifySmsEnabled: z.boolean().optional(),
    expectedRevision: z.number().int(),
  })
  .refine((b) => Object.keys(b).length > 1, 'Nothing to change.');
export type SettingsPatchBody = z.infer<typeof settingsPatchBodySchema>;
