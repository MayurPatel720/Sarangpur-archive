/**
 * Generates the demo snapshot of the Sarangpur archive as plain documents:
 * 10 projects → 35 child lots (one per format) → every lot's items, named the way
 * the real logging spreadsheets name them ("Akshardham Gandhinagar Mahelav
 * 23-12-2009 Tape #1", "[1080P] Format=4:2:2, 25PPS, Location= …").
 *
 * Kept separate from the seeding itself so the same data can be (a) inserted into
 * MongoDB by scripts/seed.ts and (b) validated against the Mongoose schemas and run
 * through the dashboard pipelines by scripts/verify-seed.ts, with no database.
 *
 * Everything derives from a fixed PRNG seed, so the numbers are reproducible. Dates are
 * relative to `now`, so the SLA breaches stay meaningful however long after writing
 * this it runs. Contact details are obviously fake.
 */

import { Types } from 'mongoose';
import type { OriginSource, Role, Stage } from '../src/lib/domain';
import { catalogList } from '../src/lib/vocab-catalog';

const DAY = 86_400_000;

/* ------------------------------------------------------------------- random */

/** mulberry32 — small, fast, deterministic. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/* --------------------------------------------------------------------- team */

const TEAM: { name: string; initials: string; username: string; role: Role }[] = [
  { name: 'M. Patel', initials: 'MP', username: 'm.patel', role: 'volunteer' },
  { name: 'H. Patel', initials: 'HP', username: 'h.patel', role: 'volunteer' },
  { name: 'A. Mehta', initials: 'AM', username: 'a.mehta', role: 'volunteer' },
  { name: 'D. Trivedi', initials: 'DT', username: 'd.trivedi', role: 'reviewer' },
  { name: 'R. Joshi', initials: 'RJ', username: 'r.joshi', role: 'reviewer' },
  { name: 'Lead Pujya Sant', initials: 'LP', username: 'lead.reviewer', role: 'lead_reviewer' },
  { name: 'S. Dave', initials: 'SD', username: 's.dave', role: 'admin' },
];

/* ----------------------------------------------------------------- the plan */

type Format = 'photo' | 'video' | 'audio' | 'documents' | 'prasadi';

interface LotSpec {
  format: Format;
  /** One or more media rows of this format: [sub-type value, quantity]. */
  lines: [string, number][];
  stage: Stage;
  /** Days since the lot entered its current stage. */
  days: number;
  /** Index into the volunteers, or null = unassigned (admin only). */
  assignee: number | null;
  /** Archived lots only: how many items are returned / discarded item by item. */
  splitReturn?: number;
  splitDiscard?: number;
  /** Return requested on the whole lot, already past due. */
  returnOverdue?: boolean;
}

interface ProjectSpec {
  code: string;
  name: string;
  description: string;
  owner: string;
  origin: OriginSource | null;
  /** Days since the material was received; null = not recorded yet. */
  receivedDaysAgo: number | null;
  coordinator: 'reviewer' | 'lead';
  /** Naming context for the items. */
  ctx: { place: string; venue: string; event: string; year: number; month: string; day: number };
  lots: LotSpec[];
}

const L = (
  format: Format,
  lines: [string, number][],
  stage: Stage,
  days: number,
  assignee: number | null,
  extra: Partial<LotSpec> = {},
): LotSpec => ({ format, lines, stage, days, assignee, ...extra });

