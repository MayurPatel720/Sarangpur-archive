/**
 * Clears all demo / working data and loads a small sample: 2 projects and 10 lots.
 *
 *   npm run db:reset-sample              # dry run: shows the target and what would be deleted
 *   npm run db:reset-sample -- --yes     # does it
 *
 * DELETES: lots, items, projects (and their photos' records), tasks, notifications, activity
 * history, attachments, file index, MLS outbox, pickups and the code counters.
 * KEEPS:   users, roles, settings and the admin vocabularies (their "in use" counts are reset).
 *
 * The sample is created through the app's own server functions (intake, project wizard,
 * grid saves), so codes, audit entries and project links are exactly what the UI would make.
 * Photos already uploaded to Cloudinary for deleted projects are NOT removed from Cloudinary.
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import type { MutationContext } from '../src/lib/api';
import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { Attachment } from '../src/models/Attachment';
import { FileIndex } from '../src/models/FileIndex';
import { LotItem } from '../src/models/LotItem';
import { LotPickup } from '../src/models/LotPickup';
import { MlsOutbox } from '../src/models/MlsOutbox';
import { Notification } from '../src/models/Notification';
import { Project } from '../src/models/Project';
import { ProjectImage } from '../src/models/ProjectImage';
import { ReferenceList } from '../src/models/ReferenceList';
import { Task } from '../src/models/Task';
import { User } from '../src/models/User';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { createProject } from '../src/server/projects/mutations';
import { bulkUpdateItems, getItemsGrid } from '../src/server/lots/item-grid';
import { recodeSheet } from '../src/server/lots/item-codes';
import { ensureBothDataType } from './backfill-data-type-both';

const MODELS = [
  ['lots', ArchiveLot],
  ['items', LotItem],
  ['projects', Project],
  ['project photos', ProjectImage],
  ['tasks', Task],
  ['notifications', Notification],
  ['activity entries', ActivityLog],
  ['attachments', Attachment],
  ['file index rows', FileIndex],
  ['MLS outbox rows', MlsOutbox],
  ['pickups', LotPickup],
] as const;

const mask = (uri: string) => uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const yes = process.argv.includes('--yes');
  console.log(`\n  target   ${mask(uri)}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });
  console.log(`  database ${mongoose.connection.name}\n`);

  console.log('  would delete:');
  for (const [label, model] of MODELS) {
    console.log(`    ${String(await (model as typeof ArchiveLot).estimatedDocumentCount()).padStart(6)}  ${label}`);
  }
  console.log('  keeps: users, roles, settings, vocabularies\n');
  if (!yes) {
    console.log('  Dry run — nothing changed. Add --yes to delete and load the sample.\n');
    await mongoose.disconnect();
    return;
  }

  const user =
    (await User.findOne({ username: 'admin' }).select('name').lean()) ?? (await User.findOne({}).select('name').lean());
  if (!user) throw new Error('No users in the database — create one first (scripts/create-user.ts).');
  const admin: MutationContext = {
    userId: String(user._id),
    userName: user.name as string,
    roleKey: 'admin',
    grants: [...ALL_PERMISSIONS],
  };

  console.log('→ deleting…');
  for (const [, model] of MODELS) await (model as typeof ArchiveLot).deleteMany({});
  await ArchiveLot.db.collection('counters').deleteMany({});
  await ReferenceList.updateMany({}, { $set: { 'items.$[].usageCount': 0 } });
  if (await ensureBothDataType()) console.log('→ added "Physical + Digital" to the data types');

  console.log('→ loading the sample…');
  const now = new Date().toISOString();
  const owner = (name: string) => ({ name, phone: '+91 98000 00000' });

  const p1 = await createProject(
    {
      name: 'Surat Mandir Archive',
      description: 'Photos and videos kept at the Surat mandir.',
      shared: { dateReceived: now, originSource: 'SAR', owner: owner('Surat Mandir Trust') },
      mediaLines: [
        { format: 'photo', dataType: 'physical', mediaSubtype: '35MM Film — Album', quantity: 6, quantityToDigitize: 6 },
        { format: 'video', dataType: 'both', mediaSubtype: 'Mini DVs', quantity: 4, quantityToDigitize: 4 },
      ],
    },
    admin,
  );
  const p2 = await createProject(
    {
      name: 'Shah Family Collection',
      description: 'Family negatives and cassettes, Mumbai.',
      shared: { dateReceived: now, originSource: 'MUM', owner: owner('Shah Family') },
      mediaLines: [
        { format: 'photo', dataType: 'physical', mediaSubtype: '35MM Film — Negatives', quantity: 5, quantityToDigitize: 5 },
        { format: 'audio', dataType: 'both', mediaSubtype: 'Cassettes', quantity: 3, quantityToDigitize: 3 },
      ],
    },
    admin,
  );
  console.log(`   ${p1.code}  ${p2.code}`);

  type Line = { format: string; dataType: string; mediaSubtype: string; quantity: number; quantityToDigitize: number };
  const line = (format: string, dataType: string, mediaSubtype: string, quantity: number): Line => ({
    format,
    dataType,
    mediaSubtype,
    quantity,
    quantityToDigitize: quantity,
  });
  const standalone: { origin: string; owner: string; lines: Line[] }[] = [
    { origin: 'AHM', owner: 'Patel Family', lines: [line('photo', 'physical', '35MM Film — Slides', 4)] },
    { origin: 'MUM', owner: 'Desai Family', lines: [line('photo', 'physical', '120 Film — Negatives', 3)] },
    { origin: 'SAR', owner: 'Sarangpur Mandir Office', lines: [line('video', 'both', 'DVD', 3)] },
    { origin: 'OTH', owner: 'Mehta Family', lines: [line('audio', 'physical', 'Spools', 3)] },
    {
      origin: 'AHM',
      owner: 'Trivedi Family',
      lines: [line('photo', 'physical', '35MM Film — Album', 3), line('photo', 'physical', '35MM Film — Positives', 2)],
    },
    { origin: 'MUM', owner: 'Joshi Family', lines: [line('audio', 'digital', 'Digital', 3)] },
  ];
  const lotIds: string[] = [];
  for (const s of standalone) {
    const lot = await createIntake(
      { dateReceived: now, originSource: s.origin, owner: owner(s.owner), pointsOfContact: [], mediaLines: s.lines },
      admin,
    );
    lotIds.push(lot.id);
  }
  console.log(`   ${p1.lots.length + p2.lots.length} project lots + ${lotIds.length} standalone lots`);

  // A little life in the first Excel: the user's own code abbreviations, and some details.
  const first = p1.lots.find((l) => l.format === 'photo')!;
  await recodeSheet(first.id, { lineIndex: 0, abbr1: 'ALB', abbr2: 'surat' }, admin);
  const grid = await getItemsGrid(first.id, { userId: admin.userId, grants: admin.grants });
  const ids = grid.items.map((i) => i.id);
  await bulkUpdateItems(
    first.id,
    { itemIds: ids.slice(0, 3), set: { place: 'Surat', dateRange: '1998', nameOnCase: 'Mandir festival', senderCode: 'SM-01' } },
    admin,
  );
  await bulkUpdateItems(first.id, { itemIds: ids.slice(0, 2), set: { digital: true, redigital: false, discard: false } }, admin);

  console.log('\nDone. Sample loaded.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
