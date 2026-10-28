/**
 * Creates one sample Prasadi lot with five fully filled items, each with photos (1 to 5), so the
 * Prasadi sheet, the photo column, status, tags and checks can be tried by hand. Uses the real
 * intake, Excel import and photo upload code, so everything is stored exactly as the app stores it.
 *
 *   npm run db:seed-prasadi-lot
 *   npm run db:seed-prasadi-lot -- --again     (create another one)
 *
 * Needs the database and Cloudinary settings from .env.local. The pictures are small generated
 * coloured images (no copyrighted material) uploaded to the lot's own Cloudinary folder.
 */
import './load-env';

import { deflateSync } from 'node:zlib';
import type { MutationContext } from '../src/lib/api';
import { connectToDatabase } from '../src/lib/mongo';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { User } from '../src/models/User';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { getItemsGrid } from '../src/server/lots/item-grid';
import { importItems } from '../src/server/lots/item-import';
import { addItemImage } from '../src/server/lots/item-images';

const MARK = 'Sample Prasadi lot (db:seed-prasadi-lot)';

/* ------------------------------------------------------------ tiny PNG writer */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A w×h picture: a soft two-colour gradient with a framed centre block, from one hue. */
function pictureFor(hue: number, variant: number, w = 480, h = 360): Buffer {
  const hsl = (hh: number, s: number, l: number): [number, number, number] => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + hh / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const t = (x / w + y / h) / 2;
      const inFrame = x > w * 0.28 && x < w * 0.72 && y > h * 0.25 && y < h * 0.75;
      const [r, g, b] = inFrame ? hsl((hue + 28 + variant * 22) % 360, 0.55, 0.86) : hsl((hue + variant * 14) % 360, 0.5, 0.32 + t * 0.3);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------------------------------------------------------- the five items */

interface Sample {
  cells: Record<string, string>;
  photos: string[];
  hue: number;
}

const D = 'Details|';
const S = 'Digitalization & Storage|';
const SAMPLES: Sample[] = [
  {
    hue: 205,
    photos: ['Front', 'Back', 'Detail of the border', 'With its box', 'Label inside'],
    cells: {
      [`${D}Title`]: 'Gatariyu',
      [`${D}Category`]: 'Personal Wear',
      [`${D}Subcategory`]: 'Gatariya',
      [`${D}Guru`]: 'Pramukh Swami Maharaj',
      [`${D}Item details`]: '95th Birthday Gatariyu Set',
      [`${D}Quantity`]: '2',
      [`${D}Item history`]:
        'This item was worn by Pramukh Swami Maharaj during his 95th birthday. This gatariyu was gifted by Ramanbhai from Tajpur. Thereafter on Dec 8, 2016 it was given by Pujya Narayancharan Swami to P. Vedantpriya Swami for the archive.',
      [`${D}Occasion`]: '95th Birthday Celebration',
      [`${D}Area used by Guru`]: 'Yagnapurush Vadi Samaiyo Ground',
      [`${D}Date used by Guru`]: '07/12/2016',
      [`${D}Date received`]: '08/12/2016',
      [`${D}Received by`]: 'P. Vedantpriya Swami',
      [`${D}Room`]: 'Room 1 (Chiku Vadi)',
      [`${D}Cabinet`]: '1',
      [`${D}Shelf`]: '6',
      [`${D}Place`]: 'Sarangpur',
      [`${D}Condition`]: 'Good',
      [`${S}Sticker applied`]: 'Yes',
    },
  },
  {
    hue: 150,
    photos: ['Side view', 'Folded', 'Footrest', 'Brake'],
    cells: {
      [`${D}Title`]: 'Wheelchair',
      [`${D}Category`]: 'Medical Equipments',
      [`${D}Subcategory`]: 'Wheelchair',
      [`${D}Guru`]: 'Pramukh Swami Maharaj',
      [`${D}Item details`]: 'Foldable steel wheelchair used during the later years',
      [`${D}Quantity`]: '1',
      [`${D}Item history`]: 'Used by Pramukh Swami Maharaj for movement inside the mandir campus. Handed to the archive after the Samaiyo.',
      [`${D}Occasion`]: 'Daily use',
      [`${D}Area used by Guru`]: 'Mandir campus',
      [`${D}Date used by Guru`]: '15/03/2015',
      [`${D}Date received`]: '20/08/2016',
      [`${D}Received by`]: 'P. Vedantpriya Swami',
      [`${D}Room`]: 'Room 8 PSM Sarvasva',
      [`${D}Cabinet`]: '3',
      [`${D}Shelf`]: '2',
      [`${D}Place`]: 'Sarangpur',
      [`${D}Condition`]: 'Fair',
      [`${S}Sticker applied`]: 'Yes',
    },
  },
  {
    hue: 35,
    photos: ['Complete set', 'Plate', 'Bowl'],
    cells: {
      [`${D}Title`]: 'Thal Set',
      [`${D}Category`]: 'Bhojan',
      [`${D}Subcategory`]: 'Thal Set',
      [`${D}Guru`]: 'Yogiji Maharaj',
      [`${D}Item details`]: 'Brass thal with two katoris and a glass',
      [`${D}Quantity`]: '1',
      [`${D}Item history`]: 'Used by Yogiji Maharaj for his meals during the Gadhada visit. Preserved by the family of Shri Hasmukhbhai.',
      [`${D}Occasion`]: 'Gadhada visit',
      [`${D}Area used by Guru`]: 'Gadhada',
      [`${D}Date used by Guru`]: '12/05/1968',
      [`${D}Date received`]: '03/01/2019',
      [`${D}Received by`]: 'P. Gyanvatsal Swami',
      [`${D}Room`]: 'Room 3 (Dhotiya Chok)',
      [`${D}Cabinet`]: '2',
      [`${D}Shelf`]: '4',
      [`${D}Place`]: 'Gadhada',
      [`${D}Condition`]: 'Good',
      [`${S}Sticker applied`]: 'No',
    },
  },
  {
    hue: 285,
    photos: ['Arti set', 'Close-up'],
    cells: {
      [`${D}Title`]: 'Arti Set',
      [`${D}Category`]: 'Sabha Stage',
      [`${D}Subcategory`]: 'Puja Items (Arti, Puja Dish etc.)',
      [`${D}Guru`]: 'Mahant Swami Maharaj',
      [`${D}Item details`]: 'Silver arti with a matching puja dish',
      [`${D}Quantity`]: '3',
      [`${D}Item history`]: 'Used on the sabha stage for the arti of Mahant Swami Maharaj during the annual Patotsav.',
      [`${D}Occasion`]: 'Patotsav',
      [`${D}Area used by Guru`]: 'Murti Mandap',
      [`${D}Date used by Guru`]: '24/02/2023',
      [`${D}Date received`]: '10/03/2023',
      [`${D}Received by`]: 'P. Vedantpriya Swami',
      [`${D}Room`]: 'Room 10 Murti Mandap',
      [`${D}Cabinet`]: '4',
      [`${D}Shelf`]: '1',
      [`${D}Place`]: 'Sarangpur',
      [`${D}Condition`]: 'Good',
      [`${S}Sticker applied`]: 'Yes',
    },
  },
  {
    hue: 350,
    photos: ['Chair'],
    cells: {
      [`${D}Title`]: 'Walking Chair',
      [`${D}Category`]: 'Furniture',
      [`${D}Subcategory`]: 'Walking Chair',
      [`${D}Guru`]: 'Shastriji Maharaj',
      [`${D}Item details`]: 'Wooden walking chair with a cane seat',
      [`${D}Quantity`]: '1',
      [`${D}Item history`]: 'Kept from the early years of the Sanstha. The cane seat is worn and one leg was repaired earlier.',
      [`${D}Occasion`]: 'Daily use',
      [`${D}Area used by Guru`]: 'Sarangpur mandir',
      [`${D}Date used by Guru`]: '01/01/1930',
      [`${D}Date received`]: '18/06/2012',
      [`${D}Received by`]: 'P. Gyanvatsal Swami',
      [`${D}Room`]: 'Room 5 Shastriji Maharaj Ordo',
      [`${D}Cabinet`]: '1',
      [`${D}Shelf`]: '1',
      [`${D}Place`]: 'Sarangpur',
      [`${D}Condition`]: 'Damaged',
      [`${D}Details remark`]: 'Needs careful handling: the seat is fragile.',
      [`${S}Sticker applied`]: 'No',
    },
  },
];

async function main() {
  await connectToDatabase();
  const again = process.argv.includes('--again');
  if (!again && (await ArchiveLot.exists({ senderRemarks: MARK }))) {
    console.log('A sample Prasadi lot already exists. Run with -- --again to create another.');
    process.exit(0);
  }

  const user = (await User.findOne({ username: 'admin' }).select('name').lean()) ?? (await User.findOne({}).select('name').lean());
  if (!user) throw new Error('No users found. Run `npm run seed` first.');
  const ctx: MutationContext = { userId: String(user._id), userName: user.name as string, roleKey: 'admin', grants: [...ALL_PERMISSIONS] };
  const sample = await ArchiveLot.findOne({}).select('originSource').lean();
  if (!sample?.originSource) throw new Error('No existing lot to copy an origin from. Run `npm run seed` first.');

  console.log('creating the lot…');
  const lot = await createIntake(
    {
      dateReceived: new Date().toISOString(),
      originSource: sample.originSource,
      owner: { name: 'Ramanbhai Patel', phone: '+91 98250 12345', email: 'ramanbhai.patel@example.org', address: 'Tajpur, Gujarat' },
      pointsOfContact: [{ name: 'P. Vedantpriya Swami', phone: '+91 98250 54321' }],
      referencePeople: [{ name: 'Pujya Narayancharan Swami', phone: '+91 98250 00111' }],
      facilitator: { name: 'Hasmukhbhai Shah', phone: '+91 98250 77889' },
      mediaLines: [{ format: 'prasadi', dataType: 'physical', mediaSubtype: 'Prasadi', quantity: SAMPLES.length }],
      conditionNotes: 'Items are in good order; the walking chair seat is worn.',
      reasonForSending: 'Prasadi items given to the archive for safe keeping and documentation.',
      senderRemarks: MARK,
      photoDate: 'Dec 2016 to Mar 2023',
      photoLocation: 'Sarangpur and Gadhada',
      photoEvent: 'Birthday celebration, Patotsav, daily use',
      assignments: [{ format: 'prasadi', assigneeId: ctx.userId }],
    },
    ctx,
  );
  console.log(`  ${lot.lotReference} (${lot.itemsCreated} items)`);

  const grid = await getItemsGrid(lot.id, { userId: ctx.userId, grants: ctx.grants });
  const items = grid.items.slice(0, SAMPLES.length);

  console.log('filling in the details…');
  const rows = items.map((it, i) => ({ code: it.code, cells: SAMPLES[i]!.cells }));
  const preview = await importItems(lot.id, { apply: false, rows }, ctx);
  if (preview.errors.length > 0 || preview.ignoredColumns.length > 0) {
    console.error('The import has problems:', JSON.stringify({ errors: preview.errors, ignoredColumns: preview.ignoredColumns }, null, 2));
    process.exit(1);
  }
  const applied = await importItems(lot.id, { apply: true, rows }, ctx);
  console.log(`  ${applied.willChange} item(s) updated`);

  console.log('adding photos…');
  for (const [i, it] of items.entries()) {
    const s = SAMPLES[i]!;
    for (const [n, caption] of s.photos.entries()) {
      const bytes = pictureFor(s.hue, n);
      const file = new File([new Uint8Array(bytes)], `${s.cells[`${D}Title`]!.toLowerCase().replace(/\W+/g, '-')}-${n + 1}.png`, { type: 'image/png' });
      await addItemImage(lot.id, it.id, { file, caption, format: 'prasadi', width: 480, height: 360 }, ctx);
    }
    console.log(`  ${s.cells[`${D}Title`]}: ${s.photos.length} photo(s)`);
  }

  console.log(`\nDone. Open the lot: /register/${lot.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
