import { Types } from 'mongoose';
import { Role } from '@/models/Role';
import { ReferenceList } from '@/models/ReferenceList';
import { Setting } from '@/models/Setting';
import { User } from '@/models/User';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError, type MutationContext } from '@/lib/api';
import { PERMISSIONS, checkSystemSafety, checkSelfEdit } from '@/server/permissions';
import { hashPassword } from '@/server/auth-verify';
import { PROTECTED_LIST_KEYS, catalogList } from '@/lib/vocab-catalog';
import { invalidateReferenceCache } from '@/server/reference/runtime';
import {
  serializeList,
  serializeRole,
  serializeSettings,
  serializeUser,
} from '@/server/admin/queries';
import type {
  AdminReferenceList,
  AdminRole,
  AdminSettings,
  AdminUser,
  ListCreateBody,
  ListMetaField,
  ListPatchBody,
  RoleCreateBody,
  RolePatchBody,
  SettingsPatchBody,
  UserCreateBody,
  UserPatchBody,
} from '@/types/admin';

/**
 * Admin write layer. Every mutation enforces the same three rules:
 *
 * 1. Optimistic concurrency — PATCH bodies carry `expectedRevision`, the update
 *    filters on it, so two admins cannot silently overwrite each other (→ 409).
 * 2. Lockout safety — role/user changes are simulated through
 *    `checkSystemSafety()` before they are written (→ 409 with the reason).
 * 3. History — roles keep `recentChanges[]` (cap 50); reference values are
 *    deactivated, never deleted while in use.
 */

function actorId(ctx: MutationContext): Types.ObjectId | null {
  return Types.ObjectId.isValid(ctx.userId) ? new Types.ObjectId(ctx.userId) : null;
}

function changeEntry(ctx: MutationContext, summary: string) {
  return { at: new Date(), actorName: ctx.userName, summary };
}

async function assertLiveSafety(
  roles: { key: string; active: boolean; permissions: string[] }[],
  users: { username: string; active: boolean; role: string }[],
): Promise<void> {
  const violations = checkSystemSafety(roles, users);
  if (violations.length > 0) {
    throw new HttpError(409, violations.join(' '));
  }
}

async function liveRolesAndUsers() {
  const [roles, users] = await Promise.all([
    Role.find({}).lean(),
    User.find({}).select({ username: 1, active: 1, role: 1 }).lean(),
  ]);
  return {
    roles: roles.map((r) => ({ key: r.key, active: r.active, permissions: [...r.permissions] })),
    users: users.map((u) => ({ username: u.username, active: u.active, role: u.role })),
  };
}

/* -------------------------------------------------------------------- roles */

export async function createRole(body: RoleCreateBody, ctx: MutationContext): Promise<AdminRole> {
  await connectToDatabase();
  const key = body.key.toLowerCase().trim();
  const existing = await Role.findOne({ key }).lean();
  if (existing) throw new HttpError(409, `Role '${key}' already exists.`);

  for (const p of body.permissions) {
    if (!(PERMISSIONS as readonly string[]).includes(p)) {
      throw new HttpError(400, `Unknown permission '${p}'.`);
    }
  }

  const doc = await Role.create({
    key,
    label: body.label,
    rank: body.rank,
    permissions: [...new Set(body.permissions)],
    isSystem: false,
    active: true,
    revision: 1,
    updatedBy: actorId(ctx),
    recentChanges: [changeEntry(ctx, 'Role created.')],
  });
  return serializeRole(doc.toObject());
}

