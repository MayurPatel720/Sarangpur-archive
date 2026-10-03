/**
 * The seeding itself, shared by `scripts/seed.ts` (CLI) and the guarded one-time
 * `/setup-seed` page. Assumes mongoose is ALREADY connected; wipes users, projects,
 * lots, items, activity, attachments and roles (reference lists and settings survive),
 * then inserts the demo archive and the main admin account.
 */

import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';
import { Project } from '../src/models/Project';
import { Attachment } from '../src/models/Attachment';
import { User } from '../src/models/User';
import { ReferenceList } from '../src/models/ReferenceList';
import { Role } from '../src/models/Role';
import { Setting } from '../src/models/Setting';
import { hashPassword } from '../src/server/auth-verify';
import { buildDataset } from './dataset';
import {
  buildGlobalSettings,
  buildRoles,
  SEED_DEV_PASSWORD,
  SEED_REFERENCE_LISTS,
} from './seed-data';
import { CATALOG_LIST_KEYS } from '../src/lib/vocab-catalog';

const CHUNK = 5000;

async function insertChunked(
  model: { insertMany: (docs: unknown[], opts: { ordered: boolean }) => Promise<unknown> },
  docs: Record<string, unknown>[],
) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await model.insertMany(docs.slice(i, i + CHUNK), { ordered: false });
  }
}


export interface SeedSummary {
  users: number;
  projects: number;
  lots: number;
  items: number;
  activity: number;
  roles: number;
  lists: number;
  masterTb: string;
  devPassword: string;
}

export async function seedDatabase(log: (message: string) => void = console.log): Promise<SeedSummary> {
  const print = log;
  print('→ generating dataset…');
  const { users, projects, lots, items, activity } = buildDataset();

  print('→ clearing collections…');
  await Promise.all([
    User.deleteMany({}),
    ArchiveLot.deleteMany({}),
    LotItem.deleteMany({}),
    Project.deleteMany({}),
    Attachment.deleteMany({}),
    ActivityLog.deleteMany({}),
    Role.deleteMany({}),
    // Code counters re-derive from the freshly seeded codes on first use.
    ArchiveLot.db.collection('counters').deleteMany({}),
    // ReferenceList is NOT wiped: admin vocabulary edits survive reseed.
    // Settings are NOT wiped: on reseed the admin's thresholds survive.
  ]);

  // Every generated team member can sign in with the dev password. Real accounts are
  // created with `scripts/create-user.ts`.
  const devPassword = process.env.SEED_DEV_PASSWORD || SEED_DEV_PASSWORD;
  const passwordHash = await hashPassword(devPassword);
  // The main admin signs in with `admin` OR the email below. Override with
  // SEED_ADMIN_PASSWORD; change it after first login.
  const adminPasswordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD || 'admin123');
  const usersWithPasswords = users.map((u) => ({
    ...u,
    passwordHash: u.username === 'admin' ? adminPasswordHash : passwordHash,
  }));

  print(`→ inserting ${usersWithPasswords.length} users…`);
  await insertChunked(User, usersWithPasswords);

  print(`→ inserting ${projects.length} projects…`);
  await insertChunked(Project, projects);

  print(`→ inserting ${lots.length} lots…`);
  await insertChunked(ArchiveLot, lots);

  print(`→ inserting ${items.length} item profiles…`);
  await insertChunked(LotItem, items);

  print(`→ inserting ${activity.length} audit entries…`);
  await insertChunked(ActivityLog, activity);

  const roles = buildRoles();
  print(`→ inserting ${roles.length} roles…`);
  await insertChunked(Role, roles);

  print(`→ upserting ${SEED_REFERENCE_LISTS.length} reference lists…`);
  const catalogKeys = new Set(CATALOG_LIST_KEYS);
  for (const list of SEED_REFERENCE_LISTS) {
    const key = String(list.key);
    const existing = await ReferenceList.findOne({ key }).lean();
    if (!existing) {
      await ReferenceList.updateOne({ key }, { $setOnInsert: list }, { upsert: true });
      continue;
    }
    if (!catalogKeys.has(key)) continue;
    // Catalog lists: refresh metaSchema + item meta from the catalog so new flags
    // (stage.discardable, returnStatus.open, …) land; preserve usageCount and labels.
    const seedItems = list.items as {
      value: string;
      label: string;
      active: boolean;
      sortOrder: number;
      meta: Record<string, unknown>;
    }[];
    const currentItems = (existing.items ?? []) as {
      value: string;
      label: string;
      active: boolean;
      sortOrder: number;
      usageCount: number;
      meta: Record<string, unknown>;
    }[];
    const byValue = new Map(currentItems.map((i) => [i.value, i] as const));
    const items = seedItems.map((s, index) => {
      const cur = byValue.get(s.value);
      return {
        value: s.value,
        label: cur?.label ?? s.label,
        active: cur?.active ?? s.active,
        sortOrder: cur?.sortOrder ?? s.sortOrder ?? index,
        usageCount: cur?.usageCount ?? 0,
        // Catalog flags win; extra admin meta keys on the stored item are kept.
        meta: { ...(cur?.meta ?? {}), ...s.meta },
      };
    });
    await ReferenceList.updateOne(
      { key },
      { $set: { metaSchema: list.metaSchema, items } },
    );
  }

  print('→ ensuring global settings…');
  await Setting.updateOne({ key: 'global' }, { $setOnInsert: buildGlobalSettings() }, { upsert: true });

  // Indexes are declared on the schemas; build them now so the first dashboard load is
  // not the thing that pays for them.
  print('→ building indexes…');
  await Promise.all([
    User.syncIndexes(),
    ArchiveLot.syncIndexes(),
    LotItem.syncIndexes(),
    ActivityLog.syncIndexes(),
    Role.syncIndexes(),
    ReferenceList.syncIndexes(),
    Setting.syncIndexes(),
  ]);

  const bytes = lots.reduce(
    (sum, l) => sum + ((l.digitization as { masterBytes: number }).masterBytes ?? 0),
    0,
  );

  return {
    users: users.length,
    projects: projects.length,
    lots: lots.length,
    items: items.length,
    activity: activity.length,
    roles: roles.length,
    lists: SEED_REFERENCE_LISTS.length,
    masterTb: (bytes / 1e12).toFixed(1),
    devPassword,
  };
}
