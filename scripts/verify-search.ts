/**
 * Unit tests for register + global-palette text search
 * (src/server/lots/queries.ts). Hand-computed expectations over the pure
 * helpers — tokenizing, per-token $or clauses, id-clause merges and the
 * `matchedVia` lot-side check — without needing a mongod process.
 *
 * Run: npm run verify:search (also part of `npm run verify`).
 */
import {
  buildLotFilter,
  buildTokenClauses,
  escapeRegex,
  LOT_TEXT_FIELDS,
  lotSideMatches,
  lotTextOr,
  mergeTextWithIdClauses,
  tokenizeQuery,
} from '../src/server/lots/queries';

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
    console.log(`  ✗ ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

/* ---------------------------------------------------------- tokenize */

// Multi-word splits; 1-char noise drops; capped at 6 tokens.
check('tokenize splits words', tokenizeQuery('ram mum photo'), ['ram', 'mum', 'photo']);
check('tokenize drops 1-char tokens', tokenizeQuery('a ram b'), ['ram']);
check('tokenize trims + collapses space', tokenizeQuery('  ram   mum  '), ['ram', 'mum']);
check('tokenize empty', tokenizeQuery(''), []);
check('tokenize all-noise', tokenizeQuery('a b c'), []);
check(
  'tokenize caps at 6',
  tokenizeQuery('aa bb cc dd ee ff gg hh').length,
  6,
);

// Regex chars must not leak into patterns.
check('escapeRegex dots/parens', escapeRegex('a.b(c)+'), 'a\\.b\\(c\\)\\+');

/* ------------------------------------------------------------ fields */

// Every textable group is covered; nothing numeric/date/enum sneaks in.
for (const path of [
  'owner.phone',
  'owner.email',
  'pointsOfContact.email',
  'facilitator.phone',
  'originSource',
  'quantityRemarks',
  'conditionNotes',
  'senderRemarks',
  'photoLocation',
  'peopleInPhoto',
  'digitalFilePath',
  'rights.notes',
  'decision.conditionIssue',
  'mls.recordId',
  'mls.tagsApplied',
  'return.trackingReference',
  'discard.notes',
]) {
  check(`field covered: ${path}`, LOT_TEXT_FIELDS.includes(path), true);
}
for (const path of ['quantity', 'stage', 'dateReceived', 'receiver', '_id']) {
  check(`field excluded: ${path}`, LOT_TEXT_FIELDS.includes(path), false);
}

// One clause per field, case-insensitive contains.
const clauses = lotTextOr('mum');
check('lotTextOr length = field count', clauses.length, LOT_TEXT_FIELDS.length);
check('lotTextOr first clause shape', clauses[0], { lotReference: /mum/i });
check(
  'lotTextOr escapes input',
  (clauses[0]!['lotReference'] as RegExp).source,
  new RegExp(escapeRegex('mum'), 'i').source,
);

/* ------------------------------------------------------------- build */

// Single token → one $or; multi token → AND of $ors; noise → no text filter.
const single = buildLotFilter({ q: 'mum' });
check(
  'single token uses $or',
  Array.isArray(single.$or) ? (single.$or as unknown[]).length : -1,
  LOT_TEXT_FIELDS.length,
);
check('single token has no $and', '$and' in single, false);

const multi = buildLotFilter({ q: 'ram mum' });
check('two tokens use $and', Array.isArray(multi.$and) ? (multi.$and as unknown[]).length : -1, 2);
check('two tokens have no top $or', '$or' in multi, false);

const noise = buildLotFilter({ q: 'a' });
check('noise-only query has no text filter', '$or' in noise || '$and' in noise, false);

// Chips survive alongside text.
const chips = buildLotFilter({ q: 'mum', stage: 'decision', format: 'photo' });
check('chips preserved with text', [chips.stage, chips.format], ['decision', 'photo']);
check('chips keep $and text', Array.isArray(chips.$and), false); // single token → $or
check('chips keep $or text', Array.isArray(chips.$or), true);

// Token builder directly.
check('buildTokenClauses empty', buildTokenClauses(''), []);
check('buildTokenClauses two', buildTokenClauses('ram mum').length, 2);

// Id-clause merges.
check('merge none → null', mergeTextWithIdClauses([], []), null);
check('merge ids only', mergeTextWithIdClauses([], [{ receiver: 1 }]), { receiver: 1 });
check(
  'merge single token + id flattens',
  mergeTextWithIdClauses([{ $or: [{ a: 1 }] }], [{ receiver: 1 }]),
  { $or: [{ a: 1 }, { receiver: 1 }] },
);
const mergedMulti = mergeTextWithIdClauses([{ $or: [{ a: 1 }] }, { $or: [{ b: 1 }] }], [
  { _id: 1 },
]) as { $or: unknown[] };
check('merge multi token + id nests $and', Array.isArray(mergedMulti.$or), true);
check(
  'merge multi token + id first branch is $and',
  '$and' in (mergedMulti.$or[0] as Record<string, unknown>),
  true,
);

/* --------------------------------------------------------- lotSideMatches */

const doc = {
  lotReference: 'LOT-0007',
  namingCode: null,
  originSource: 'mumbai-mandir',
  owner: { name: 'Ram Patel', phone: '+91-98200-11111', email: 'ram@example.org' },
  pointsOfContact: [{ name: 'Mina Shah', phone: '99999', email: '' }],
  facilitator: { name: 'Kaka' },
  format: 'photo',
  dataType: 'physical',
  mediaSubtype: 'negative',
  senderRemarks: 'Diwali function photos',
  photoLocation: 'Mumbai',
  peopleInPhoto: 'Sants at sabha',
  digitization: { folderPath: '/srv/scans/neg' },
  digitalFilePath: null,
  rights: { type: 'gift', deedReference: 'DEED-9', notes: '' },
  decision: { conditionIssue: null, significanceNotes: 'rare murti', mlsMatchPaths: [] },
  mls: { recordId: 'MLS-123', tagsApplied: 'utsav, murti' },
  return: { method: null, trackingReference: 'TRK-5', notes: '', durationText: null },
  discard: { reason: null, notes: null },
};

check('lotSide phone hit', lotSideMatches(doc, '98200'), true);
check('lotSide email hit', lotSideMatches(doc, 'example.org'), true);
check('lotSide photo meta hit', lotSideMatches(doc, 'sabha'), true);
check('lotSide deed hit', lotSideMatches(doc, 'deed-9'), true);
check('lotSide mls tag hit', lotSideMatches(doc, 'utsav'), true);
check('lotSide tracking hit', lotSideMatches(doc, 'trk-5'), true);
check('lotSide miss', lotSideMatches(doc, 'zzzzzz'), false);
// AND-tokens across different fields.
check('lotSide cross-field AND', lotSideMatches(doc, 'ram mumbai'), true);
check('lotSide cross-field AND miss', lotSideMatches(doc, 'ram delhi'), false);
// Regex chars are literal.
check('lotSide regex chars literal', lotSideMatches(doc, 'ram('), false);
check('lotSide noise-only matches (no filter)', lotSideMatches(doc, 'a'), true);

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) process.exit(1);