export async function patchRole(
  key: string,
  body: RolePatchBody,
  ctx: MutationContext,
): Promise<AdminRole> {
  await connectToDatabase();
  const current = await Role.findOne({ key }).lean();
  if (!current) throw new HttpError(404, `Role '${key}' not found.`);
  if (current.revision !== body.expectedRevision) {
    throw new HttpError(409, `'${current.label}' changed since you loaded it. Reload and try again.`);
  }

  const set: Record<string, unknown> = { updatedBy: actorId(ctx) };
  const notes: string[] = [];
  if (body.label !== undefined && body.label !== current.label) {
    set.label = body.label;
    notes.push(`renamed to '${body.label}'`);
  }
  if (body.permissions !== undefined) {
    const next = [...new Set(body.permissions)];
    for (const p of next) {
      if (!(PERMISSIONS as readonly string[]).includes(p)) {
        throw new HttpError(400, `Unknown permission '${p}'.`);
      }
    }
    set.permissions = next;
    notes.push(`grants set to ${next.length} permission(s)`);
  }
  if (body.active !== undefined && body.active !== current.active) {
    set.active = body.active;
    notes.push(body.active ? 'activated' : 'deactivated');
  }
  if (notes.length === 0) throw new HttpError(400, 'Nothing to change.');

  // Simulate the lockout invariants before writing.
  const live = await liveRolesAndUsers();
  const simRoles = live.roles.map((r) =>
    r.key === key
      ? {
          key,
          active: (set.active ?? current.active) as boolean,
          permissions: (set.permissions ?? current.permissions) as string[],
        }
      : r,
  );
  await assertLiveSafety(simRoles, live.users);

  const updated = await Role.findOneAndUpdate(
    { key, revision: body.expectedRevision },
    {
      $set: set,
      $inc: { revision: 1 },
      $push: { recentChanges: { $each: [changeEntry(ctx, notes.join('; '))], $slice: -50 } },
    },
    { new: true },
  ).lean();
  if (!updated) {
    throw new HttpError(409, `'${current.label}' changed since you loaded it. Reload and try again.`);
  }
  return serializeRole(updated);
}

/* ---------------------------------------------------------- reference lists */

/**
 * Stage-list invariants so free-form editing cannot break the board or SLA
 * queries: at least one terminal stage, at least one board column, no silent
 * value renames, and alert roles stay unique among active stages.
 */
function assertStageListInvariants(
  currentItems: { value: string; active: boolean; usageCount: number; meta: unknown }[],
  nextItems: { value: string; active: boolean; sortOrder: number; meta: Record<string, unknown> }[],
): void {
  const before = new Map(currentItems.map((i) => [i.value, i] as const));
  const removed = currentItems.filter((i) => !nextItems.some((n) => n.value === i.value));
  if (removed.length > 0) {
    throw new HttpError(
      400,
      `Stage values are immutable — deactivate instead of removing ${removed.map((r) => `'${r.value}'`).join(', ')}.`,
    );
  }
  for (const item of nextItems) {
    if (!before.has(item.value)) {
      throw new HttpError(400, `Stage values are immutable — cannot add '${item.value}'.`);
    }
  }
  const actives = nextItems.filter((i) => i.active);
  if (actives.length === 0) throw new HttpError(400, 'At least one stage must stay active.');
  const terminal = actives.filter((i) => i.meta?.terminal === true);
  if (terminal.length === 0) {
    throw new HttpError(400, 'At least one active stage must be marked terminal.');
  }
  const board = actives.filter((i) => i.meta?.board === true);
  if (board.length === 0) {
    throw new HttpError(400, 'At least one active stage must appear on the board.');
  }
  const offGraph = board.filter((i) => i.meta?.terminal !== true && i.meta?.inFlight !== true);
  if (offGraph.length > 0) {
    throw new HttpError(
      400,
      `Board stages must be in-flight or terminal so the pipeline can count them: ${offGraph.map((i) => `'${i.value}'`).join(', ')}.`,
    );
  }
  const roles = actives
    .map((i) => String(i.meta?.alertRole ?? ''))
    .filter((r) => r !== '');
  if (new Set(roles).size !== roles.length) {
    throw new HttpError(400, 'alertRole must be unique among active stages.');
  }
}

/** Format / decision system lists: values never change; meta/labels may. */
function assertSystemValueImmutable(
  key: string,
  currentItems: { value: string }[],
  nextItems: { value: string }[],
): void {
  const before = new Set(currentItems.map((i) => i.value));
  const after = new Set(nextItems.map((i) => i.value));
  const removed = [...before].filter((v) => !after.has(v));
  const added = [...after].filter((v) => !before.has(v));
  if (removed.length > 0 || added.length > 0) {
    throw new HttpError(
      400,
      `'${key}' is a system list — values are immutable. Deactivate items instead of adding or removing values.`,
    );
  }
}

