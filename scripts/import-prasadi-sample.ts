/**
 * Imports the PrasadiApp sample (MariaDB dump + images folder) as ONE Prasadi lot, using the app's own intake,
 * Excel-import and photo-upload code (so audit trail, statuses and photo counters are exactly what the app writes).
 *
 *   npm run db:import-prasadi-sample -- "<folder>"            dry run: shows the mapping, writes nothing
 *   npm run db:import-prasadi-sample -- "<folder>" --apply    creates the lot, fills the items, uploads the photos
 *
 * <folder> holds prasadiapp_data-dev-sample.sql and an images/ folder named {item_id}_{image_id}_thumb.{ext}.
 * Needs the database and Cloudinary settings from .env.local (the same as db:seed-prasadi-lot).
 *
 * Mapping (old item -> Prasadi sheet): item_name -> Title, item_description -> Item details, item_for -> Guru,
 * start day/month/year -> Date used by Guru, item_use_place -> Area used by Guru, room / cupboard / cell -> Room /
 * Cabinet / Shelf, category -> Category + Subcategory, item_date_added -> Date received. The old code and the
 * "used by / for Swami" note go into Item history. Values the app has no match for are left blank and listed.
 */
import './load-env';

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { MutationContext } from '../src/lib/api';
import { connectToDatabase } from '../src/lib/mongo';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { User } from '../src/models/User';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { createIntake } from '../src/server/lots/mutations';
import { getItemsGrid } from '../src/server/lots/item-grid';
import { importItems } from '../src/server/lots/item-import';
import { addItemImage } from '../src/server/lots/item-images';

const MARK = 'PrasadiApp sample import (db:import-prasadi-sample)';
const D = 'Details|';

/* ------------------------------------------------------------ SQL INSERT reader */

type Row = Record<string, string | number | null>;

