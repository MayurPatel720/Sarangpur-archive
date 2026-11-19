/**
 * One-off for the machines changes:
 *
 *  1. Creates the admin list "Machine usage types" (VHS, UMT, Tape Recorder, Scanner …) if it is not in the
 *     database yet. An admin can then add more under Admin → Lists.
 *  2. Drops the removed Make and Version fields from every machine and the old bill number from repairs.
 *
 *   npm run db:migrate-machines
 */
import './load-env';

import { connectToDatabase } from '../src/lib/mongo';
import { catalogList, catalogToSeedDoc } from '../src/lib/vocab-catalog';
import { Machine } from '../src/models/Machine';
import { ReferenceList } from '../src/models/ReferenceList';

async function main() {
  await connectToDatabase();

  const seed = catalogList('machineUsageType');
  if (!seed) throw new Error('No catalog list "machineUsageType".');
  if (await ReferenceList.exists({ key: 'machineUsageType' })) {
    console.log('machine usage types: already there.');
  } else {
    await ReferenceList.create(catalogToSeedDoc(seed));
    console.log(`machine usage types: created (${seed.items.length} items).`);
  }

  const res = await Machine.collection.updateMany({}, { $unset: { make: '', version: '' } });
  await Machine.collection.updateMany({ 'repairs.billRef': { $exists: true } }, { $unset: { 'repairs.$[].billRef': '' } });
  console.log(`machines: dropped make / version on ${res.modifiedCount}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
