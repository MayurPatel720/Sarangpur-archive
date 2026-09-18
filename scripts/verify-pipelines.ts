/**
 * Executes the real dashboard aggregation pipelines against a hand-built fixture whose
 * answers are known by hand, then checks the shaped API responses against their Zod
 * contracts.
 *
 *   npm run verify:pipelines
 *
 * The pipelines are not reimplemented here — they are imported from
 * src/server/dashboard/pipelines.ts and run through `mingo`, a MongoDB query-engine
 * implementation. That means this catches real mistakes ($facet sub-pipelines that
 * return the wrong shape, a $match that misses a nested field, a $slice off by one)
 * without needing a mongod process.
 *
 * What it does NOT prove: index usage, and the handful of operators where mingo and
 * the real server could differ. Run the app against the Docker MongoDB for that.
 */

import { Aggregator } from 'mingo';
import 'mingo/init/system';

import {
  lotFacetPipeline,
  pipelineBoardPipeline,
  recentActivityPipeline,
} from '../src/server/dashboard/pipelines';
import {
  buildWindow,
  shapeActivity,
  shapeAlerts,
  shapeBoard,
  shapeSummary,
  type ActivityRow,
  type BoardBucket,
  type LotFacetResult,
} from '../src/server/dashboard/queries';
import {
  activityResponseSchema,
  alertsResponseSchema,
  pipelineResponseSchema,
  summaryResponseSchema,
} from '../src/types/dashboard';

