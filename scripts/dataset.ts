/**
 * Generates a realistic snapshot of the Sarangpur photo archive as plain documents.
 *
 * Kept separate from the seeding itself so the same data can be (a) inserted into
 * MongoDB by scripts/seed.ts and (b) validated against the Mongoose schemas and run
 * through the dashboard pipelines by scripts/verify-seed.ts, with no database.
 *
 * Everything derives from a fixed PRNG seed, so the numbers are reproducible. Dates are
 * relative to `now`, so the SLA breaches and the 30-day window stay meaningful however
 * long after writing this it runs.
 */

import { Types } from 'mongoose';
import type {
  CodePrefix,
  DiscardReason,
  Format,
  NotDigitizedReason,
  OriginSource,
  Role,
  Stage,
} from '../src/lib/domain';

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

/* -------------------------------------------------------------------- names */

const HONORIFIC_M = ['Shri', 'Shri', 'Shri', 'Dr.'];
const HONORIFIC_F = ['Smt.', 'Smt.', 'Kum.'];
const FIRST = ['H.', 'R.', 'M.', 'K.', 'P.', 'N.', 'B.', 'D.', 'A.', 'J.', 'S.', 'V.', 'L.', 'G.'];
const SURNAMES = [
  'Shah', 'Patel', 'Amin', 'Desai', 'Trivedi', 'Joshi', 'Mehta', 'Dave', 'Vyas', 'Thakkar',
  'Raval', 'Pandya', 'Bhagat', 'Kotecha', 'Shukla', 'Modi', 'Parikh', 'Gandhi', 'Bhatt', 'Soni',
];
const INSTITUTIONS = [
  'Sarangpur Mandir office', 'Mumbai Mandir office', 'Ahmedabad Mandir office',
  'Bal Mandal archive', 'Yuvak Mandal records',
];

/* -------------------------------------------------------------------- media */

interface MediaShape {
  format: Format;
  subtype: string;
  prefix: CodePrefix;
  unit: string;
  /** Average bytes per digitised item — this is what fills the storage meter. */
  bytesPerItem: number;
  min: number;
  max: number;
}

const MEDIA: MediaShape[] = [
  { format: 'photo', subtype: '35MM Film — Negatives', prefix: 'NEG', unit: 'frames', bytesPerItem: 180_000_000, min: 36, max: 400 },
  { format: 'photo', subtype: '35MM Film — Slides', prefix: 'SLD', unit: 'slides', bytesPerItem: 150_000_000, min: 40, max: 400 },
  { format: 'photo', subtype: '120 Film — Negatives', prefix: 'NEG', unit: 'frames', bytesPerItem: 320_000_000, min: 12, max: 180 },
  { format: 'photo', subtype: 'Large Format — Negatives', prefix: 'NEG', unit: 'sheets', bytesPerItem: 640_000_000, min: 8, max: 60 },
  { format: 'photo', subtype: 'Print — Print', prefix: 'PRT', unit: 'prints', bytesPerItem: 90_000_000, min: 20, max: 300 },
  { format: 'photo', subtype: 'Print — Album', prefix: 'PRT', unit: 'pages', bytesPerItem: 110_000_000, min: 20, max: 240 },
  { format: 'photo', subtype: 'Digital', prefix: 'DIG', unit: 'files', bytesPerItem: 12_000_000, min: 200, max: 5000 },
  { format: 'video', subtype: 'VHS', prefix: 'VHS', unit: 'tapes', bytesPerItem: 28_000_000_000, min: 2, max: 20 },
  { format: 'video', subtype: 'Mini DVs', prefix: 'VHS', unit: 'tapes', bytesPerItem: 13_000_000_000, min: 2, max: 18 },
  { format: 'video', subtype: 'U-matic', prefix: 'VHS', unit: 'tapes', bytesPerItem: 34_000_000_000, min: 1, max: 10 },
  { format: 'audio', subtype: 'Cassettes', prefix: 'AUD', unit: 'cassettes', bytesPerItem: 900_000_000, min: 4, max: 40 },
  { format: 'audio', subtype: 'Spools', prefix: 'AUD', unit: 'spools', bytesPerItem: 2_400_000_000, min: 2, max: 20 },
];

