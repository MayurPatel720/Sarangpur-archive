/**
 * One-off for letters (the Documents format):
 *
 *  1. Adds the six letter stages (Scan & storage, Rewrite, Type, Recheck, Topics, Final edit) to the Stages list.
 *  2. Creates the admin list "Letter gurus" (YGJ, PSM, MSM) if it is not in the database yet.
 *  3. Moves every existing Documents lot that is still on the usual pipeline to the first letter stage.
 *
 *   npm run db:migrate-letters
 */
import './load-env';

import { connectToDatabase } from '../src/lib/mongo';
import { catalogList, catalogToSeedDoc } from '../src/lib/vocab-catalog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { ReferenceList } from '../src/models/ReferenceList';
import { DOC_STAGES } from '../src/lib/domain';

async function main() {
  await connectToDatabase();

  const stageSeed = catalogList('stage');
  if (!stageSeed) throw new Error('No catalog list "stage".');
  const list = await ReferenceList.findOne({ key: 'stage' }).lean();
  if (!list) throw new Error('The Stages list is missing — run `npm run seed` first.');
  const have = new Set(list.items.map((i) => i.value));
  const missing = stageSeed.items.filter((i) => !have.has(i.value) && (DOC_STAGES as readonly string[]).includes(i.value));
  if (missing.length > 0) {
    const add = missing.map((i, n) => ({ ...i, usageCount: 0, sortOrder: have.size + n }));
    await ReferenceList.updateOne({ key: 'stage' }, { $push: { items: { $each: add } } });
  }
  console.log(`stages: ${missing.length ? `added ${missing.map((m) => m.value).join(', ')}` : 'already there'}.`);

  const guruSeed = catalogList('letterGuru');
  if (!guruSeed) throw new Error('No catalog list "letterGuru".');
  if (await ReferenceList.exists({ key: 'letterGuru' })) {
    console.log('letter gurus: already there.');
  } else {
    await ReferenceList.create(catalogToSeedDoc(guruSeed));
    console.log('letter gurus: created (YGJ, PSM, MSM).');
  }

  const moved = await ArchiveLot.updateMany(
    { format: 'documents', stage: { $nin: [...DOC_STAGES] } },
    { $set: { stage: 'doc_scan', stageEnteredAt: new Date() } },
  );
  console.log(`documents lots moved to Scan & storage: ${moved.modifiedCount}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
