/**
 * One-off for the new item-code rules:
 *
 *  1. Creates the admin list "Item code letters" (R, D) in the database if it is not there yet. An admin
 *     then adds more letters (M, P …) under Admin → Lists.
 *  2. Renames items that were cleared by Discard → "Yes and clear code" the old way (\`discard-1\`) to the
 *     new way: the first three parts of the code they had, then DISCARD_n, counted per prefix
 *     (\`NEG-MUM-R-DISCARD_1\`).
 *
 *   npm run db:migrate-item-codes
 */
import './load-env';

import { connectToDatabase } from '../src/lib/mongo';
import { buildDiscardCode, discardPrefixOf, parseItemCodeParts } from '../src/lib/item-code';
import { catalogList, catalogToSeedDoc } from '../src/lib/vocab-catalog';
import { LotItem } from '../src/models/LotItem';
import { ReferenceList } from '../src/models/ReferenceList';
import { nextSequence } from '../src/server/codes';

async function main() {
  await connectToDatabase();

  const seed = catalogList('itemCodeKind');
  if (!seed) throw new Error('No catalog list "itemCodeKind".');
  if (await ReferenceList.exists({ key: 'itemCodeKind' })) {
    // add any letter the catalog has gained since the list was created (e.g. M)
    const have = new Set(((await ReferenceList.findOne({ key: 'itemCodeKind' }).lean())?.items ?? []).map((i) => i.value));
    const missing = seed.items.filter((i) => !have.has(i.value));
    if (missing.length > 0) {
      const add = missing.map((i, n) => ({ ...i, usageCount: 0, sortOrder: have.size + n }));
      await ReferenceList.updateOne({ key: 'itemCodeKind' }, { $push: { items: { $each: add } } });
    }
    console.log(`code letters list: already there${missing.length ? `, added ${missing.map((m) => m.value).join(', ')}` : ''}.`);
  } else {
    await ReferenceList.create(catalogToSeedDoc(seed));
    console.log('code letters list: created (R, D).');
  }

  const old = await LotItem.find({ code: /^discard-\d+$/ }).select('code clearedCode').lean();
  old.sort((a, b) => Number(a.code.split('-')[1]) - Number(b.code.split('-')[1]));
  let renamed = 0;
  let skipped = 0;
  for (const it of old) {
    const parts = it.clearedCode ? parseItemCodeParts(it.clearedCode) : null;
    if (!parts) {
      skipped += 1;
      continue;
    }
    const code = buildDiscardCode(parts, await nextSequence(`discardCode:${discardPrefixOf(parts)}`));
    await LotItem.updateOne({ _id: it._id }, { $set: { code } });
    renamed += 1;
  }
  console.log(`discard codes: ${renamed} renamed${skipped ? `, ${skipped} skipped (no old code on record)` : ''}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