const ORIGINS: OriginSource[] = ['MUM', 'AHM', 'SAR', 'OTH'];

const TEAM: { name: string; initials: string; username: string; role: Role }[] = [
  { name: 'M. Patel', initials: 'MP', username: 'm.patel', role: 'volunteer' },
  { name: 'H. Patel', initials: 'HP', username: 'h.patel', role: 'volunteer' },
  { name: 'A. Mehta', initials: 'AM', username: 'a.mehta', role: 'volunteer' },
  { name: 'D. Trivedi', initials: 'DT', username: 'd.trivedi', role: 'reviewer' },
  { name: 'R. Joshi', initials: 'RJ', username: 'r.joshi', role: 'reviewer' },
  { name: 'Lead Pujya Sant', initials: 'LP', username: 'lead.reviewer', role: 'lead_reviewer' },
  { name: 'S. Dave', initials: 'SD', username: 's.dave', role: 'admin' },
];

/**
 * How many lots sit in each stage.
 *
 * In-flight stages are current occupancy. Terminal stages give the whole history, of
 * which `recent` entered within the last 30 days — those are the ones the board shows.
 */
const PLAN: { stage: Stage; total: number; recent?: number }[] = [
  { stage: 'intake', total: 23 },
  { stage: 'decision', total: 42 },
  { stage: 'metadata', total: 19 },
  { stage: 'scanning', total: 67 },
  { stage: 'mls_tag', total: 31 },
  { stage: 'storage', total: 902, recent: 12 },
  { stage: 'returned', total: 108, recent: 8 },
  { stage: 'discarded', total: 92, recent: 9 },
];

const DISCARD_REASONS_POOL: DiscardReason[] = [
  'duplicate', 'condition_too_poor', 'not_significant', 'not_scannable', 'other',
];
const NOT_DIGITIZED_POOL: NotDigitizedReason[] = [
  'duplicate_in_mls', 'condition_too_poor', 'not_significant', 'other',
];
const RETURN_METHODS = ['In person', 'Post', 'Courier', 'Email'];

/* --------------------------------------------------------------------- data */

export interface Dataset {
  users: Record<string, unknown>[];
  lots: Record<string, unknown>[];
  items: Record<string, unknown>[];
  activity: Record<string, unknown>[];
}

