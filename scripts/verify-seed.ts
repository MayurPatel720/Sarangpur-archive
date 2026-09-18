/**
 * Proves the whole read path without a database.
 *
 *   npm run verify:seed
 *
 * It does three things:
 *
 *   1. Validates every generated document against the real Mongoose schemas, so enum
 *      violations, missing required fields and bad nested shapes are caught here rather
 *      than as a write error at seed time.
 *   2. Runs the real dashboard aggregation pipelines over those documents using `mingo`,
 *      a MongoDB query-engine implementation.
 *   3. Shapes the results with the real response builders and parses them with the real
 *      Zod contracts, then prints the dashboard exactly as the UI will show it.
 *
 * What it cannot prove: index usage and any operator where mingo and the real server
 * differ. Run the app against the Docker MongoDB for that.
 */

import { Aggregator } from 'mingo';
import 'mingo/init/system';

import { ActivityLog } from '../src/models/ActivityLog';
import { ArchiveLot } from '../src/models/ArchiveLot';
import { LotItem } from '../src/models/LotItem';
import { User } from '../src/models/User';
import {
  lotFacetPipeline,
  pipelineBoardPipeline,
  recentActivityPipeline,
  type Pipeline,
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
import { buildDataset } from './dataset';

const NOW = new Date();
let failures = 0;

function fail(msg: string) {
  failures += 1;
  console.log(`  ✗ ${msg}`);
}
function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function run<T>(pipeline: Pipeline, docs: unknown[]): T[] {
  return new Aggregator(pipeline as never).run(docs as never) as T[];
}

console.log('\nVerifying the generated dataset against the real schemas and pipelines\n');

const { users, lots, items, activity } = buildDataset(NOW);

/* --- 1. schema validation ------------------------------------------------- */

console.log('Schema validation');

function validateAll(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  docs: Record<string, unknown>[],
) {
  const errors: string[] = [];
  for (const doc of docs) {
    const err = new model(doc).validateSync();
    if (err) {
      errors.push(`${String(doc.code ?? doc.lotReference ?? doc.username ?? doc._id)}: ${err.message}`);
      if (errors.length >= 3) break;
    }
  }
  if (errors.length === 0) ok(`${docs.length} ${label} documents valid`);
  else {
    fail(`${label} has invalid documents`);
    for (const e of errors) console.log(`      ${e}`);
  }
}

validateAll('user', User, users);
validateAll('lot', ArchiveLot, lots);
validateAll('item profile', LotItem, items);
validateAll('audit', ActivityLog, activity);

/* --- 2. referential integrity (what MongoDB will not check for you) ------- */

console.log('\nReferential integrity — the checks a foreign key would have given you free');

const userIds = new Set(users.map((u) => String(u._id)));
const lotIds = new Set(lots.map((l) => String(l._id)));

function refsOk(label: string, refs: (unknown | null | undefined)[], valid: Set<string>) {
  const dangling = refs.filter((r) => r !== null && r !== undefined && !valid.has(String(r)));
  if (dangling.length === 0) ok(`${label}: no dangling references`);
  else fail(`${label}: ${dangling.length} dangling references`);
}

refsOk(
  'lot.receiver → users',
  lots.map((l) => l.receiver),
  userIds,
);
refsOk(
  'lot.decision.decidedBy → users',
  lots.map((l) => (l.decision as { decidedBy: unknown }).decidedBy),
  userIds,
);
refsOk(
  'item.lot → lots',
  items.map((i) => i.lot),
  lotIds,
);
refsOk(
  'audit.lot → lots',
  activity.map((a) => a.lot),
  lotIds,
);
refsOk(
  'audit.actor → users',
  activity.map((a) => a.actor),
  userIds,
);

/* --- 3. internal consistency --------------------------------------------- */

console.log('\nInternal consistency');

const badCounts = lots.filter((l) => {
  const d = l.digitization as { expectedFileCount: number; foundFileCount: number };
  return d.foundFileCount > d.expectedFileCount || d.expectedFileCount > (l.quantity as number);
});
if (badCounts.length === 0) ok('found ≤ expected ≤ quantity on every lot');
else fail(`${badCounts.length} lots have impossible counts`);

const badDates = lots.filter(
  (l) => (l.dateReceived as Date).getTime() > (l.stageEnteredAt as Date).getTime(),
);
if (badDates.length === 0) ok('every lot was received before it entered its current stage');
else fail(`${badDates.length} lots entered a stage before they were received`);

const futureAudit = activity.filter((a) => (a.at as Date).getTime() > NOW.getTime());
if (futureAudit.length === 0) ok('no audit entry is dated in the future');
else fail(`${futureAudit.length} audit entries are in the future`);

const dupCodes = items.length - new Set(items.map((i) => i.code)).size;
if (dupCodes === 0) ok('every item code is unique');
else fail(`${dupCodes} duplicate item codes`);

/* --- 4. the pipelines, over the generated data ---------------------------- */

console.log('\nPipelines over the generated archive');

const w = buildWindow(NOW);
const facet = run<LotFacetResult>(lotFacetPipeline(w), lots)[0]!;
const summary = shapeSummary(facet, w);
const alerts = shapeAlerts(facet, w);
const board = shapeBoard(run<BoardBucket>(pipelineBoardPipeline(w), lots), NOW);
const feed = shapeActivity(
  run<ActivityRow>(
    recentActivityPipeline(8),
    [...activity].sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime()),
  ),
);