const DAY = 86_400_000;
const NOW = new Date('2026-09-18T12:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);

/* ------------------------------------------------------------------ asserts */

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}\n      expected ${e}\n      actual   ${a}`);
    console.log(`  ✗ ${label}  expected ${e}, got ${a}`);
  }
}

/* ----------------------------------------------------------------- fixtures */

function lot(over: Record<string, unknown>) {
  return {
    _id: over._id,
    lotReference: 'LOT-X',
    namingCode: null,
    dateReceived: ago(1),
    stage: 'intake',
    stageEnteredAt: ago(1),
    quantity: 10,
    format: 'photo',
    mediaSubtype: 'Print — Print',
    decision: { overrideStatus: 'none' },
    digitization: { expectedFileCount: 0, foundFileCount: 0, masterBytes: 0 },
    mls: { duplicatesFound: 0, taggedCount: 0 },
    return: { status: 'not_requested', format: 'none', dueAt: null, method: null },
    discard: { reason: null },
    ...over,
  };
}

const LOTS = [
  lot({ _id: 'L1', stage: 'intake', dateReceived: ago(1), stageEnteredAt: ago(1) }),
  lot({ _id: 'L2', stage: 'intake', dateReceived: ago(3), stageEnteredAt: ago(3) }),

  lot({ _id: 'L3', stage: 'decision', dateReceived: ago(20), stageEnteredAt: ago(11) }),
  lot({ _id: 'L4', stage: 'decision', dateReceived: ago(15), stageEnteredAt: ago(6) }),
  lot({
    _id: 'L5', stage: 'decision', dateReceived: ago(10), stageEnteredAt: ago(2),
    decision: { overrideStatus: 'requested' },
  }),

  lot({
    _id: 'L6', stage: 'scanning', dateReceived: ago(40), stageEnteredAt: ago(12),
    digitization: { expectedFileCount: 100, foundFileCount: 40, masterBytes: 0 },
    return: { status: 'pending', format: 'both', dueAt: ago(2), method: null },
  }),
  lot({
    _id: 'L7', stage: 'scanning', dateReceived: ago(25), stageEnteredAt: ago(3),
    digitization: { expectedFileCount: 200, foundFileCount: 200, masterBytes: 0 },
  }),

  lot({
    _id: 'L8', stage: 'mls_tag', dateReceived: ago(45), stageEnteredAt: ago(2),
    mls: { duplicatesFound: 2, taggedCount: 5 },
    return: { status: 'pending', format: 'digital', dueAt: ahead(10), method: null },
  }),

  lot({
    _id: 'L9', stage: 'storage', dateReceived: ago(70), stageEnteredAt: ago(5),
    digitization: { expectedFileCount: 0, foundFileCount: 0, masterBytes: 2e12 },
  }),
  lot({
    _id: 'L10', stage: 'storage', dateReceived: ago(400), stageEnteredAt: ago(200),
    digitization: { expectedFileCount: 0, foundFileCount: 0, masterBytes: 3e12 },
  }),

  lot({
    _id: 'L11', stage: 'returned', dateReceived: ago(100), stageEnteredAt: ago(10),
    return: { status: 'returned', format: 'physical', dueAt: ago(20), method: 'Courier' },
  }),
  lot({ _id: 'L12', stage: 'discarded', dateReceived: ago(150), stageEnteredAt: ago(40) }),
];

const ACTIVITY = [
  { _id: 'A1', kind: 'scan_completed', title: 'Scan completed', detail: '200 of 200 files matched', lotCode: 'NEG-MUM-014', actorName: 'H. Patel', at: ago(0) },
  { _id: 'A2', kind: 'mls_duplicate_flagged', title: 'MLS duplicate flagged', detail: 'Held for Lead review', lotCode: 'NEG-MUM-014', actorName: 'System', at: ago(1) },
  { _id: 'A3', kind: 'intake_created', title: 'Intake created', detail: '120 prints', lotCode: 'LOT-2026-0214', actorName: 'M. Patel', at: ago(2) },
];

/* -------------------------------------------------------------------- runs */

function run<T>(pipeline: Record<string, unknown>[], docs: unknown[]): T[] {
  return new Aggregator(pipeline as never).run(docs as never) as T[];
}

console.log('\nRunning dashboard pipelines through a MongoDB query engine (mingo)\n');

const w = buildWindow(NOW);

/* --- 1. the facet pipeline ------------------------------------------------ */

console.log('$facet pipeline over 12 lots');
const facetRows = run<LotFacetResult>(lotFacetPipeline(w), LOTS);
const facet = facetRows[0]!;

check('total lots', facet.totalLots[0]?.n, 12);
check('received in current 30-day window', facet.receivedThisWindow[0]?.n, 6);
check('received in previous 30-day window', facet.receivedPreviousWindow[0]?.n, 2);
check(
  'stage occupancy',
  Object.fromEntries(facet.byStage.map((b) => [b._id, b.n])),
  { intake: 2, decision: 3, scanning: 2, mls_tag: 1, storage: 2, returned: 1, discarded: 1 },
);
check('decisions past the 5-day SLA', facet.decisionOverdue[0]?.n, 2);
check('oldest overdue decision', facet.decisionOverdue[0]?.oldest, ago(11));
check('scans past the 10-day SLA', facet.scanOverdue[0]?.n, 1);
check('items outstanding on stuck scans', facet.scanOverdue[0]?.itemsOutstanding, 60);
check('scan progress expected/found', [facet.scanProgress[0]?.expected, facet.scanProgress[0]?.found], [300, 240]);
check('override requests pending', facet.overridesPending[0]?.n, 1);
check('duplicate lots / duplicates', [facet.mlsDuplicates[0]?.lots, facet.mlsDuplicates[0]?.duplicates], [1, 2]);
check('awaiting MLS tag', facet.awaitingMlsTag[0]?.n, 1);
check('returns pending', facet.returnsPending[0]?.n, 2);
check('returns overdue', facet.returnsOverdue[0]?.n, 1);
check('overdue returns that are physical originals', facet.returnsOverdue[0]?.physicalOriginals, 1);
check('master bytes summed', facet.storage[0]?.bytes, 5e12);

/* --- 2. summary shaping --------------------------------------------------- */

console.log('\nSummary response');
const summary = shapeSummary(facet, w);
const summaryParsed = summaryResponseSchema.safeParse(summary);
check('matches its Zod contract', summaryParsed.success, true);
if (!summaryParsed.success) console.log(JSON.stringify(summaryParsed.error.flatten(), null, 2));

check('active (in-flight) lot count excludes storage', summary.activeLotCount, 8);
check('total lot count', summary.totalLotCount, 12);
check('storage meter', [summary.storage.usedTb, summary.storage.capacityTb], [5, 96]);
const kpi = (k: string) => summary.kpis.find((x) => x.key === k);
check('KPI received value/note', [kpi('received')?.value, kpi('received')?.note], [6, '+4 vs previous 30 days']);
check('KPI awaiting decision', [kpi('awaiting_decision')?.value, kpi('awaiting_decision')?.note], [3, '2 past the 5-day threshold']);
check('KPI in digitization', [kpi('in_digitization')?.value, kpi('in_digitization')?.note], [2, '300 items · 80% scanned']);
check('KPI awaiting MLS tag', [kpi('awaiting_mls_tag')?.value, kpi('awaiting_mls_tag')?.note], [1, '2 duplicates flagged for review']);
check('KPI returns overdue', [kpi('returns_overdue')?.value, kpi('returns_overdue')?.note], [1, 'of 2 returns pending']);

/* --- 3. alerts ------------------------------------------------------------ */

console.log('\nAlerts response');
const alerts = shapeAlerts(facet, w);
check('matches its Zod contract', alertsResponseSchema.safeParse(alerts).success, true);
check('open alert total', alerts.totalOpen, 7);
check(
  'alert counts by key',
  Object.fromEntries(alerts.alerts.map((a) => [a.key, a.count])),
  { decision_overdue: 2, scan_stuck: 1, override_pending: 1, return_overdue: 1, mls_duplicate: 2 },
);
check(
  'oldest-overdue detail is computed, not hardcoded',
  alerts.alerts.find((a) => a.key === 'decision_overdue')?.detail,
  'Receiver / in-charge notified · oldest is day 11',
);

/* --- 4. the pipeline board ------------------------------------------------ */

console.log('\nPipeline board');
const buckets = run<BoardBucket>(pipelineBoardPipeline(w), LOTS);
const board = shapeBoard(buckets, NOW);
check('matches its Zod contract', pipelineResponseSchema.safeParse(board).success, true);
check('board draws eight columns', board.stages.length, 8);
check(
  'counts per column',
  Object.fromEntries(board.stages.map((s) => [s.stage, s.count])),
  { intake: 2, decision: 3, metadata: 0, scanning: 2, mls_tag: 1, storage: 1, returned: 1, discarded: 0 },
);
check('totalActive counts only in-flight stages', board.totalActive, 8);
check(
  'terminal columns are window-scoped (old storage lot excluded)',
  board.stages.find((s) => s.stage === 'storage')?.count,
  1,
);
check(
  'samples are the longest-waiting first, capped at two',
  board.stages.find((s) => s.stage === 'decision')?.samples.map((s) => s.id),
  ['L3', 'L4'],
);
check(
  'scanning sample carries real progress',
  board.stages.find((s) => s.stage === 'scanning')?.samples[0],
  { id: 'L6', code: 'LOT-X', note: '40 / 100 files', noteSeverity: 'neutral', progressPercent: 40 },
);
check(
  'an override on a decision lot surfaces on its card',
  board.stages.find((s) => s.stage === 'decision')?.samples.some((s) => s.note === 'Override requested'),
  false, // L5 is the newest decision lot, so it is not in the top two — correct behaviour
);

/* --- 5. activity ---------------------------------------------------------- */

console.log('\nActivity feed');
const activityRows = run<ActivityRow>(recentActivityPipeline(8), ACTIVITY);
const activity = shapeActivity(activityRows);
check('matches its Zod contract', activityResponseSchema.safeParse(activity).success, true);
check('newest first', activity.entries.map((e) => e.id), ['A1', 'A2', 'A3']);
check(
  'severity is derived from the event kind',
  activity.entries.map((e) => e.severity),
  ['good', 'critical', 'neutral'],
);

/* ------------------------------------------------------------------ verdict */

console.log('');
if (failures.length === 0) {
  console.log(`All ${passed} checks passed.\n`);
  process.exit(0);
} else {
  console.log(`${passed} passed, ${failures.length} FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
