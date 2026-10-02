/**
 * Unit tests for the server-computed archive verdict
 * (src/server/lots/decision-rule.ts). Hand-computed expectations — a bug here
 * has consequences that cannot be undone, so every branch of the rule is
 * pinned by at least one case, including the branch-order interactions.
 *
 * Run: npm run verify:decision-rule (also part of `npm run verify`).
 */
import { computeVerdict, unionSignificanceFlags, type DecisionChecklistInput } from '../src/server/lots/decision-rule';

interface Case {
  name: string;
  input: DecisionChecklistInput;
  expected: 'archive' | 'return_or_discard';
}

const F = [false, false, false, false] as unknown as [boolean, boolean, boolean, boolean];

const CASES: Case[] = [
  {
    name: 'significant + usable + not in MLS → archive',
    input: { existsInMls: false, conditionUsable: true, significanceFlags: [false, true, false, false] },
    expected: 'archive',
  },
  {
    name: 'nothing significant → return_or_discard',
    input: { existsInMls: false, conditionUsable: true, significanceFlags: F },
    expected: 'return_or_discard',
  },
  {
    name: 'in MLS, new copy not better → return_or_discard even when significant (branch 1 wins)',
    input: { existsInMls: true, newCopyIsBetter: false, conditionUsable: true, significanceFlags: [true, true, true, true] },
    expected: 'return_or_discard',
  },
  {
    name: 'in MLS, new copy better + significant → archive',
    input: { existsInMls: true, newCopyIsBetter: true, conditionUsable: true, significanceFlags: [true, false, false, false] },
    expected: 'archive',
  },
  {
    name: 'in MLS, newCopyIsBetter omitted → treated as not better → return_or_discard',
    input: { existsInMls: true, conditionUsable: true, significanceFlags: [true, false, false, false] },
    expected: 'return_or_discard',
  },
  {
    name: 'condition unusable → return_or_discard even when significant (branch 2 wins)',
    input: { existsInMls: false, conditionUsable: false, significanceFlags: [true, true, false, false] },
    expected: 'return_or_discard',
  },
  {
    name: 'in MLS, new copy better, usable, nothing significant → return_or_discard (fallthrough)',
    input: { existsInMls: true, newCopyIsBetter: true, conditionUsable: true, significanceFlags: F },
    expected: 'return_or_discard',
  },
];

let failures = 0;
for (const c of CASES) {
  const got = computeVerdict(c.input);
  if (got === c.expected) {
    console.log(`PASS  ${c.name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${c.name}: expected ${c.expected}, got ${got}`);
  }
}

if (failures > 0) {
  console.error(`${failures} case(s) failed.`);
  process.exit(1);
}
console.log(`All ${CASES.length} decision-rule cases pass.`);

// Triage union: per-group significance OR-ed into one lot-level tuple.
const UNION_CASES: { name: string; groups: [boolean, boolean, boolean, boolean][]; expected: [boolean, boolean, boolean, boolean] }[] = [
  { name: 'no groups → all false', groups: [], expected: [false, false, false, false] },
  {
    name: 'single group passes through',
    groups: [[false, true, false, false]],
    expected: [false, true, false, false],
  },
  {
    name: 'flags OR across groups',
    groups: [
      [true, false, false, false],
      [false, false, true, false],
      [false, false, false, false],
    ],
    expected: [true, false, true, false],
  },
];

let unionFailures = 0;
for (const c of UNION_CASES) {
  const got = unionSignificanceFlags(c.groups);
  const pass = got.length === 4 && got.every((v, i) => v === c.expected[i]);
  if (pass) {
    console.log(`PASS  ${c.name}`);
  } else {
    unionFailures += 1;
    console.error(`FAIL  ${c.name}: expected ${c.expected}, got ${got}`);
  }
}

if (unionFailures > 0) {
  console.error(`${unionFailures} union case(s) failed.`);
  process.exit(1);
}
console.log(`All ${UNION_CASES.length} significance-union cases pass.`);