const PROJECTS: ProjectSpec[] = [
  {
    code: 'AKS-2009',
    name: 'Akshardham Gandhinagar — Mahelav & Fountain shoots',
    description: 'Multimedia logging tapes from the Gandhinagar Akshardham Mahelav and musical fountain shoots.',
    owner: 'Akshardham Gandhinagar — Multimedia dept',
    origin: 'AHM',
    receivedDaysAgo: 140,
    coordinator: 'reviewer',
    ctx: { place: 'Akshardham Gandhinagar', venue: 'Mahelav Shri Swaminarayan Mandir', event: 'Mahelav', year: 2009, month: '12', day: 23 },
    lots: [
      L('video', [['Mini DVs', 9]], 'storage', 12, 0),
      L('audio', [['Cassettes', 6]], 'storage', 20, 1),
      L('photo', [['35MM Film — Negatives', 24]], 'mls_tag', 3, 2, { splitReturn: 2 }),
      L('documents', [['Letters', 8]], 'scanning', 4, 0),
    ],
  },
  {
    code: 'SAR-1998',
    name: 'Sarangpur — Pushpadolotsav 1998',
    description: 'Videos, photos and papers from the 1998 Pushpadolotsav at Sarangpur.',
    owner: 'Sarangpur Mandir office',
    origin: 'SAR',
    receivedDaysAgo: 120,
    coordinator: 'lead',
    ctx: { place: 'Sarangpur', venue: 'Sarangpur Mandir', event: 'Pushpadolotsav', year: 1998, month: '03', day: 5 },
    lots: [
      L('video', [['VHS', 7]], 'storage', 9, 1),
      L('photo', [['Print — Print', 20], ['Print — Album', 10]], 'scanning', 5, 2),
      L('documents', [['Invitation cards', 10]], 'metadata', 2, 1),
      L('prasadi', [['Prasadi', 6]], 'decision', 1, 0),
    ],
  },
  {
    code: 'DEL-2003',
    name: 'Delhi Mandir — Pratishtha Utsav',
    description: 'Delhi Mandir Pratishtha Utsav recordings and keepsakes.',
    owner: 'Delhi Mandir office',
    origin: 'OTH',
    receivedDaysAgo: 150,
    coordinator: 'reviewer',
    ctx: { place: 'New Delhi', venue: 'Delhi Mandir', event: 'Mandir Pratishtha Utsav', year: 2003, month: '02', day: 14 },
    lots: [
      L('video', [['DV-CAM', 6]], 'mls_tag', 4, 0, { splitDiscard: 1 }),
      L('audio', [['Spools', 5]], 'storage', 25, 1),
      L('photo', [['35MM Film — Slides', 18]], 'storage', 70, 2),
      L('documents', [['Receipt books', 7]], 'returned', 20, 0),
    ],
  },
  {
    code: 'NBO-1999',
    name: 'Nairobi — Satsang Sabha 1999',
    description: 'Satsang sabha tapes and photographs from the Nairobi mandir.',
    owner: 'Nairobi Mandir committee',
    origin: 'OTH',
    receivedDaysAgo: 95,
    coordinator: 'reviewer',
    ctx: { place: 'Nairobi', venue: 'Nairobi Mandir', event: 'Satsang Sabha', year: 1999, month: '07', day: 11 },
    lots: [
      L('video', [['VHS', 8]], 'scanning', 6, 2),
      L('audio', [['Cassettes', 10]], 'metadata', 2, 2),
      L('photo', [['35MM Film — Negatives', 30]], 'decision', 9, 1),
      L('documents', [['Newspaper clippings', 8]], 'intake', 0, 2),
    ],
  },
  {
    code: 'KOL-2003',
    name: 'Kolkata — Janma Jayanti Natak',
    description: 'Janma Jayanti natak recordings and related prints from Kolkata.',
    owner: 'Kolkata Satsang Mandal',
    origin: 'MUM',
    receivedDaysAgo: 110,
    coordinator: 'lead',
    ctx: { place: 'Kolkata', venue: 'Kolkata Mandir', event: 'Janma Jayanti Natak', year: 2003, month: '12', day: 7 },
    lots: [
      L('video', [['Mini DVs', 7]], 'storage', 15, 0),
      L('audio', [['Cassettes', 8]], 'scanning', 3, 1),
      L('photo', [['Print — Print', 16]], 'decision', 2, 2),
      L('prasadi', [['Prasadi', 5]], 'returned', 18, 1),
    ],
  },
  {
    code: 'LON-1985',
    name: 'London — Suvarna Tula 1985',
    description: 'Suvarna Tula programme, London, 1985.',
    owner: 'London Mandir committee',
    origin: 'OTH',
    receivedDaysAgo: 170,
    coordinator: 'reviewer',
    ctx: { place: 'London', venue: 'London Mandir', event: 'Suvarna Tula', year: 1985, month: '07', day: 20 },
    lots: [
      L('video', [['U-matic', 5]], 'mls_tag', 2, 0),
      L('photo', [['35MM Film — Slides', 22]], 'storage', 80, 1),
      L('documents', [['Letters', 6]], 'metadata', 3, 0, { returnOverdue: true }),
    ],
  },
  {
    code: 'BHD-2004',
    name: 'Bhadra & Amdavad — Bal Suvarna Mahotsav',
    description: 'Bhadra Khatvidhi and Bal Suvarna Mahotsav show, Amdavad.',
    owner: 'Bal Mandal archive',
    origin: 'AHM',
    receivedDaysAgo: 25,
    coordinator: 'reviewer',
    ctx: { place: 'Bhadra / Amdavad', venue: 'Bhadra Mandir', event: 'Bal Suvarna Mahotsav', year: 2004, month: '02', day: 9 },
    lots: [
      L('video', [['Mini DVs', 8]], 'scanning', 13, 1),
      L('audio', [['Cassettes', 7]], 'decision', 6, 0),
      L('photo', [['120 Film — Negatives', 14]], 'intake', 0, 2),
    ],
  },
  {
    code: 'GND-2002',
    name: 'Gondal — Sharad Purnima 2002',
    description: 'Sharad Purnima celebrations at Gondal, 2002.',
    owner: 'Gondal Mandir office',
    origin: 'OTH',
    receivedDaysAgo: 100,
    coordinator: 'lead',
    ctx: { place: 'Gondal', venue: 'Gondal Mandir', event: 'Sharad Purnima', year: 2002, month: '10', day: 21 },
    lots: [
      L('audio', [['Cassettes', 9]], 'storage', 44, 2),
      L('photo', [['Print — Album', 15]], 'decision', 1, 1),
      L('documents', [['Sabha registers', 9]], 'intake', 0, 0),
    ],
  },
  {
    code: 'CHI-2004',
    name: 'Chicago — Mahotsav 2004',
    description: 'Chicago Mahotsav recordings; one lot is not suitable for the archive.',
    owner: 'Chicago Mandir committee',
    origin: 'OTH',
    receivedDaysAgo: 28,
    coordinator: 'reviewer',
    ctx: { place: 'Chicago', venue: 'Chicago Mandir', event: 'Mahotsav', year: 2004, month: '09', day: 8 },
    lots: [
      L('video', [['VHS', 6]], 'metadata', 2, 0, { splitReturn: 1 }),
      L('audio', [['Cassettes', 5]], 'intake', 0, 1),
      L('photo', [['Print — Print', 12]], 'discarded', 25, 2),
    ],
  },
  {
    code: 'MUM-2001',
    name: 'Mumbai — Dham Darshan 2001',
    description: 'Just received — owner, origin and date still to be recorded by the assignees.',
    owner: 'Mumbai Mandir office',
    origin: null,
    receivedDaysAgo: null,
    coordinator: 'lead',
    ctx: { place: 'Mumbai', venue: 'Mumbai Mandir', event: 'Dham Darshan', year: 2001, month: '12', day: 3 },
    lots: [
      L('video', [['BetaCAM', 5]], 'intake', 0, 0),
      L('audio', [['Cassettes', 6]], 'intake', 0, null),
      L('documents', [['Letters', 6]], 'intake', 0, 1),
    ],
  },
];