export function buildDataset(now = new Date()): Dataset {
  const rng = makeRng(20260918);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  /**
   * A date N days ago, landing at a plausible moment in the archive's working day
   * (09:00–18:00). Without the jitter every event on a given day shares a timestamp and
   * the activity feed reads like a database dump rather than a day's work.
   */
  const daysAgo = (d: number) => {
    const at = new Date(now.getTime() - d * DAY);
    at.setHours(9 + int(0, 8), int(0, 59), int(0, 59), 0);
    return at.getTime() > now.getTime() ? new Date(now.getTime() - int(1, 90) * 60_000) : at;
  };

  const personName = () => {
    const female = rng() < 0.22;
    return `${female ? pick(HONORIFIC_F) : pick(HONORIFIC_M)} ${pick(FIRST)} ${pick(SURNAMES)}`;
  };
  const ownerName = () => (rng() < 0.06 ? pick(INSTITUTIONS) : personName());
  const phone = () => `+91 9${int(100000000, 999999999)}`;

  /* ---- users ---- */
  const users = TEAM.map((t) => ({ _id: new Types.ObjectId(), ...t, active: true }));
  const volunteers = users.filter((u) => u.role === 'volunteer');
  const reviewers = users.filter((u) => u.role === 'reviewer');
  const admin = users.find((u) => u.role === 'admin')!;
  const lead = users.find((u) => u.role === 'lead_reviewer')!;

  /* ---- lots ---- */
  const seq: Record<string, number> = {};
  const nextCode = (prefix: CodePrefix, origin: OriginSource) => {
    const key = `${prefix}-${origin}`;
    seq[key] = (seq[key] ?? 0) + 1;
    return `${prefix}-${origin}-${String(seq[key]).padStart(3, '0')}`;
  };

  const lots: Record<string, unknown>[] = [];
  let lotSeq = 0;

  // Counters that force the alert conditions to land on exact, checkable numbers.
  let decisionOverdueLeft = 9;
  let scanOverdueLeft = 4;
  let overridesLeft = 3;
  let duplicateLotsLeft = 2;
  let returnsPendingLeft = 18;
  let returnsOverdueLeft = 6;

  for (const { stage, total, recent } of PLAN) {
    for (let i = 0; i < total; i++) {
      lotSeq += 1;
      const media = pick(MEDIA);
      const origin: OriginSource =
        media.subtype.startsWith('Print') && rng() < 0.6 ? 'OTH' : pick(ORIGINS);
      const quantity = int(media.min, media.max);

      /* when did it enter its current stage? */
      let stageEnteredDays: number;
      if (stage === 'decision' && decisionOverdueLeft > 0) {
        // Day 11 down to day 6, so "oldest is day 11" is literally true.
        stageEnteredDays = decisionOverdueLeft === 9 ? 11 : 6 + ((decisionOverdueLeft - 1) % 5);
        decisionOverdueLeft -= 1;
      } else if (stage === 'decision') {
        stageEnteredDays = int(0, 4);
      } else if (stage === 'scanning' && scanOverdueLeft > 0) {
        stageEnteredDays = int(11, 24);
        scanOverdueLeft -= 1;
      } else if (recent !== undefined) {
        stageEnteredDays = i < recent ? int(0, 29) : int(31, 1000);
      } else {
        stageEnteredDays = int(0, 4);
      }
      const stageEnteredAt = daysAgo(stageEnteredDays);

      /* when was it received? always before the current stage */
      const receivedDays = stageEnteredDays + (stage === 'intake' ? 0 : int(2, 90));
      // A lot still sitting at intake entered that stage the moment it arrived, so the
      // two timestamps must be the same instant, not two independent jittered ones.
      const dateReceived = receivedDays === stageEnteredDays ? stageEnteredAt : daysAgo(receivedDays);

      const decidedStages: Stage[] = ['metadata', 'scanning', 'mls_tag', 'storage', 'returned'];
      const hasDecision = decidedStages.includes(stage) || stage === 'discarded';
      const archived = hasDecision && stage !== 'discarded';
      const reviewer = pick(reviewers);

      let overrideStatus: 'none' | 'requested' = 'none';
      if (stage === 'decision' && overridesLeft > 0 && rng() < 0.4) {
        overrideStatus = 'requested';
        overridesLeft -= 1;
      }

      const significance = [rng() < 0.3, rng() < 0.35, rng() < 0.2, rng() < 0.25];
      if (archived && !significance.some(Boolean)) significance[1] = true;

      const excluded = rng() < 0.55 ? int(0, Math.floor(quantity * 0.35)) : 0;
      const toDigitize = Math.max(0, quantity - excluded);
      let found = 0;
      if (stage === 'scanning') found = int(0, toDigitize);
      else if (['mls_tag', 'storage', 'returned'].includes(stage)) found = toDigitize;

      const masterBytes =
        stage === 'discarded' ? 0 : Math.round(found * media.bytesPerItem * (0.85 + rng() * 0.3));

      let duplicatesFound = 0;
      if (stage === 'mls_tag' && duplicateLotsLeft > 0 && rng() < 0.12) {
        duplicatesFound = 1;
        duplicateLotsLeft -= 1;
      }
      const taggedCount =
        stage === 'mls_tag'
          ? int(0, toDigitize)
          : ['storage', 'returned'].includes(stage)
            ? toDigitize
            : 0;

      const wantsReturn = rng() < 0.22;
      let returnStatus: 'not_requested' | 'pending' | 'in_progress' | 'returned' = 'not_requested';
      let dueAt: Date | null = null;
      let returnedAt: Date | null = null;

      if (stage === 'returned') {
        returnStatus = 'returned';
        returnedAt = stageEnteredAt;
        dueAt = daysAgo(stageEnteredDays + int(5, 40));
      } else if (
        wantsReturn &&
        returnsPendingLeft > 0 &&
        stage !== 'discarded' &&
        stage !== 'intake'
      ) {
        returnsPendingLeft -= 1;
        if (returnsOverdueLeft > 0) {
          returnStatus = 'pending';
          dueAt = daysAgo(int(1, 25)); // already past due
          returnsOverdueLeft -= 1;
        } else {
          returnStatus = rng() < 0.5 ? 'pending' : 'in_progress';
          dueAt = new Date(now.getTime() + int(3, 60) * DAY);
        }
      }

      const namingCode = hasDecision || stage === 'storage' ? nextCode(media.prefix, origin) : null;
      const folderRoot =
        media.format === 'video' ? 'Videos' : media.format === 'audio' ? 'Audio' : 'Photos';

      lots.push({
        _id: new Types.ObjectId(),
        lotReference: `LOT-2026-${String(lotSeq).padStart(4, '0')}`,
        namingCode,
        originSource: origin,
        dateReceived,
        receiver: pick(volunteers)._id,
        owner: {
          name: ownerName(),
          phone: phone(),
          email: rng() < 0.5 ? undefined : `contact${lotSeq}@example.com`,
          address: rng() < 0.6 ? 'Address on file' : undefined,
        },
        pointsOfContact: rng() < 0.45 ? [{ name: personName(), phone: phone() }] : [],
        facilitator: rng() < 0.15 ? { name: personName(), phone: phone() } : null,
        format: media.format,
        dataType: media.subtype === 'Digital' ? 'digital' : 'physical',
        mediaSubtype: media.subtype,
        quantity,
        quantityToDigitize: toDigitize,
        quantityAlreadyDigitized: 0,
        quantityRemarks: rng() < 0.3 ? `${int(2, 12)} ${media.unit} per container` : undefined,
        conditionNotes:
          rng() < 0.7
            ? 'Stored in sleeves, generally clean. Minor surface scratching on some items.'
            : 'Visible edge fading; two items show adhesive damage.',
        conditionPhotoUrl: `/uploads/condition/${lotSeq}.jpg`,
        reasonForSending:
          rng() < 0.5
            ? 'Family collection offered to the archive for preservation.'
            : 'Mandir records handed over during the annual clear-out.',
        senderRemarks: rng() < 0.2 ? 'Please handle the album spine with care.' : undefined,
        stage,
        stageEnteredAt,
        decision: {
          status: stage === 'discarded' ? 'discard' : hasDecision ? 'archive' : 'pending',
          decidedBy: hasDecision ? reviewer._id : null,
          decidedAt: hasDecision ? daysAgo(stageEnteredDays + int(1, 20)) : null,
          existsInMls: hasDecision ? rng() < 0.15 : null,
          mlsMatchPaths: [],
          conditionUsable: hasDecision ? true : null,
          significanceFlags: hasDecision ? significance : undefined,
          overrideStatus,
          overrideRequestedBy: overrideStatus === 'requested' ? reviewer._id : null,
          overrideApprovedBy: null,
        },
        digitization: {
          scanStatus:
            stage === 'scanning'
              ? found === 0
                ? 'pending'
                : 'in_progress'
              : ['mls_tag', 'storage', 'returned'].includes(stage)
                ? 'scanned'
                : 'pending',
          scannedBy: found > 0 ? pick(volunteers)._id : null,
          scanDate: found >= toDigitize && toDigitize > 0 ? stageEnteredAt : null,
          folderPath:
            namingCode && found > 0
              ? `\\\\sarangpur.net\\ps\\${folderRoot}\\${origin}\\${namingCode}\\`
              : null,
          expectedFileCount: toDigitize,
          foundFileCount: found,
          lastReconciledAt: found > 0 ? daysAgo(int(0, 3)) : null,
          masterBytes,
        },
        mls: {
          recordId: taggedCount > 0 ? `MLS-2026-${int(10000, 19999)}` : null,
          taggedCount,
          duplicatesFound,
          duplicateAction: null,
          duplicateApprovedBy: null,
          dataListAttached: ['storage', 'returned'].includes(stage),
          syncFailures: stage === 'mls_tag' && rng() < 0.08 ? int(1, 3) : 0,
        },
        return: {
          requested: returnStatus !== 'not_requested',
          format: returnStatus === 'not_requested' ? 'none' : pick(['physical', 'digital', 'both']),
          durationText: returnStatus === 'not_requested' ? undefined : `within ${int(30, 90)} days`,
          dueAt,
          status: returnStatus,
          returnedAt,
          method: returnStatus === 'returned' ? pick(RETURN_METHODS) : undefined,
          handledBy: returnStatus === 'returned' ? pick(volunteers)._id : null,
          trackingReference:
            returnStatus === 'returned' && rng() < 0.4 ? `BD-${int(1000000, 9999999)}` : undefined,
        },
        discard: {
          reason: stage === 'discarded' ? pick(DISCARD_REASONS_POOL) : null,
          discardedBy: stage === 'discarded' ? admin._id : null,
          discardedAt: stage === 'discarded' ? stageEnteredAt : null,
        },
      });
    }
  }

  /* ---- item profiles ---- */

  // Only for lots currently being scanned or tagged: those are the ones the operational
  // screens read item-by-item. Generating them for all 1,284 lots would mean ~200k
  // documents and a much slower seed for no added value.
  const items: Record<string, unknown>[] = [];
  const itemLots = lots.filter((l) => ['scanning', 'mls_tag'].includes(l.stage as string));

  for (const lot of itemLots) {
    const dig = lot.digitization as { expectedFileCount: number; foundFileCount: number };
    const mls = lot.mls as { taggedCount: number };
    const code = (lot.namingCode as string | null) ?? (lot.lotReference as string);
    const quantity = lot.quantity as number;
    const perGroup = 36;

    let n = 0;
    for (let g = 1; n < quantity; g++) {
      for (let i = 1; i <= perGroup && n < quantity; i++, n++) {
        const selected = n < dig.expectedFileCount;
        const digitized = selected && n < dig.foundFileCount;
        const itemCode = `${code}-${String(g).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        items.push({
          _id: new Types.ObjectId(),
          lot: lot._id,
          code: itemCode,
          groupNo: g,
          itemNo: i,
          selectedForDigitization: selected,
          notDigitizedReason: selected ? null : pick(NOT_DIGITIZED_POOL),
          digitized,
          fileName: digitized ? `${itemCode}.tif` : null,
          fileBytes: digitized ? int(80, 400) * 1_000_000 : 0,
          sha256: digitized ? [...Array(64)].map(() => int(0, 15).toString(16)).join('') : null,
          taggedInMls: digitized && n < mls.taggedCount,
          mlsDuplicate: false,
          mlsDuplicateOf: null,
        });
      }
    }
  }

  // Mark one real item on each duplicate-carrying lot, so the item rows agree with the
  // lot-level counter instead of quietly contradicting it.
  for (const lot of lots.filter((l) => ((l.mls as { duplicatesFound: number }).duplicatesFound ?? 0) > 0)) {
    const target = items.find((it) => String(it.lot) === String(lot._id) && it.digitized);
    if (target) {
      target.mlsDuplicate = true;
      target.mlsDuplicateOf = `MLS-2024-${int(10000, 19999)}`;
      target.taggedInMls = false;
    }
  }

  /* ---- audit trail ---- */

  const activity: Record<string, unknown>[] = [];
  const log = (
    lot: Record<string, unknown>,
    kind: string,
    title: string,
    detail: string,
    at: Date,
    actor?: { _id: Types.ObjectId; name: string } | null,
  ) => {
    if (at.getTime() > now.getTime()) return; // never log a future event
    activity.push({
      _id: new Types.ObjectId(),
      lot: lot._id,
      lotCode: (lot.namingCode as string | null) ?? (lot.lotReference as string),
      kind,
      title,
      detail,
      actor: actor?._id ?? null,
      actorName: actor?.name ?? 'System',
      at,
      changes: [],
    });
  };

  // Only the most recent slice of history — enough to make the feed and the per-record
  // timelines real without writing half a million rows.
  const recentLots = [...lots]
    .sort(
      (a, b) => (b.stageEnteredAt as Date).getTime() - (a.stageEnteredAt as Date).getTime(),
    )
    .slice(0, 260);

  for (const lot of recentLots) {
    const entered = lot.stageEnteredAt as Date;
    const dig = lot.digitization as { expectedFileCount: number; foundFileCount: number };
    const decision = lot.decision as { decidedAt: Date | null; status: string; overrideStatus: string };
    const mls = lot.mls as { duplicatesFound: number };
    const ret = lot.return as { returnedAt: Date | null; method?: string; trackingReference?: string };
    const volunteer = pick(volunteers);
    const reviewer = pick(reviewers);

    log(lot, 'intake_created', 'Intake created',
      `${lot.quantity} items · ${lot.mediaSubtype}. Condition photo attached.`,
      lot.dateReceived as Date, volunteer);

    if (decision.decidedAt) {
      log(lot, 'decision_recorded',
        decision.status === 'discard' ? 'Decision recorded — Discard' : 'Decision recorded — Archive',
        'MLS check complete. Condition usable. Significance criteria assessed.',
        decision.decidedAt, reviewer);
    }

    if (lot.namingCode) {
      log(lot, 'code_issued', 'Naming code issued & profiles created',
        `${lot.namingCode} assigned; ${lot.quantity} item profiles generated from the intake counts.`,
        new Date(entered.getTime() - int(1, 6) * DAY), null);
    }

    if (dig.foundFileCount > 0) {
      const done = dig.foundFileCount >= dig.expectedFileCount;
      log(lot, done ? 'scan_completed' : 'scan_started',
        done ? 'Scan completed' : 'Scanning started',
        `${dig.foundFileCount} of ${dig.expectedFileCount} expected files matched in the server folder.`,
        new Date(entered.getTime() + int(0, 2) * DAY), volunteer);
    }

    if (mls.duplicatesFound > 0) {
      log(lot, 'mls_duplicate_flagged', 'MLS duplicate flagged',
        'An item matches an existing MLS record. Held for Lead review.',
        new Date(entered.getTime() + int(0, 1) * DAY), null);
    }

    if (decision.overrideStatus === 'requested') {
      log(lot, 'override_requested', 'Override requested',
        `Awaiting ${lead.name} approval.`,
        new Date(entered.getTime() + int(0, 2) * DAY), reviewer);
    }

    if (lot.stage === 'returned' && ret.returnedAt) {
      log(lot, 'return_completed', 'Return marked returned',
        `${ret.method ?? 'In person'}${ret.trackingReference ? ` · reference ${ret.trackingReference}` : ''}.`,
        ret.returnedAt, pick(volunteers));
    }

    if (lot.stage === 'discarded') {
      log(lot, 'discard_confirmed', 'Discard confirmed', 'Reversal requires an Admin.', entered, admin);
    }
  }

  return { users, lots, items, activity };
}