/** All lists: values already in the list never change (open tier too). Deactivate to retire. */
function assertExistingValuesImmutable(
  key: string,
  currentItems: { value: string }[],
  nextItems: { value: string }[],
): void {
  const after = new Set(nextItems.map((i) => i.value));
  const removed = currentItems.filter((i) => !after.has(i.value));
  if (removed.length > 0) {
    throw new HttpError(
      400,
      `'${key}' values are immutable — deactivate instead of removing ${removed.map((r) => `'${r.value}'`).join(', ')}.`,
    );
  }
}

function validateListItems(
  metaSchema: ListMetaField[],
  items: { value: string; label: string; active: boolean; sortOrder: number; meta: Record<string, unknown> }[],
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const folded = item.value.toLowerCase();
    if (seen.has(folded)) throw new HttpError(400, `Duplicate item value '${item.value}'.`);
    seen.add(folded);
  }

  for (const item of items) {
    for (const field of metaSchema) {
      const raw = item.meta[field.field];
      const missing = raw === undefined || raw === null || raw === '';
      if (missing) {
        if (field.required) {
          throw new HttpError(400, `'${item.value}' is missing required '${field.field}'.`);
        }
        continue;
      }
      const ok =
        (field.type === 'string' && typeof raw === 'string') ||
        (field.type === 'number' && typeof raw === 'number' && !Number.isNaN(raw)) ||
        (field.type === 'boolean' && typeof raw === 'boolean');
      if (!ok) throw new HttpError(400, `'${item.value}.${field.field}' must be a ${field.type}.`);
    }
    const known = new Set(metaSchema.map((f) => f.field));
    const unknownFields = Object.keys(item.meta).filter((k) => !known.has(k));
    if (unknownFields.length > 0) {
      throw new HttpError(400, `'${item.value}' has unknown meta field(s): ${unknownFields.join(', ')}.`);
    }
  }

  for (const field of metaSchema.filter((f) => f.unique)) {
    const values = items
      .map((i) => i.meta[field.field])
      .filter((v) => v !== undefined && v !== null && v !== '');
    if (new Set(values.map(String)).size !== values.length) {
      throw new HttpError(400, `'${field.field}' must be unique across items.`);
    }
  }
}

/** Non-empty `format.meta.subtypeListKey` must point at an existing reference list. */
async function assertFormatSubtypeKeysExist(
  items: { value: string; meta: Record<string, unknown> }[],
): Promise<void> {
  const keys = items
    .map((i) => i.meta.subtypeListKey)
    .filter((k): k is string => typeof k === 'string' && k !== '');
  if (keys.length === 0) return;
  const found = await ReferenceList.find({ key: { $in: keys } })
    .select('key')
    .lean();
  const present = new Set(found.map((d) => d.key));
  const missing = [...new Set(keys)].filter((k) => !present.has(k));
  if (missing.length > 0) {
    throw new HttpError(
      400,
      `subtypeListKey points at missing list(s): ${missing.join(', ')}. Create the list first.`,
    );
  }
}

export async function createReferenceList(
  body: ListCreateBody,
  ctx: MutationContext,
): Promise<AdminReferenceList> {
  await connectToDatabase();
  const existing = await ReferenceList.findOne({ key: body.key }).lean();
  if (existing) throw new HttpError(409, `Reference list '${body.key}' already exists.`);

  const fields = body.metaSchema.map((f) => f.field);
  if (new Set(fields).size !== fields.length) {
    throw new HttpError(400, 'metaSchema declares a field twice.');
  }

  const doc = await ReferenceList.create({
    key: body.key,
    label: body.label,
    group: body.group,
    tier: 'open',
    protected: false,
    metaSchema: body.metaSchema,
    items: [],
    revision: 1,
    updatedBy: actorId(ctx),
  });
  invalidateReferenceCache(body.key);
  return serializeList(doc.toObject());
}