/** Reads every row of `INSERT INTO `table` (cols) VALUES (...), (...);` — handles quotes, '' and \' inside text. */
function readInserts(sql: string, table: string): Row[] {
  const rows: Row[] = [];
  const head = new RegExp('INSERT INTO `' + table + '` \\(([^)]*)\\) VALUES', 'g');
  let m: RegExpExecArray | null;
  while ((m = head.exec(sql))) {
    const cols = m[1]!.split(',').map((c) => c.trim().replace(/`/g, ''));
    let i = head.lastIndex;
    let values: (string | number | null)[] | null = null;
    let cur = '';
    let inStr = false;
    let wasStr = false;
    const push = () => {
      const t = cur.trim();
      values!.push(wasStr ? cur : t.toUpperCase() === 'NULL' ? null : t === '' ? null : Number.isNaN(Number(t)) ? t : Number(t));
      cur = '';
      wasStr = false;
    };
    for (; i < sql.length; i += 1) {
      const ch = sql[i]!;
      if (inStr) {
        if (ch === '\\') {
          cur += sql[++i] ?? '';
        } else if (ch === "'") {
          if (sql[i + 1] === "'") {
            cur += "'";
            i += 1;
          } else inStr = false;
        } else cur += ch;
        continue;
      }
      if (ch === "'") {
        inStr = true;
        wasStr = true;
      } else if (ch === '(' && !values) {
        values = [];
        cur = '';
      } else if (ch === ',' && values) push();
      else if (ch === ')' && values) {
        push();
        rows.push(Object.fromEntries(cols.map((c, k) => [c, values![k] ?? null])));
        values = null;
      } else if (ch === ';' && !values) break;
      else if (values) cur += ch;
    }
  }
  return rows;
}

/* ----------------------------------------------------------------------- mapping */

const pad2 = (n: number) => String(n).padStart(2, '0');
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** "Wear" is the old parent of Pagh / Dhotiya-Gatariya / Haar etc.; the app has its own category list. */
function mapCategory(item: Row, names: string[]): { category: string; subcategory: string } {
  const name = str(item.item_name).toLowerCase();
  if (names.includes('Sarangpur 100')) return { category: 'Utsav', subcategory: 'Sarangpur Shatabdi' };
  if (names.includes('Wear')) {
    if (name.includes(' har') || name.startsWith('har')) return { category: 'Personal Wear', subcategory: 'Haars' };
    if (name.includes('pagh')) return { category: 'Personal Wear', subcategory: 'Pagh' };
    if (name.includes('gatariy')) return { category: 'Personal Wear', subcategory: 'Gatariya' };
    if (name.includes('dhoti')) return { category: 'Personal Wear', subcategory: 'Dhotyia' };
    return { category: 'Personal Wear', subcategory: '' };
  }
  return { category: '', subcategory: '' }; // Misc. / Utsav (no sub-list match): left for the team to choose
}

const GURUS = ['Shastriji Maharaj', 'Yogiji Maharaj', 'Pramukh Swami Maharaj', 'Mahant Swami Maharaj'];

function roomOf(raw: string): string {
  const n = /^0*(\d{1,2})$/.exec(raw)?.[1];
  const names: Record<string, string> = {
    '1': 'Room 1 (Chiku Vadi)', '2': 'Room 2 (MSM Sarvasva)', '3': 'Room 3 (Dhotiya Chok)', '4': 'Room 4 Rang Mandap',
    '5': 'Room 5 Shastriji Maharaj Ordo', '6': 'Room 6 Yogi Maharaj Ordo', '7': 'Room 7 PSM Ordo', '8': 'Room 8 PSM Sarvasva',
    '9': 'Room 9 PSM Gali', '10': 'Room 10 Murti Mandap', '11': 'Room 11 Pramukh Mandiram',
  };
  return n ? (names[n] ?? '') : '';
}

function usedOn(item: Row): string {
  const d = Number(item.item_start_day), m = Number(item.item_start_month), y = Number(item.item_start_year);
  if (y && m && d) return `${pad2(d)}/${pad2(m)}/${y}`;
  if (y && m) return `${pad2(m)}/${y}`;
  return y ? String(y) : '';
}

/**
 * Cloudinary signs every upload with the machine clock and refuses requests more than an hour off. If this PC clock is
 * wrong, sign with the real time (read from the internet) instead. Only the SDK timestamp is changed; nothing else.
 */
async function alignClockWithInternet() {
  try {
    const header = (await fetch('https://api.cloudinary.com/v1_1/ping')).headers.get('date');
    const offset = header ? new Date(header).getTime() - Date.now() : 0;
    if (Math.abs(offset) < 5 * 60_000) return;
    const { v2 } = await import('cloudinary');
    (v2.utils as unknown as { timestamp: () => number }).timestamp = () => Math.floor((Date.now() + offset) / 1000);
    console.log(`note: this PC clock is ${Math.round(offset / 60000)} minutes off; signing uploads with internet time`);
  } catch {
    /* offline: keep the PC clock */
  }
}

/* -------------------------------------------------------------------------- main */

async function main() {
  const folder = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!folder || folder.startsWith('--')) {
    console.error('Usage: npm run db:import-prasadi-sample -- "<folder>" [--apply]');
    process.exit(1);
  }
  const sql = readFileSync(join(folder, 'prasadiapp_data-dev-sample.sql'), 'utf8');
  const items = readInserts(sql, 'item').sort((a, b) => Number(a.item_id) - Number(b.item_id));
  const cats = new Map(readInserts(sql, 'category').map((c) => [Number(c.cat_id), str(c.cat_name)]));
  const links = readInserts(sql, 'category2item');
  const images = readInserts(sql, 'item_images');
  const files = new Set(readdirSync(join(folder, 'images')));
  console.log(`read ${items.length} items, ${cats.size} categories, ${images.length} image rows, ${files.size} files\n`);

  const unmapped: string[] = [];
  const plan = items.map((it) => {
    const id = Number(it.item_id);
    const catNames = links.filter((l) => Number(l.item_id) === id).map((l) => cats.get(Number(l.cat_id)) ?? '');
    const { category, subcategory } = mapCategory(it, catNames);
    const guru = GURUS.includes(str(it.item_for)) ? str(it.item_for) : '';
    const room = roomOf(str(it.item_sl_room));
    const label = `${id} ${str(it.item_name)}`;
    if (!guru) unmapped.push(`${label}: Guru "${str(it.item_for)}" is not in the app's Guru list (left blank)`);
    if (!category) unmapped.push(`${label}: category ${catNames.join(' + ') || 'none'} has no match (left blank)`);
    if (str(it.item_sl_room) && !room) unmapped.push(`${label}: room "${str(it.item_sl_room)}" has no match (left blank)`);
    const added = str(it.item_date_added).slice(0, 10).split('-');
    const history = [str(it.item_used) ? `${str(it.item_used)}.` : '', str(it.item_remark), `Imported from PrasadiApp (old code ${str(it.item_code)}).`].filter(Boolean).join(' ');
    const cells: Record<string, string> = {
      [`${D}Title`]: str(it.item_name),
      [`${D}Item details`]: str(it.item_description),
      [`${D}Quantity`]: '1',
      [`${D}Item history`]: history,
      ...(category ? { [`${D}Category`]: category } : {}),
      ...(subcategory ? { [`${D}Subcategory`]: subcategory } : {}),
      ...(guru ? { [`${D}Guru`]: guru } : {}),
      ...(usedOn(it) ? { [`${D}Date used by Guru`]: usedOn(it) } : {}),
      ...(str(it.item_use_place) ? { [`${D}Area used by Guru`]: str(it.item_use_place) } : {}),
      ...(room ? { [`${D}Room`]: room } : {}),
      ...(str(it.item_sl_cupboard) ? { [`${D}Cabinet`]: str(it.item_sl_cupboard) } : {}),
      ...(str(it.item_sl_cell) ? { [`${D}Shelf`]: str(it.item_sl_cell) } : {}),
      ...(added.length === 3 ? { [`${D}Date received`]: `${added[2]}/${added[1]}/${added[0]}` } : {}),
    };
    // Photos: the thumb is the cover (first), the gallery ones follow.
    const photos = images
      .filter((im) => Number(im.im_item_id) === id)
      .sort((a, b) => (a.im_type === 'thumb' ? -1 : 1) - (b.im_type === 'thumb' ? -1 : 1))
      .map((im) => {
        // README says {item}_{image}_thumb.ext, but some files are named {image}_{item}_thumb.ext: take whichever exists.
        const ext = `${str(im.im_extension).startsWith('.') ? '' : '.'}${str(im.im_extension)}`;
        const names = [`${id}_${im.im_id}_thumb${ext}`, `${im.im_id}_${id}_thumb${ext}`];
        return { file: names.find((n) => files.has(n)) ?? names[0]!, kind: str(im.im_type) };
      });
    for (const p of photos) if (!files.has(p.file)) unmapped.push(`${label}: photo file ${p.file} is not in the images folder`);
    return { id, label, cells, photos: photos.filter((p) => files.has(p.file)) };
  });

  for (const p of plan) {
    console.log(`#${p.label}\n  ${Object.entries(p.cells).map(([k, v]) => `${k.replace(D, '')}=${v.length > 38 ? `${v.slice(0, 38)}…` : v}`).join(' | ')}\n  photos: ${p.photos.map((x) => x.file).join(', ') || 'none'}`);
  }
  console.log(`\nNeeds attention (${unmapped.length}):\n${unmapped.map((u) => `  - ${u}`).join('\n') || '  none'}`);
  if (!apply) {
    console.log('\nDry run only — nothing was written. Add --apply to import.');
    process.exit(0);
  }

  // Only Cloudinary signs uploads with the clock; the own-server (disk) option needs no internet.
  if (process.env.STORAGE_DRIVER !== 'disk') await alignClockWithInternet();
  await connectToDatabase();
  const user =(await User.findOne({ username: 'admin' }).select('name').lean()) ?? (await User.findOne({}).select('name').lean());
  if (!user) throw new Error('No users found. Run `npm run seed` first.');
  const ctx: MutationContext = { userId: String(user._id), userName: user.name as string, roleKey: 'admin', grants: [...ALL_PERMISSIONS] };

  const existing = await ArchiveLot.findOne({ senderRemarks: MARK }).select('_id lotReference').lean();
  if (existing) {
    // Already imported. With --photos-only, add the photos still missing (matched by the old code kept in Item history).
    if (!process.argv.includes('--photos-only')) {
      console.log(`\nThis sample was already imported as ${existing.lotReference}. Nothing done. (Add --photos-only to upload missing photos.)`);
      process.exit(0);
    }
    const lotId = String(existing._id);
    const have = (await getItemsGrid(lotId, { userId: ctx.userId, grants: ctx.grants })).items;
    for (const p of plan) {
      const code = /old code (\w+)\)/.exec(p.cells[`${D}Item history`] ?? '')?.[1];
      const it = have.find((h) => code && String((h.attrs as Record<string, unknown>).history ?? '').includes(`old code ${code})`));
      if (!it || it.imageCount > 0 || p.photos.length === 0) continue;
      for (const ph of p.photos) {
        const file = new File([new Uint8Array(readFileSync(join(folder, 'images', ph.file)))], basename(ph.file), { type: 'image/jpeg' });
        await addItemImage(lotId, it.id, { file, caption: ph.kind === 'thumb' ? 'Cover' : 'Gallery', format: 'prasadi', width: 800, height: 600 }, ctx);
      }
      console.log(`  ${p.label}: ${p.photos.length} photo(s)`);
    }
    console.log(`\nDone. Open the lot: /register/${lotId}`);
    process.exit(0);
  }
  const origin = await ArchiveLot.findOne({}).select('originSource').lean();
  if (!origin?.originSource) throw new Error('No existing lot to copy an origin from. Run `npm run seed` first.');

  console.log('\ncreating the lot…');
  const lot = await createIntake(
    {
      dateReceived: new Date().toISOString(),
      originSource: origin.originSource,
      owner: { name: 'PrasadiApp (sample import)' },
      locationReceiver: { name: 'Archive Receiver' },
      mediaLines: [{ format: 'prasadi', dataType: 'physical', mediaSubtype: 'Prasadi', quantity: plan.length }],
      reasonForSending: 'Items imported from the old PrasadiApp database (sample).',
      senderRemarks: MARK,
      assignments: [{ format: 'prasadi', assigneeId: ctx.userId }],
    },
    ctx,
  );
  console.log(`  ${lot.lotReference} (${lot.itemsCreated} items)`);

  const grid = await getItemsGrid(lot.id, { userId: ctx.userId, grants: ctx.grants });
  const created = grid.items.slice(0, plan.length);
  const rows = created.map((it, i) => ({ code: it.code, cells: plan[i]!.cells }));
  const preview = await importItems(lot.id, { apply: false, rows }, ctx);
  if (preview.errors.length > 0 || preview.ignoredColumns.length > 0) {
    console.error('The import has problems:', JSON.stringify({ errors: preview.errors, ignoredColumns: preview.ignoredColumns }, null, 2));
    process.exit(1);
  }
  const applied = await importItems(lot.id, { apply: true, rows }, ctx);
  console.log(`  ${applied.willChange} item(s) filled in`);

  console.log('adding photos…');
  for (const [i, it] of created.entries()) {
    for (const p of plan[i]!.photos) {
      const bytes = readFileSync(join(folder, 'images', p.file));
      const file = new File([new Uint8Array(bytes)], basename(p.file), { type: 'image/jpeg' });
      await addItemImage(lot.id, it.id, { file, caption: p.kind === 'thumb' ? 'Cover' : 'Gallery', format: 'prasadi', width: 800, height: 600 }, ctx);
    }
    console.log(`  ${plan[i]!.label}: ${plan[i]!.photos.length} photo(s)`);
  }
  console.log(`\nDone. Open the lot: /register/${lot.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
