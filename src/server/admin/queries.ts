import { Role } from '@/models/Role';
import { ReferenceList } from '@/models/ReferenceList';
import { Setting } from '@/models/Setting';
import { User } from '@/models/User';
import { connectToDatabase } from '@/lib/mongo';
import type {
  AdminReferenceList,
  AdminRole,
  AdminSettings,
  AdminUser,
} from '@/types/admin';

/**
 * Admin read layer. Plain serializers only — every ObjectId becomes a string and
 * every Date becomes ISO, so the Zod response contracts hold by construction.
 */

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

export function serializeRole(doc: {
  key: string;
  label: string;
  rank: number;
  permissions: string[];
  isSystem: boolean;
  active: boolean;
  revision: number;
  updatedBy?: unknown;
  updatedAt?: unknown;
  recentChanges: { at: unknown; actorName: string; summary: string }[];
}): AdminRole {
  return {
    key: doc.key,
    label: doc.label,
    rank: doc.rank,
    permissions: [...doc.permissions],
    isSystem: doc.isSystem,
    active: doc.active,
    revision: doc.revision,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    updatedAt: iso(doc.updatedAt),
    recentChanges: doc.recentChanges.map((c) => ({
      at: iso(c.at),
      actorName: c.actorName,
      summary: c.summary,
    })),
  };
}

export async function listRoles(): Promise<AdminRole[]> {
  await connectToDatabase();
  const docs = await Role.find({}).sort({ rank: 1, key: 1 }).lean();
  return docs.map(serializeRole);
}

export function serializeUser(doc: {
  _id: unknown;
  name: string;
  initials: string;
  username: string;
  email?: string | null;
  role: string;
  active: boolean;
}): AdminUser {
  return {
    id: String(doc._id),
    name: doc.name,
    initials: doc.initials,
    username: doc.username,
    email: doc.email ?? null,
    role: doc.role,
    active: doc.active,
  };
}

export async function listUsers(): Promise<AdminUser[]> {
  await connectToDatabase();
  const docs = await User.find({}).sort({ name: 1 }).lean();
  return docs.map(serializeUser);
}

export function serializeList(doc: {
  key: string;
  label: string;
  group: string;
  metaSchema: { field: string; type: 'string' | 'number' | 'boolean'; required: boolean; unique: boolean }[];
  items: {
    value: string;
    label: string;
    active: boolean;
    sortOrder: number;
    usageCount: number;
    meta: unknown;
  }[];
  revision: number;
  updatedBy?: unknown;
  updatedAt?: unknown;
}): AdminReferenceList {
  return {
    key: doc.key,
    label: doc.label,
    group: doc.group,
    metaSchema: doc.metaSchema.map((m) => ({
      field: m.field,
      type: m.type,
      required: m.required,
      unique: m.unique,
    })),
    items: doc.items.map((i) => ({
      value: i.value,
      label: i.label,
      active: i.active,
      sortOrder: i.sortOrder,
      usageCount: i.usageCount,
      meta: (i.meta ?? {}) as Record<string, unknown>,
    })),
    revision: doc.revision,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    updatedAt: iso(doc.updatedAt),
  };
}

export async function listReferenceLists(): Promise<AdminReferenceList[]> {
  await connectToDatabase();
  const docs = await ReferenceList.find({}).sort({ group: 1, key: 1 }).lean();
  return docs.map(serializeList);
}

/**
 * Global settings, creating the document from seed-identical defaults on first
 * read so a wiped `settings` collection degrades to defaults instead of 404s.
 * Keep the defaults in sync with `buildGlobalSettings()` in scripts/seed-data.ts.
 */
export async function getSettings(): Promise<AdminSettings> {
  await connectToDatabase();
  const doc = await Setting.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
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
      },
    },
    { upsert: true, new: true },
  ).lean();
  if (!doc) throw new Error('Settings document could not be created.');
  // Self-heal: documents created before the storage fields existed get defaults
  // (no revision bump — this is a schema migration, not an admin edit).
  if (doc.storageLabel === undefined || doc.storageRoot === undefined || doc.storageUsedTb === undefined) {
    await Setting.updateOne(
      { key: 'global' },
      {
        $set: {
          ...(doc.storageLabel === undefined ? { storageLabel: 'MLS reachable' } : {}),
          ...(doc.storageRoot === undefined ? { storageRoot: '192.168.0.84/MLS/dev/' } : {}),
          ...(doc.storageUsedTb === undefined ? { storageUsedTb: 0 } : {}),
        },
      },
    );
    const healed = await Setting.findOne({ key: 'global' }).lean();
    if (!healed) throw new Error('Settings document could not be created.');
    return serializeSettings(healed);
  }
  return serializeSettings(doc);
}

export function serializeSettings(doc: {
  decisionPendingDays: number;
  scanStuckDays: number;
  returnGraceDays: number;
  storageCapacityTb: number;
  storageLabel: string;
  storageRoot: string;
  storageUsedTb: number;
  notifyEmailEnabled: boolean;
  notifySmsEnabled: boolean;
  revision: number;
  updatedBy?: unknown;
  updatedAt?: unknown;
}): AdminSettings {
  return {
    decisionPendingDays: doc.decisionPendingDays,
    scanStuckDays: doc.scanStuckDays,
    returnGraceDays: doc.returnGraceDays,
    storageCapacityTb: doc.storageCapacityTb,
    storageLabel: doc.storageLabel,
    storageRoot: doc.storageRoot,
    storageUsedTb: doc.storageUsedTb,
    notifyEmailEnabled: doc.notifyEmailEnabled,
    notifySmsEnabled: doc.notifySmsEnabled,
    revision: doc.revision,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    updatedAt: iso(doc.updatedAt),
  };
}
