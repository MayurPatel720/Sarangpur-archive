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
import { ReferenceList } from '../src/models/ReferenceList';
import { Role } from '../src/models/Role';
import { Setting } from '../src/models/Setting';
import { checkSystemSafety, PERMISSIONS } from '../src/server/permissions';
import { CATALOG_LIST_KEYS, catalogList } from '../src/lib/vocab-catalog';
import {
  DATA_TYPES,
  DECISIONS,
  DISCARD_REASONS,
  FORMATS,
  NOT_DIGITIZED_REASONS,
  ORIGIN_SOURCES,
  RETURN_FORMATS,
  RETURN_STATUSES,
  SCAN_STATUSES,
  STAGES,
} from '../src/lib/domain';
import { buildGlobalSettings, buildRoles, SEED_REFERENCE_LISTS } from './seed-data';
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
validateAll('role', Role, buildRoles());
validateAll('reference list', ReferenceList, SEED_REFERENCE_LISTS);
validateAll('setting', Setting, [buildGlobalSettings()]);

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

/* --- 3. roles, vocabularies and the lockout invariants ---------------------- */

console.log('\nAccess control seed');

const roles = buildRoles();
const knownGrants = new Set<string>(PERMISSIONS);
const unknownGrants = roles.flatMap((r) =>
  ((r.permissions as string[]) ?? []).filter((g) => !knownGrants.has(g)),
);
if (unknownGrants.length === 0) ok('every seeded grant is a registered permission');
else fail(`unknown grants seeded: ${[...new Set(unknownGrants)].join(', ')}`);

const roleKeys = new Set(roles.map((r) => String(r.key)));
const orphanUsers = users.filter((u) => !roleKeys.has(String(u.role)));
if (orphanUsers.length === 0) ok('every seed user resolves to a seeded role');
else fail(`${orphanUsers.length} seed users reference a missing role`);

const safety = checkSystemSafety(
  roles.map((r) => ({
    key: String(r.key),
    active: r.active as boolean,
    permissions: r.permissions as string[],
  })),
  users.map((u) => ({
    username: String(u.username),
    active: u.active as boolean,
    role: String(u.role),
  })),
);
if (safety.length === 0) ok('lockout invariants hold (managing role + managing user present)');
else {
  fail('lockout invariants violated');
  for (const s of safety) console.log(`      ${s}`);
}

const listKeys = SEED_REFERENCE_LISTS.map((l) => String(l.key));
const mediaSubtypes = ['mediaSubtype.photo', 'mediaSubtype.video', 'mediaSubtype.audio'];
const missingLists = [...mediaSubtypes, 'rightsType'].filter((k) => !listKeys.includes(k));
if (missingLists.length === 0) ok('media sub-type + rights vocabularies seeded');
else fail(`missing vocabularies: ${missingLists.join(', ')}`);

const missingCatalog = CATALOG_LIST_KEYS.filter((k) => !listKeys.includes(k));
if (missingCatalog.length === 0) ok(`all ${CATALOG_LIST_KEYS.length} catalog lists seeded`);
else fail(`missing catalog lists: ${missingCatalog.join(', ')}`);

const listsWithoutPrefixes = mediaSubtypes.filter((k) => {
  const list = SEED_REFERENCE_LISTS.find((l) => l.key === k) as {
    items: { meta: { codePrefix?: unknown } }[];
  };
  return list.items.some((i) => typeof i.meta?.codePrefix !== 'string' || i.meta.codePrefix === '');
});
if (listsWithoutPrefixes.length === 0) ok('every media sub-type carries a codePrefix');
else fail(`sub-types without codePrefix in: ${listsWithoutPrefixes.join(', ')}`);

/* --- 3b. reference-list contract: tier, protected, metaSchema, stage, drift -- */

console.log('\nReference-list contract');

type SeedList = {
  key: string;
  tier?: string;
  protected?: boolean;
  metaSchema?: { field: string; type: string; required: boolean; unique: boolean }[];
  items: { value: string; label: string; active: boolean; meta?: Record<string, unknown> }[];
};

const seedLists = SEED_REFERENCE_LISTS as unknown as SeedList[];

const tierDrift: string[] = [];
for (const seed of seedLists) {
  const cat = catalogList(seed.key);
  if (!cat) {
    tierDrift.push(`${seed.key}: not in catalog`);
    continue;
  }
  if (seed.tier !== cat.tier) tierDrift.push(`${seed.key}: tier ${seed.tier} ≠ ${cat.tier}`);
  if (seed.protected !== cat.protected) tierDrift.push(`${seed.key}: protected mismatch`);
  if (JSON.stringify(seed.metaSchema ?? []) !== JSON.stringify(cat.metaSchema)) {
    tierDrift.push(`${seed.key}: metaSchema mismatch`);
  }
}
if (tierDrift.length === 0) ok('tier / protected / metaSchema match the catalog for every list');
else {
  fail('tier / protected / metaSchema drift vs catalog');
  for (const d of tierDrift) console.log(`      ${d}`);
}