export async function patchReferenceList(
  key: string,
  body: ListPatchBody,
  ctx: MutationContext,
): Promise<AdminReferenceList> {
  await connectToDatabase();
  const current = await ReferenceList.findOne({ key }).lean();
  if (!current) throw new HttpError(404, `Reference list '${key}' not found.`);
  if (current.revision !== body.expectedRevision) {
    throw new HttpError(409, `'${current.label}' changed since you loaded it. Reload and try again.`);
  }

  const set: Record<string, unknown> = { updatedBy: actorId(ctx) };
  if (body.label !== undefined) set.label = body.label;
  if (body.group !== undefined) set.group = body.group;

  let nextMetaSchema = current.metaSchema as ListMetaField[];
  if (body.metaSchema !== undefined) {
    const fields = body.metaSchema.map((f) => f.field);
    if (new Set(fields).size !== fields.length) {
      throw new HttpError(400, 'metaSchema declares a field twice.');
    }
    nextMetaSchema = body.metaSchema;
    set.metaSchema = body.metaSchema;
  }

  if (body.items !== undefined) {
    validateListItems(
      nextMetaSchema,
      body.items as { value: string; label: string; active: boolean; sortOrder: number; meta: Record<string, unknown> }[],
    );
    // Values already in the list never change — open and system tiers alike.
    assertExistingValuesImmutable(
      key,
      current.items as { value: string }[],
      body.items as { value: string }[],
    );
    const catalog = catalogList(key);
    const isSystem = (current.tier ?? catalog?.tier ?? 'open') === 'system';
    if (isSystem) {
      assertSystemValueImmutable(
        key,
        current.items as { value: string }[],
        body.items as { value: string }[],
      );
      if (key === 'stage') {
        assertStageListInvariants(
          current.items as { value: string; active: boolean; usageCount: number; meta: unknown }[],
          body.items as { value: string; active: boolean; sortOrder: number; meta: Record<string, unknown> }[],
        );
      }
      if (key === 'format') {
        await assertFormatSubtypeKeysExist(
          body.items as { value: string; meta: Record<string, unknown> }[],
        );
      }
    }
    const counts = new Map(current.items.map((i) => [i.value, i.usageCount]));
    const removed = current.items.filter((i) => !body.items!.some((n) => n.value === i.value));
    const blocked = removed.filter((i) => i.usageCount > 0);
    if (blocked.length > 0) {
      throw new HttpError(
        400,
        `${blocked.map((i) => `'${i.label}'`).join(', ')} ${blocked.length === 1 ? 'is' : 'are'} still in use and cannot be removed. Deactivate instead.`,
      );
    }
    set.items = body.items.map((item, index) => ({
      value: item.value,
      label: item.label,
      active: item.active,
      sortOrder: item.sortOrder ?? index,
      usageCount: counts.get(item.value) ?? 0,
      meta: item.meta ?? {},
    }));
  }

  if (Object.keys(set).length === 1) throw new HttpError(400, 'Nothing to change.');

  const updated = await ReferenceList.findOneAndUpdate(
    { key, revision: body.expectedRevision },
    { $set: set, $inc: { revision: 1 } },
    { new: true },
  ).lean();
  if (!updated) {
    throw new HttpError(409, `'${current.label}' changed since you loaded it. Reload and try again.`);
  }
  invalidateReferenceCache(key);
  return serializeList(updated);
}

export async function deleteReferenceList(key: string): Promise<{ deleted: true; key: string }> {
  await connectToDatabase();
  const catalogProtected = PROTECTED_LIST_KEYS.has(key);
  const current = await ReferenceList.findOne({ key }).lean();
  if (!current) throw new HttpError(404, `Reference list '${key}' not found.`);
  if (catalogProtected || current.protected === true || (current.tier ?? 'open') === 'system') {
    throw new HttpError(400, `'${key}' is required by the app and cannot be deleted.`);
  }
  const inUse = current.items.filter((i) => i.usageCount > 0);
  if (inUse.length > 0) {
    throw new HttpError(
      400,
      `Cannot delete '${key}': ${inUse.map((i) => `'${i.label}'`).join(', ')} ${inUse.length === 1 ? 'is' : 'are'} still in use.`,
    );
  }
  await ReferenceList.deleteOne({ key });
  invalidateReferenceCache(key);
  return { deleted: true as const, key };
}

/* -------------------------------------------------------------------- users */

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).map((w) => w[0] ?? '');
  return (parts[0] + (parts[1] ?? '')).toUpperCase().slice(0, 3) || '??';
}