/* ----------------------------------------------------------- item naming */

const OPERATORS = ['Dharmesh', 'Yuvraj', 'Jignesh', 'Hardik'];
const DOC_TYPES: Record<string, string[]> = {
  Letters: ['Patra (letter)', 'Letter to the mandir', 'Telegram'],
  'Invitation cards': ['Invitation card', 'Kankotri', 'Programme sheet'],
  'Receipt books': ['Donation receipt book', 'Seva receipt'],
  'Newspaper clippings': ['Newspaper clipping', 'Press note'],
  'Sabha registers': ['Sabha attendance register', 'Sabha minutes'],
};
const PRASADI_TYPES = ['Prasadi mala', 'Prasadi shawl (khes)', 'Prasadi photo frame', 'Prasadi vessel', 'Prasadi rudraksh'];
const SOURCES = ['chaggan_duplicate_box', 'usa_cap', 'usa_cap_damage_box', 'sarang_cap'];

interface ItemDraft {
  name: string;
  nameOnCase: string | null;
  description: string | null;
  month: string;
  people: string | null;
  physicalSource: string | null;
  itemCondition: string;
  remarks: string | null;
}

function draftItem(
  fmt: Format,
  subtype: string,
  n: number,
  ctx: ProjectSpec['ctx'],
  rng: () => number,
): ItemDraft {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng() * a.length)]!;
  const shootDay = ctx.day + Math.floor((n - 1) / 3);
  const dmy = `${pad2(shootDay)}-${ctx.month}-${ctx.year}`;
  const tapeNo = ((n - 1) % 3) + 1;
  const bad = rng() < 0.08;
  const base: ItemDraft = {
    name: '',
    nameOnCase: null,
    description: null,
    month: rng() < 0.1 ? `${ctx.month}/${pad2(Math.min(12, Number(ctx.month) + 1))}` : ctx.month,
    people: rng() < 0.3 ? pick(['Pu. Mahant Swami, Brahmavihari Swami', 'Sadhus and haribhaktos', 'Bal Mandal volunteers']) : null,
    physicalSource: pick(SOURCES),
    itemCondition: bad ? 'bad_tape' : rng() < 0.15 ? 'fair' : 'good',
    remarks: bad ? 'Bad Tape' : null,
  };

  if (fmt === 'video') {
    base.name = `${ctx.place} ${ctx.event} ${dmy} Tape #${tapeNo}`;
    base.nameOnCase = `${ctx.event} ${n}`;
    const d = n % 5;
    base.description =
      d === 0
        ? `[1080P] Format=4:2:2, 25PPS, Location= ${ctx.venue}`
        : d === 1
          ? 'HDCAM to DVCAM transfer 1,2,3'
          : d === 2
            ? `Transfer to DVCAM. HD Tape ${tapeNo}&${tapeNo + 1}`
            : d === 3
              ? pick(OPERATORS)
              : null;
  } else if (fmt === 'audio') {
    const side = n % 2 === 0 ? 'Side B' : 'Side A';
    base.name = `${ctx.event} ${ctx.place} ${ctx.year} — Cassette ${Math.ceil(n / 2)} ${side}`;
    base.nameOnCase = `${ctx.event} ${Math.ceil(n / 2)}`;
    base.description = `Live recording, approx ${pick([45, 60, 90])} min`;
  } else if (fmt === 'photo') {
    const short = subtype.replace(' — ', ' ').replace('35MM Film', '35mm').replace('Negatives', 'negative strip');
    base.name = `${ctx.event} ${ctx.place} ${ctx.year} — ${short} ${n}`;
    const from = (n - 1) * 6 + 1;
    base.description = `${ctx.venue}; colour; frames ${from}–${from + 5}`;
  } else if (fmt === 'documents') {
    base.name = `${pick(DOC_TYPES[subtype] ?? ['Document'])} — ${ctx.event}, ${ctx.place} ${ctx.year}`;
    base.description = `${int(rng, 1, 6)} pages; ${rng() < 0.5 ? 'handwritten' : 'printed'}`;
    base.physicalSource = null;
  } else {
    base.name = `${PRASADI_TYPES[(n - 1) % PRASADI_TYPES.length]} — ${ctx.place} ${ctx.year}`;
    base.description = `Prasadi kept at ${ctx.venue}`;
    base.physicalSource = null;
  }
  return base;
}

