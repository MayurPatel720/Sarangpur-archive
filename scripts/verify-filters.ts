/**
 * Advanced filters for the lot and project lists: validation of the rows, the Mongo filter built from
 * them (only listed fields and conditions), and the real lists answering with them. Needs a seeded MongoDB.
 *
 *   npm run verify:filters
 */
import './load-env';

import { advancedFilterSchema, isRuleComplete, LOT_FILTER_FIELDS, parseAdvanced, serializeAdvanced } from '../src/lib/advanced-filters';
import { connectToDatabase } from '../src/lib/mongo';
import type { MutationContext } from '../src/lib/api';
import { MASTER_SORTABLE_IDS } from '../src/lib/master-columns';
import { ALL_PERMISSIONS } from '../src/server/permissions';
import { listMasterItems, SORT_PATHS } from '../src/server/lots/master-items';
import { masterQuerySchema } from '../src/types/master';
import { buildLotAdvanced } from '../src/server/filters/advanced';
import { listLots } from '../src/server/lots/queries';
import { listProjects } from '../src/server/projects/queries';
import { lotListQuerySchema } from '../src/types/lot';
import { projectListQuerySchema } from '../src/types/project';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}
async function rejects(label: string, fn: () => Promise<unknown> | unknown, status: number) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (e) {
    check(label, (e as { status?: number }).status === status, (e as Error).message);
  }
}

const adv = (f: unknown) => JSON.stringify(f);