export async function createUser(body: UserCreateBody, _ctx: MutationContext): Promise<AdminUser> {
  await connectToDatabase();
  const username = body.username.toLowerCase().trim();
  const existing = await User.findOne({ username }).lean();
  if (existing) throw new HttpError(409, `Username '${username}' is taken.`);

  const email = body.email?.toLowerCase().trim() || undefined;
  if (email) {
    const emailTaken = await User.findOne({ email }).lean();
    if (emailTaken) throw new HttpError(409, `Email '${email}' is already in use.`);
  }

  const roleDoc = await Role.findOne({ key: body.role }).lean();
  if (!roleDoc) throw new HttpError(400, `Role '${body.role}' does not exist.`);
  if (!roleDoc.active) throw new HttpError(400, `Role '${roleDoc.label}' is deactivated.`);

  const doc = await User.create({
    name: body.name.trim(),
    initials: initialsFor(body.name),
    username,
    ...(email ? { email } : {}),
    role: roleDoc.key,
    active: true,
    passwordHash: await hashPassword(body.password),
  });
  return serializeUser(doc.toObject());
}

export async function patchUser(
  userId: string,
  body: UserPatchBody,
  ctx: MutationContext,
): Promise<AdminUser> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(userId)) throw new HttpError(404, 'User not found.');
  const current = await User.findById(userId).lean();
  if (!current) throw new HttpError(404, 'User not found.');

  const selfBlock = checkSelfEdit(ctx.userId, String(current._id), {
    role: body.role,
    active: body.active,
  });
  if (selfBlock) throw new HttpError(403, selfBlock);

  const set: Record<string, unknown> = {};
  const unset: Record<string, unknown> = {};
  if (body.name !== undefined && body.name.trim() !== current.name) {
    set.name = body.name.trim();
    set.initials = initialsFor(body.name);
  }
  if (body.role !== undefined && body.role !== current.role) {
    const roleDoc = await Role.findOne({ key: body.role }).lean();
    if (!roleDoc) throw new HttpError(400, `Role '${body.role}' does not exist.`);
    if (!roleDoc.active) throw new HttpError(400, `Role '${roleDoc.label}' is deactivated.`);
    set.role = roleDoc.key;
  }
  if (body.active !== undefined && body.active !== current.active) set.active = body.active;
  if (body.password !== undefined) set.passwordHash = await hashPassword(body.password);
  if (body.email !== undefined) {
    if (body.email === null) {
      if (current.email) unset.email = 1;
    } else {
      const email = body.email.toLowerCase().trim();
      if (email !== (current.email ?? undefined)) {
        const taken = await User.findOne({ email, _id: { $ne: current._id } }).lean();
        if (taken) throw new HttpError(409, `Email '${email}' is already in use.`);
        set.email = email;
      }
    }
  }
  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0)
    throw new HttpError(400, 'Nothing to change.');

  // Simulate the lockout invariants before writing.
  const live = await liveRolesAndUsers();
  const simUsers = live.users.map((u) =>
    u.username === current.username
      ? {
          username: u.username,
          active: (set.active ?? current.active) as boolean,
          role: (set.role ?? current.role) as string,
        }
      : u,
  );
  await assertLiveSafety(live.roles, simUsers);

  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length > 0) update.$unset = unset;
  const updated = await User.findByIdAndUpdate(userId, update, { new: true }).lean();
  if (!updated) throw new HttpError(404, 'User not found.');
  return serializeUser(updated);
}

/* ---------------------------------------------------------------- settings */

export async function patchSettings(
  body: SettingsPatchBody,
  ctx: MutationContext,
): Promise<AdminSettings> {
  await connectToDatabase();
  const { expectedRevision, ...fields } = body;

  const updated = await Setting.findOneAndUpdate(
    { key: 'global', revision: expectedRevision },
    { $set: { ...fields, updatedBy: actorId(ctx) }, $inc: { revision: 1 } },
    { new: true },
  ).lean();
  if (updated) return serializeSettings(updated);

  const current = await Setting.findOne({ key: 'global' }).lean();
  if (!current) throw new HttpError(404, 'Settings not found. Reload and try again.');
  throw new HttpError(409, 'Settings changed since you loaded them. Reload and try again.');
}
