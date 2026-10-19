/**
 * Brings the Prasadi dropdown lists already in the database (Guru, Category, Subcategory, Room) up
 * to date with the catalog in src/lib/vocab-catalog.ts — the requirements PDF filled in more
 * subcategories and a Furniture category after the lists were first created.
 *
 * It only ADDS what is missing, applies the few label renames below, and retires a value that moved
 * elsewhere. Nothing an admin added or edited is removed, and values are never deleted.
 *
 *   npm run db:sync-prasadi-lists
 */

// Must come first: it populates process.env before anything below reads it.
import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { catalogList, catalogToSeedDoc } from '../src/lib/vocab-catalog';
import { ReferenceList } from '../src/models/ReferenceList';

const KEYS = ['guru', 'prasadiCategory', 'prasadiSubcategory', 'prasadiRoom'];

/** value → the label the requirements PDF uses now. */
const RENAMES: Record<string, string> = {
  'personal_wear.haar': 'Haars',
  'medical_equipments.exercise': 'Exercise Machines',
};

/** Values that are now somewhere else (Furniture became its own category) — retired, not deleted. */
const RETIRE = ['bhojan.furniture'];

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'));
  try {
    for (const key of KEYS) {
      const seed = catalogList(key);
      if (!seed) throw new Error(`No catalog list "${key}".`);
      const doc = await ReferenceList.findOne({ key });
      if (!doc) {
        await ReferenceList.create(catalogToSeedDoc(seed));
        console.log(`${key}: created with ${seed.items.length} values.`);
        continue;
      }
      const have = new Set(doc.items.map((i: { value: string }) => i.value));
      let added = 0;
      let renamed = 0;
      let retired = 0;
      let order = Math.max(-1, ...doc.items.map((i: { sortOrder: number }) => i.sortOrder)) + 1;
      for (const item of seed.items) {
        if (!have.has(item.value)) {
          doc.items.push({ ...item, sortOrder: order++, usageCount: 0 });
          added += 1;
        }
      }
      for (const it of doc.items) {
        const want = RENAMES[it.value];
        if (want && it.label !== want) {
          it.label = want;
          renamed += 1;
        }
        if (RETIRE.includes(it.value) && it.active) {
          it.active = false;
          retired += 1;
        }
      }
      if (added + renamed + retired > 0) {
        doc.revision = (doc.revision ?? 1) + 1;
        await doc.save();
      }
      console.log(`${key}: ${added} added, ${renamed} renamed, ${retired} retired (${doc.items.length} values).`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