async function main() {
  console.log('rows');
  const rule = (field: string, op: string, value?: string, value2?: string) => ({ field, op, value, value2 });
  check('a text row needs a value, "is empty" does not', !isRuleComplete(rule('owner', 'contains', ''), LOT_FILTER_FIELDS) && isRuleComplete(rule('owner', 'empty'), LOT_FILTER_FIELDS));
  check('between needs both values', !isRuleComplete(rule('quantity', 'between', '5'), LOT_FILTER_FIELDS) && isRuleComplete(rule('quantity', 'between', '5', '9'), LOT_FILTER_FIELDS));
  check('a number row refuses text', !isRuleComplete(rule('quantity', 'gt', 'abc'), LOT_FILTER_FIELDS));
  check('an unknown field or condition is not complete', !isRuleComplete(rule('nope', 'eq', 'x'), LOT_FILTER_FIELDS) && !isRuleComplete(rule('owner', 'gt', '3'), LOT_FILTER_FIELDS));
  check('no more than ten rows', !advancedFilterSchema.safeParse({ match: 'all', rules: Array.from({ length: 11 }, () => rule('owner', 'empty')) }).success);
  check('bad JSON is read as no filter', parseAdvanced('{nope') === null && parseAdvanced('') === null);
  check('incomplete rows are not sent', serializeAdvanced({ match: 'all', rules: [rule('owner', 'contains', '')] }, LOT_FILTER_FIELDS) === '');

  console.log('mongo filter');
  const f1 = buildLotAdvanced({ match: 'all', rules: [rule('owner', 'contains', 'sh.*'), rule('quantity', 'between', '5', '9')] });
  const and1 = (f1 as { $and: Record<string, unknown>[] }).$and;
  check('rows are ANDed, regex input is escaped', and1.length === 2 && (and1[0]!['owner.name'] as RegExp).source === 'sh\\.\\*', and1.map((c) => String(Object.values(c)[0])));
  const f2 = buildLotAdvanced({ match: 'any', rules: [rule('format', 'eq', 'video'), rule('stage', 'neq', 'intake')] });
  check('ANY joins with $or; "is not" on a mixed-format field excludes its lines too', Boolean((f2 as { $or?: unknown[] }).$or) && JSON.stringify(f2).includes('$nor'), f2);
  await rejects('a bad user id is a 400', () => buildLotAdvanced({ match: 'all', rules: [rule('assignee', 'eq', 'zzz')] }), 400);
  await rejects('a bad date is a 400', () => buildLotAdvanced({ match: 'all', rules: [rule('dateReceived', 'on', '2026-13-45')] }), 400);

  console.log('the lists');
  await connectToDatabase();
  const all = await listLots(lotListQuerySchema.parse({ pageSize: 100 }));
  const big = await listLots(lotListQuerySchema.parse({ adv: adv({ match: 'all', rules: [rule('quantity', 'gte', '1')] }) }));
  check('a filter that keeps everything keeps everything', big.total === all.total, [big.total, all.total]);
  const none = await listLots(lotListQuerySchema.parse({ adv: adv({ match: 'all', rules: [rule('lotReference', 'eq', 'NO-SUCH-LOT')] }) }));
  check('a filter that matches nothing returns nothing', none.total === 0);
  const prasadi = await listLots(lotListQuerySchema.parse({ adv: adv({ match: 'all', rules: [rule('format', 'eq', 'prasadi')] }) }));
  check('format filter returns only that format', prasadi.rows.every((r) => r.format === 'prasadi'), prasadi.rows.map((r) => r.format));
  const notPrasadi = await listLots(lotListQuerySchema.parse({ pageSize: 100, adv: adv({ match: 'all', rules: [rule('format', 'neq', 'prasadi')] }) }));
  check('"is not" excludes it', notPrasadi.rows.every((r) => r.format !== 'prasadi') && notPrasadi.total + prasadi.total === all.total, [notPrasadi.total, prasadi.total, all.total]);
  await rejects('a malformed filter is a 400', () => listLots(lotListQuerySchema.parse({ adv: '{nope' })), 400);

  const projects = await listProjects(projectListQuerySchema.parse({ pageSize: 100 }));
  const withLots = await listProjects(projectListQuerySchema.parse({ pageSize: 100, adv: adv({ match: 'all', rules: [rule('lotCount', 'gte', '1')] }) }));
  check('projects: lot count filter', withLots.rows.every((p) => p.lotCount >= 1) && withLots.total <= projects.total);
  const byFormat = await listProjects(projectListQuerySchema.parse({ pageSize: 100, format: 'video' }));
  const viaAdv = await listProjects(projectListQuerySchema.parse({ pageSize: 100, adv: adv({ match: 'all', rules: [rule('lotFormat', 'eq', 'video')] }) }));
  check('projects: the Format dropdown and the advanced "has a lot of format" agree', byFormat.total === viaAdv.total, [byFormat.total, viaAdv.total]);
  const old = await listProjects(projectListQuerySchema.parse({ createdFrom: '2999-01-01' }));
  check('projects: created-from in the far future matches none', old.total === 0);

  console.log('master excel sorting');
  check('every sortable column has a place to sort on', MASTER_SORTABLE_IDS.every((id) => Boolean(SORT_PATHS[id])), MASTER_SORTABLE_IDS.filter((id) => !SORT_PATHS[id]));
  const ctx: MutationContext = { userId: '000000000000000000000001', userName: 'Verifier', roleKey: 'admin', grants: [...ALL_PERMISSIONS] };
  const asc = await listMasterItems(masterQuerySchema.parse({ sort: 'code', dir: 'asc', pageSize: 50 }), ctx);
  const desc = await listMasterItems(masterQuerySchema.parse({ sort: 'code', dir: 'desc', pageSize: 50 }), ctx);
  const codes = (r: { rows: { code: string }[] }) => r.rows.map((x) => x.code);
  const sortedAsc = [...codes(asc)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
  check('sorted by archive code A to Z', JSON.stringify(codes(asc)) === JSON.stringify(sortedAsc), codes(asc).slice(0, 5));
  check('Z to A starts where A to Z ends (for a short list) or differs', asc.total <= 50 ? JSON.stringify(codes(desc)) === JSON.stringify([...codes(asc)].reverse()) : codes(desc)[0] !== codes(asc)[0]);
  const unknown = await listMasterItems(masterQuerySchema.parse({ sort: 'nope', pageSize: 5 }), ctx);
  check('an unknown sort column is ignored, not an error', unknown.rows.length > 0 || unknown.total === 0);

  console.log(failures === 0 ? '\nAll filter checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
