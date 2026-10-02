/**
 * Seeds test items for the decision-triage lot (LOT-2026-0022).
 *
 *   npx tsx scripts/seed-triage-lot.ts
 *
 * Adds two extra media lines (35MM Film — Negatives, 120 Film — Slides) so the
 * lot has THREE subtypes to group by, then creates LotItems for every line
 * using the same convention as intake (contiguous GG-II code run sliced per
 * line, 36 per group, each line's head run selected). Refuses to run twice.
 */

import { requireEnv } from './load-env';

import mongoose from 'mongoose';

import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';
import { generateItemCodes } from '../src/server/codes';

const LOT_ID = '6abca91a7c2b63270762f027';

const NEW_LINES = [
  {
    format: 'photo',
    dataType: 'physical',
    mediaSubtype: '35MM Film — Negatives',
    quantity: 60,
    quantityToDigitize: 60,
    quantityAlreadyDigitized: 0,
    notDigitizedReason: null,
    quantityRemarks: null,
  },
  {
    format: 'photo',
    dataType: 'physical',
    mediaSubtype: '120 Film — Slides',
    quantity: 40,
    quantityToDigitize: 25,
    quantityAlreadyDigitized: 0,
    notDigitizedReason: null,
    quantityRemarks: null,
  },
];

async function main() {
  await mongoose.connect(requireEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 8_000 });

  const lot = await ArchiveLot.findById(LOT_ID);
  if (!lot) {
    console.error('Lot not found.');
    process.exit(1);
  }

  const existing = await LotItem.countDocuments({ lot: lot._id });
  if (existing > 0) {
    console.error(`Lot already has ${existing} items — refusing to seed twice.`);
    process.exit(1);
  }

  for (const line of NEW_LINES) lot.mediaLines.push(line as never);
  const lines = lot.mediaLines.map((l) => ({
    quantity: l.quantity as number,
    quantityToDigitize: l.quantityToDigitize as number,
    notDigitizedReason: (l.notDigitizedReason ?? null) as string | null,
  }));
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const totalToDigitize = lines.reduce((s, l) => s + l.quantityToDigitize, 0);

  lot.quantity = totalQuantity;
  lot.quantityToDigitize = totalToDigitize;
  lot.set('digitization.expectedFileCount', totalToDigitize);
  await lot.save();

  const codes = generateItemCodes(lot.lotReference, totalQuantity);
  const docs: Record<string, unknown>[] = [];
  let offset = 0;
  lines.forEach((line, lineIndex) => {
    const slice = codes.slice(offset, offset + line.quantity);
    offset += line.quantity;
    slice.forEach((c, idx) => {
      const selected = idx < line.quantityToDigitize;
      docs.push({
        lot: lot._id,
        code: c.code,
        groupNo: c.groupNo,
        itemNo: c.itemNo,
        lineIndex,
        selectedForDigitization: selected,
        notDigitizedReason: selected ? null : line.notDigitizedReason,
      });
    });
  });
  await LotItem.insertMany(docs);

  console.log(
    `Seeded ${docs.length} items across ${lines.length} lines ` +
      `(qty ${totalQuantity}, to-digitize ${totalToDigitize}).`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