const systemLists = seedLists.filter((l) => l.tier === 'system');
const expectedSystem = ['format', 'stage', 'decision'];
const systemOk =
  systemLists.length === expectedSystem.length &&
  expectedSystem.every((k) => systemLists.some((l) => l.key === k && l.protected === true));
if (systemOk) ok('format, stage and decision are system + protected');
else fail(`system lists are [${systemLists.map((l) => l.key).join(', ')}], expected [${expectedSystem.join(', ')}]`);

const metaConformance: string[] = [];
for (const seed of seedLists) {
  const schema = seed.metaSchema ?? [];
  const known = new Set(schema.map((f) => f.field));
  for (const item of seed.items) {
    const meta = item.meta ?? {};
    for (const field of schema) {
      const raw = meta[field.field];
      const missing = raw === undefined || raw === null || raw === '';
      if (missing && field.required) {
        metaConformance.push(`${seed.key}/${item.value}: missing required '${field.field}'`);
        continue;
      }
      if (missing) continue;
      const okType =
        (field.type === 'string' && typeof raw === 'string') ||
        (field.type === 'number' && typeof raw === 'number' && !Number.isNaN(raw)) ||
        (field.type === 'boolean' && typeof raw === 'boolean');
      if (!okType) metaConformance.push(`${seed.key}/${item.value}: '${field.field}' not ${field.type}`);
      if (field.unique) {
        // uniqueness checked globally below
      }
    }
    for (const k of Object.keys(meta)) {
      if (!known.has(k)) metaConformance.push(`${seed.key}/${item.value}: unknown meta field '${k}'`);
    }
    for (const field of schema.filter((f) => f.unique)) {
      const raw = meta[field.field];
      if (raw === undefined || raw === null || raw === '') continue;
      const dupe = seed.items.find(
        (i) => i !== item && (i.meta ?? {})[field.field] !== undefined && String((i.meta ?? {})[field.field]) === String(raw),
      );
      if (dupe) metaConformance.push(`${seed.key}: '${field.field}' value '${String(raw)}' is not unique`);
    }
  }
}
if (metaConformance.length === 0) ok('every seed item conforms to its list metaSchema');
else {
  fail('seed items violate metaSchema');
  for (const m of metaConformance.slice(0, 10)) console.log(`      ${m}`);
}

const stageList = seedLists.find((l) => l.key === 'stage');
if (!stageList) {
  fail('stage list missing from seed');
} else {
  const active = stageList.items.filter((i) => i.active);
  const terminals = active.filter((i) => i.meta?.terminal === true);
  const boards = active.filter((i) => i.meta?.board === true);
  const roles = active
    .map((i) => String(i.meta?.alertRole ?? ''))
    .filter((r) => r !== '');
  const offGraph = boards.filter((i) => i.meta?.terminal !== true && i.meta?.inFlight !== true);
  const stageProblems: string[] = [];
  if (active.length === 0) stageProblems.push('no active stages');
  if (terminals.length === 0) stageProblems.push('no active terminal stage');
  if (boards.length === 0) stageProblems.push('no active board stage');
  if (offGraph.length > 0) {
    stageProblems.push(`board not in-flight/terminal: ${offGraph.map((i) => i.value).join(', ')}`);
  }
  if (new Set(roles).size !== roles.length) stageProblems.push('alertRole not unique among active');
  if (stageProblems.length === 0) {
    ok('stage invariants hold (active, terminal, board ⊆ inFlight ∪ terminal, unique alertRole)');
  } else {
    fail(`stage invariants: ${stageProblems.join('; ')}`);
  }
}

function seedValues(key: string): string[] {
  const list = seedLists.find((l) => l.key === key);
  return (list?.items ?? []).map((i) => i.value);
}

function assertSameSet(label: string, domain: readonly string[], key: string): void {
  const a = [...domain].sort();
  const b = seedValues(key).sort();
  if (a.length === b.length && a.every((v, i) => v === b[i])) {
    ok(`${label} ↔ catalog '${key}' in sync`);
  } else {
    fail(`${label} drift: domain=[${a.join(', ')}] catalog=[${b.join(', ')}]`);
  }
}

assertSameSet('STAGES', STAGES, 'stage');
assertSameSet('DECISIONS', DECISIONS, 'decision');
assertSameSet('FORMATS', FORMATS, 'format');
assertSameSet('DATA_TYPES', DATA_TYPES, 'dataType');
assertSameSet('ORIGIN_SOURCES', ORIGIN_SOURCES, 'originSource');
assertSameSet('SCAN_STATUSES', SCAN_STATUSES, 'scanStatus');
assertSameSet('RETURN_FORMATS', RETURN_FORMATS, 'returnFormat');
assertSameSet('RETURN_STATUSES', RETURN_STATUSES, 'returnStatus');
assertSameSet('DISCARD_REASONS', DISCARD_REASONS, 'discardReason');
assertSameSet('NOT_DIGITIZED_REASONS', NOT_DIGITIZED_REASONS, 'notDigitizedReason');

/* --- 4. internal consistency ---------------------------------------------- */

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

/* --- 5. the pipelines, over the generated data ----------------------------- */

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

/* --- 6. the numbers the seed was built to produce --------------------------- */

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

/* --- 7. print the dashboard ------------------------------------------------ */

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