for (const [label, result] of [
  ['summary', summaryResponseSchema.safeParse(summary)],
  ['alerts', alertsResponseSchema.safeParse(alerts)],
  ['pipeline', pipelineResponseSchema.safeParse(board)],
  ['activity', activityResponseSchema.safeParse(feed)],
] as const) {
  if (result.success) ok(`${label} response satisfies its Zod contract`);
  else {
    fail(`${label} response violates its contract`);
    console.log(JSON.stringify(result.error.flatten(), null, 2));
  }
}

/* --- 5. the numbers the seed was built to produce -------------------------- */

console.log('\nSeeded conditions land where they were designed to');

const expectAlert = (key: string, n: number) => {
  const actual = alerts.alerts.find((a) => a.key === key)?.count ?? 0;
  if (actual === n) ok(`${key} = ${n}`);
  else fail(`${key} = ${actual}, expected ${n}`);
};

expectAlert('decision_overdue', 9);
expectAlert('scan_stuck', 4);
expectAlert('return_overdue', 6);

const totalLots = summary.totalLotCount;
if (totalLots === 1284) ok('1,284 lots on record');
else fail(`${totalLots} lots on record, expected 1284`);

const oldest = alerts.alerts.find((a) => a.key === 'decision_overdue')?.detail ?? '';
if (oldest.endsWith('day 11')) ok('oldest overdue decision is day 11');
else fail(`oldest overdue decision detail was "${oldest}"`);

/* --- 6. print the dashboard ----------------------------------------------- */

console.log('\n' + '─'.repeat(72));
console.log('  DASHBOARD, rendered from the generated archive');
console.log('─'.repeat(72));

console.log(`\n  ${summary.activeLotCount} lots in the pipeline · ${summary.storage.usedTb} TB of ${summary.storage.capacityTb} TB used (${summary.storage.percent}%)\n`);

for (const k of summary.kpis) {
  console.log(`  ${k.label.padEnd(20)} ${String(k.value).padStart(6)}   ${k.note}`);
}

console.log('\n  Pipeline');
for (const s of board.stages) {
  const samples = s.samples.map((x) => x.code).join(', ');
  console.log(`    ${s.label.padEnd(12)} ${String(s.count).padStart(4)}   ${samples}`);
}

console.log(`\n  Alerts (${alerts.totalOpen} open)`);
for (const a of alerts.alerts) {
  console.log(`    ${String(a.count).padStart(4)}  ${a.title}`);
  console.log(`          ${a.detail}`);
}

console.log('\n  Recent activity');
for (const e of feed.entries.slice(0, 6)) {
  console.log(`    ${e.title} · ${e.lotCode}`);
  console.log(`          ${e.actorName} · ${new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')}`);
}

console.log('\n' + '─'.repeat(72));

if (failures === 0) {
  console.log('\nAll checks passed.\n');
  process.exit(0);
} else {
  console.log(`\n${failures} check(s) FAILED.\n`);
  process.exit(1);
}