const int = (rng: () => number, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

/* ------------------------------------------------------------------ data */

const BYTES: Record<Format, number> = {
  photo: 150_000_000,
  video: 12_000_000_000,
  audio: 900_000_000,
  documents: 60_000_000,
  prasadi: 40_000_000,
};
const FOLDER: Record<Format, string> = {
  photo: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  documents: 'Documents',
  prasadi: 'Prasadi',
};
const EXT: Record<Format, string> = { photo: 'tif', video: 'mov', audio: 'wav', documents: 'tif', prasadi: 'tif' };
const DISPOSE_REASONS = ['duplicate_in_mls', 'condition_too_poor', 'not_significant'];

function codePrefix(fmt: Format, subtype: string): string {
  const list = catalogList(`mediaSubtype.${fmt}`);
  const prefix = list?.items.find((i) => i.value === subtype)?.meta.codePrefix;
  if (typeof prefix === 'string') return prefix;
  return fmt === 'documents' ? 'DOC' : fmt === 'prasadi' ? 'PRS' : 'GEN';
}

export interface Dataset {
  users: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  lots: Record<string, unknown>[];
  items: Record<string, unknown>[];
  activity: Record<string, unknown>[];
}

export function buildDataset(now = new Date()): Dataset {
  const rng = makeRng(20261003);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const daysAgo = (d: number) => {
    const at = new Date(now.getTime() - d * DAY);
    at.setHours(9 + int(rng, 0, 8), int(rng, 0, 59), int(rng, 0, 59), 0);
    return at.getTime() > now.getTime() ? new Date(now.getTime() - int(rng, 1, 90) * 60_000) : at;
  };
  const phone = () => `+91 9${int(rng, 100000000, 999999999)}`;

  /* ---- users ---- */
  const users = TEAM.map((t) => ({ _id: new Types.ObjectId(), ...t, active: true }));
  const volunteers = users.filter((u) => u.role === 'volunteer');
  const reviewers = users.filter((u) => u.role === 'reviewer');
  const admin = users.find((u) => u.role === 'admin')!;
  const lead = users.find((u) => u.role === 'lead_reviewer')!;

  const seq: Record<string, number> = {};
  const nextCode = (prefix: string, origin: string) => {
    const key = `${prefix}-${origin}`;
    seq[key] = (seq[key] ?? 0) + 1;
    return `${prefix}-${origin}-${String(seq[key]).padStart(3, '0')}`;
  };

  const projects: Record<string, unknown>[] = [];
  const lots: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const activity: Record<string, unknown>[] = [];
  let lotSeq = 0;

  const log = (
    lot: Record<string, unknown> | null,
    project: Record<string, unknown>,
    kind: string,
    title: string,
    detail: string,
    at: Date,
    actor?: { _id: Types.ObjectId; name: string } | null,
  ) => {
    if (at.getTime() > now.getTime()) return; // never log a future event
    activity.push({
      _id: new Types.ObjectId(),
      lot: lot ? lot._id : null,
      lotCode: lot ? ((lot.namingCode as string | null) ?? (lot.lotReference as string)) : null,
      format: lot ? lot.format : null,
      project: lot ? null : project._id,
      projectCode: lot ? null : project.code,
      kind,
      title,
      detail,
      actor: actor?._id ?? null,
      actorName: actor?.name ?? 'System',
      at,
      changes: [],
    });
  };

  for (const spec of PROJECTS) {
    const projectId = new Types.ObjectId();
    const received = spec.receivedDaysAgo === null ? null : daysAgo(spec.receivedDaysAgo);
    const coordinator = spec.coordinator === 'lead' ? lead : pick(reviewers);
    const owner = { name: spec.owner, phone: phone(), email: `office@example.org`, address: spec.ctx.venue };
    const contacts = [{ name: `Shri ${pick(['K.', 'P.', 'R.', 'M.'])} ${pick(['Bhatt', 'Shah', 'Desai', 'Joshi'])}`, phone: phone() }];
    const conditionNotes = 'Stored in the mandir office cupboard; some tapes show dust and light edge wear.';
    const reasonForSending = 'Handed over for preservation and digitization.';

    // The project's shared intake values, in wire shape (see projectSharedSchema).
    const shared: Record<string, unknown> = {
      ...(received ? { dateReceived: received.toISOString() } : {}),
      ...(spec.origin ? { originSource: spec.origin } : {}),
      ...(received ? { owner, pointsOfContact: contacts } : {}),
      conditionNotes,
      reasonForSending,
      rights: { type: 'deed_of_gift' },
    };
    if (spec.origin === null) delete shared.owner;

    const projectDoc: Record<string, unknown> = {
      _id: projectId,
      code: spec.code,
      name: spec.name,
      description: spec.description,
      createdBy: admin._id,
      coordinator: coordinator._id,
      coordinatorName: coordinator.name,
      shared,
      startDate: received,
      targetDate: new Date(now.getTime() + int(rng, 20, 120) * DAY),
      lotCount: spec.lots.length,
      createdAt: received ?? daysAgo(2),
      updatedAt: daysAgo(1),
    };
    projects.push(projectDoc);
    log(null, projectDoc, 'project_created', `Project ${spec.code} created`,
      `${spec.name} · ${spec.lots.length} lots`, received ?? daysAgo(2), admin);

    for (const ls of spec.lots) {
      lotSeq += 1;
      const lotId = new Types.ObjectId();
      const lotReference = `LOT-2026-${String(lotSeq).padStart(4, '0')}`;
      const stageEnteredAt = daysAgo(ls.days);
      const dateReceived = received && received.getTime() <= stageEnteredAt.getTime() ? received : (received ? stageEnteredAt : null);
      const assignee = ls.assignee === null ? null : volunteers[ls.assignee]!;

      const decidedStages: Stage[] = ['metadata', 'scanning', 'mls_tag', 'storage'];
      const archivedLot = decidedStages.includes(ls.stage);
      const finished = ls.stage === 'returned' || ls.stage === 'discarded';
      const decided = archivedLot || finished;
      const quantity = ls.lines.reduce((s, [, q]) => s + q, 0);
      const primary = ls.lines[0]!;
      const origin = (spec.origin ?? 'OTH') as OriginSource;
      const namingCode = archivedLot ? nextCode(codePrefix(ls.format, primary[0]), origin) : null;
      const itemBase = namingCode ?? lotReference;
      const reviewer = pick(reviewers);

      /* ---- items ---- */
      const splitReturn = archivedLot ? (ls.splitReturn ?? 0) : 0;
      const splitDiscard = archivedLot ? (ls.splitDiscard ?? 0) : 0;
      const archivedCount = archivedLot ? quantity - splitReturn - splitDiscard : 0;
      const foundTarget =
        ls.stage === 'scanning'
          ? Math.floor(archivedCount * (ls.days > 7 ? 0.25 : 0.45))
          : ['mls_tag', 'storage'].includes(ls.stage)
            ? archivedCount
            : 0;
      const taggedTarget =
        ls.stage === 'storage' ? archivedCount : ls.stage === 'mls_tag' ? Math.floor(archivedCount * 0.5) : 0;
      const decisionDoneUpTo = ls.stage === 'decision' ? Math.floor(quantity * 0.6) : decided ? quantity : 0;
      const namedUpTo = ls.stage === 'intake' ? Math.ceil(quantity * 0.5) : quantity;
      const lineStats = ls.lines.map(() => ({ archived: 0, selected: 0 }));

      let n = 0;
      let lineIndex = 0;
      let inLine = 0;
      let foundSoFar = 0;
      let taggedSoFar = 0;
      const unitCodes: { code: string; groupNo: number; itemNo: number }[] = [];
      for (let g = 1; unitCodes.length < quantity; g += 1) {
        for (let i = 1; i <= 36 && unitCodes.length < quantity; i += 1) {
          unitCodes.push({ code: `${itemBase}-${pad2(g)}-${pad2(i)}`, groupNo: g, itemNo: i });
        }
      }

      for (const u of unitCodes) {
        while (inLine >= ls.lines[lineIndex]![1]) {
          lineIndex += 1;
          inLine = 0;
        }
        const subtype = ls.lines[lineIndex]![0];
        inLine += 1;
        n += 1;
        const draft = draftItem(ls.format, subtype, n, spec.ctx, rng);
        const named = n <= namedUpTo;
        const answered = n <= decisionDoneUpTo;

        // Per-item result.
        let verdict: 'archive' | 'return_or_discard' | null = null;
        let disposition: 'return' | 'discard' | null = null;
        if (answered) {
          if (ls.stage === 'returned') {
            verdict = 'return_or_discard';
            disposition = 'return';
          } else if (ls.stage === 'discarded') {
            verdict = 'return_or_discard';
            disposition = 'discard';
          } else if (archivedLot && n > quantity - splitReturn - splitDiscard) {
            verdict = 'return_or_discard';
            disposition = n > quantity - splitDiscard ? 'discard' : 'return';
          } else if (ls.stage === 'decision' && n === decisionDoneUpTo && decisionDoneUpTo > 1) {
            verdict = 'return_or_discard'; // answered, but return/discard not chosen yet
          } else {
            verdict = 'archive';
          }
        }
        const selected = verdict === 'archive' || verdict === null;
        const digitized = verdict === 'archive' && foundSoFar < foundTarget && archivedLot;
        if (digitized) foundSoFar += 1;
        const tagged = digitized && taggedSoFar < taggedTarget;
        if (tagged) taggedSoFar += 1;
        if (verdict === 'archive') lineStats[lineIndex]!.archived += 1;
        if (selected) lineStats[lineIndex]!.selected += 1;

        const fileName = digitized ? `${u.code}.${EXT[ls.format]}` : null;
        items.push({
          _id: new Types.ObjectId(),
          lot: lotId,
          code: u.code,
          groupNo: u.groupNo,
          itemNo: u.itemNo,
          lineIndex,
          selectedForDigitization: selected,
          notDigitizedReason: verdict === 'return_or_discard' ? pick(DISPOSE_REASONS) : null,
          digitized,
          fileName,
          fileBytes: digitized ? Math.round(BYTES[ls.format] * (0.85 + rng() * 0.3)) : 0,
          sha256: digitized ? [...Array(64)].map(() => int(rng, 0, 15).toString(16)).join('') : null,
          taggedInMls: tagged,
          mlsDuplicate: false,
          mlsDuplicateOf: null,
          // Details: named items have the full spreadsheet-style record.
          name: named ? draft.name : null,
          nameOnCase: named ? draft.nameOnCase : null,
          description: named ? draft.description : null,
          year: named ? spec.ctx.year : null,
          month: named ? draft.month : null,
          place: named ? spec.ctx.place : null,
          event: named ? spec.ctx.event : null,
          people: named ? draft.people : null,
          physicalSource: named ? draft.physicalSource : null,
          itemCondition: named ? draft.itemCondition : null,
          remarks: named ? draft.remarks : null,
          digitalSource: digitized ? 'Sarangpur Capture' : null,
          decision: {
            existsInMls: answered ? false : null,
            newCopyIsBetter: null,
            conditionUsable: answered ? true : null,
            significant: answered ? verdict === 'archive' : null,
            verdict,
            disposition,
            decidedBy: answered && verdict && (verdict === 'archive' || disposition) ? (assignee?._id ?? admin._id) : null,
            decidedAt: answered && verdict && (verdict === 'archive' || disposition) ? daysAgo(ls.days + int(rng, 1, 6)) : null,
          },
          dispositionStatus:
            archivedLot && verdict === 'return_or_discard'
              ? ls.stage === 'storage' || ls.stage === 'mls_tag'
                ? 'done'
                : 'pending'
              : null,
          dispositionDoneAt:
            archivedLot && verdict === 'return_or_discard' && (ls.stage === 'storage' || ls.stage === 'mls_tag')
              ? daysAgo(Math.max(0, ls.days - 1))
              : null,
          dispositionDoneByName:
            archivedLot && verdict === 'return_or_discard' && (ls.stage === 'storage' || ls.stage === 'mls_tag')
              ? pick(volunteers).name
              : null,
          lotReference: archivedLot && verdict === 'return_or_discard' ? lotReference : null,
        });
      }

      /* ---- lot ---- */
      const mediaLines = ls.lines.map(([subtype, qty], i) => ({
        format: ls.format,
        dataType: subtype === 'Digital' ? 'digital' : 'physical',
        mediaSubtype: subtype,
        quantity: qty,
        quantityToDigitize: archivedLot ? lineStats[i]!.selected : 0,
        quantityAlreadyDigitized: 0,
        notDigitizedReason: null,
        quantityRemarks: null,
      }));
      const toDigitize = archivedLot ? archivedCount : 0;
      const masterBytes = Math.round(foundSoFar * BYTES[ls.format] * (0.85 + rng() * 0.3));
      const folderPath =
        namingCode && foundSoFar > 0
          ? `\\\\sarangpur.net\\ps\\${FOLDER[ls.format]}\\${origin}\\${namingCode}\\`
          : null;

      const overdueReturn = Boolean(ls.returnOverdue);
      const returnedLot = ls.stage === 'returned';
      const returnStatus = returnedLot ? 'returned' : overdueReturn ? 'pending' : 'not_requested';
      const decidedAt = decided ? daysAgo(ls.days + int(rng, 1, 6)) : null;
      const significance = [true, false, false, false];

      const lot: Record<string, unknown> = {
        _id: lotId,
        lotReference,
        namingCode,
        originSource: spec.origin ?? undefined,
        dateReceived,
        receiver: admin._id,
        owner: received ? owner : undefined,
        pointsOfContact: received ? contacts : [],
        facilitator: null,
        format: ls.format,
        dataType: primary[0] === 'Digital' ? 'digital' : 'physical',
        mediaSubtype: primary[0],
        quantity,
        quantityToDigitize: toDigitize,
        quantityAlreadyDigitized: 0,
        mediaLines,
        conditionNotes,
        conditionPhotoUrl: `/uploads/condition/${lotSeq}.jpg`,
        reasonForSending,
        digitalFilePath: folderPath ?? undefined,
        physicalLabelApplied: archivedLot,
        containerLabelApplied: archivedLot,
        rights: { type: 'deed_of_gift', deedReference: null, notes: null },
        stage: ls.stage,
        stageEnteredAt,
        projectIds: [projectId],
        syncProjectId: projectId,
        assignee: assignee?._id ?? null,
        assigneeName: assignee?.name ?? null,
        decision: {
          status: ls.stage === 'discarded' ? 'discard' : ls.stage === 'returned' ? 'return' : archivedLot ? 'archive' : 'pending',
          verdict: decided ? (archivedLot ? 'archive' : 'return_or_discard') : null,
          decidedBy: decided ? reviewer._id : null,
          decidedAt,
          existsInMls: decided ? false : null,
          mlsMatchPaths: [],
          conditionUsable: decided ? true : null,
          significanceFlags: decided ? significance : undefined,
          significanceNotes: decided
            ? `Decided item by item: ${archivedCount} archive, ${splitReturn + (returnedLot ? quantity : 0)} return, ${splitDiscard + (ls.stage === 'discarded' ? quantity : 0)} discard.`
            : undefined,
          overrideStatus: 'none',
          overrideRequestedBy: null,
          overrideApprovedBy: null,
        },
        digitization: {
          scanStatus:
            ls.stage === 'scanning' ? (foundSoFar === 0 ? 'pending' : 'in_progress') : ['mls_tag', 'storage'].includes(ls.stage) ? 'scanned' : 'pending',
          scannedBy: foundSoFar > 0 ? (assignee?._id ?? pick(volunteers)._id) : null,
          scanDate: foundSoFar >= toDigitize && toDigitize > 0 ? stageEnteredAt : null,
          folderPath,
          expectedFileCount: toDigitize,
          foundFileCount: foundSoFar,
          lastReconciledAt: foundSoFar > 0 ? daysAgo(int(rng, 0, 3)) : null,
          masterBytes,
        },
        mls: {
          recordId: taggedSoFar > 0 ? `MLS-2026-${int(rng, 10000, 19999)}` : null,
          taggedCount: taggedSoFar,
          duplicatesFound: 0,
          duplicateAction: null,
          duplicateApprovedBy: null,
          dataListAttached: ls.stage === 'storage',
          syncFailures: 0,
        },
        return: {
          requested: returnStatus !== 'not_requested',
          format: returnStatus === 'not_requested' ? 'none' : 'physical',
          durationText: returnStatus === 'not_requested' ? undefined : 'within 60 days',
          dueAt: overdueReturn ? daysAgo(8) : returnedLot ? daysAgo(ls.days + 12) : null,
          status: returnStatus,
          returnedAt: returnedLot ? stageEnteredAt : null,
          method: returnedLot ? 'In person' : undefined,
          handledBy: returnedLot ? volunteers[0]!._id : null,
        },
        discard: {
          reason: ls.stage === 'discarded' ? 'not_significant' : null,
          discardedBy: ls.stage === 'discarded' ? admin._id : null,
          discardedAt: ls.stage === 'discarded' ? stageEnteredAt : null,
        },
      };
      lots.push(lot);

      /* ---- audit trail ---- */
      const at0 = dateReceived ?? stageEnteredAt;
      log(lot, projectDoc, 'intake_created', 'Intake created',
        `${quantity} items · ${primary[0]}. Created from project ${spec.code}.`, at0, admin);
      if (assignee) log(lot, projectDoc, 'lot_assigned', `Assigned to ${assignee.name}`, '', at0, admin);
      if (decidedAt) {
        log(lot, projectDoc, 'decision_recorded',
          `Decision recorded (items) — ${ls.stage === 'discarded' ? 'discard' : ls.stage === 'returned' ? 'return' : 'archive'}`,
          `Decided item by item.`, decidedAt, reviewer);
      }
      if (namingCode) {
        log(lot, projectDoc, 'code_issued', 'Naming code issued & profiles created',
          `${namingCode} assigned; ${quantity} item profiles recoded.`,
          new Date(stageEnteredAt.getTime() - 2 * DAY), null);
      }
      if (foundSoFar > 0) {
        const done = foundSoFar >= toDigitize;
        log(lot, projectDoc, done ? 'scan_completed' : 'scan_started', done ? 'Scan completed' : 'Scanning started',
          `${foundSoFar} of ${toDigitize} expected files matched in the server folder.`, stageEnteredAt, assignee ?? pick(volunteers));
      }
      if (returnedLot) {
        log(lot, projectDoc, 'return_completed', 'Return marked returned', 'In person.', stageEnteredAt, volunteers[0]!);
      }
      if (ls.stage === 'discarded') {
        log(lot, projectDoc, 'discard_confirmed', 'Discard confirmed', 'Reversal requires an Admin.', stageEnteredAt, admin);
      }
    }
  }

  return { users, projects, lots, items, activity };
}
