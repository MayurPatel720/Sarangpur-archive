/**
 * Hand-computed checks for the reconcile pure functions
 * (`src/server/reconcile/parse.ts`, `src/server/reconcile/diff.ts`).
 * Style mirrors `scripts/verify-pipelines.ts`: no database, no test runner —
 * `npm run verify:reconcile` fails loudly on the first mismatch.
 */
import { parseItemCode, normaliseStem } from '../src/server/reconcile/parse';
import { diffReconciliation } from '../src/server/reconcile/diff';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// --- normaliseStem -----------------------------------------------------------
check('lowercase + extension', normaliseStem('neg-mum-072-01-04.tif'), 'NEG-MUM-072-01-04');
check('windows path + spaces', normaliseStem('  \\\\srv\\scans\\NEG-MUM-072-01-04 .JPG  '), 'NEG-MUM-072-01-04');
check('no extension', normaliseStem('NEG-MUM-072-01-04'), 'NEG-MUM-072-01-04');
check('multi-dot keeps last ext', normaliseStem('NEG-MUM-072-01-04.scan.tif'), 'NEG-MUM-072-01-04.SCAN');

// --- parseItemCode ------------------------------------------------------------
check('canonical code', parseItemCode('NEG-MUM-072-01-04'), {
  prefix: 'NEG', origin: 'MUM', seq: '072', groupNo: 1, itemNo: 4,
  itemCode: 'NEG-MUM-072-01-04',
});
check('lowercase filename', parseItemCode('vhs-ahm-003-06-36.mp4')?.itemCode, 'VHS-AHM-003-06-36');
check('unrecognised stem', parseItemCode('thumbs.db'), null);
check('wrong segment sizes', parseItemCode('NEG-MUM-72-1-4'), null);
check('four segments only', parseItemCode('NEG-MUM-072-01'), null);

// --- diffReconciliation -------------------------------------------------------
check('all found', diffReconciliation(['A', 'B'], ['A', 'B']), {
  expected: 2, found: 2, missing: [], unexpected: [],
});
check('partial + stray', diffReconciliation(['A', 'B', 'C'], ['A', 'C', 'Z']), {
  expected: 3, found: 2, missing: ['B'], unexpected: ['Z'],
});
check('empty index', diffReconciliation(['A'], []), {
  expected: 1, found: 0, missing: ['A'], unexpected: [],
});
check('duplicate index rows deduped', diffReconciliation(['A'], ['A', 'A'])?.found, 1);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll reconcile checks passed.');
