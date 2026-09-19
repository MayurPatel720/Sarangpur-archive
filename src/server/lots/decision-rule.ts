/**
 * Server-computed archive verdict (API.md §4). Pure function, zero imports.
 *
 * A bug here has consequences that cannot be undone (a wrongly discarded lot is
 * gone), so the rule lives in exactly one place: the decision route and the
 * unit tests in scripts/verify-decision-rule.ts both call this.
 *
 * Rule order matters — the first matching branch wins:
 * 1. Already in MLS and the new copy is not better → return_or_discard.
 * 2. Condition unusable → return_or_discard.
 * 3. Any significance flag set → archive.
 * 4. Otherwise → return_or_discard (override available).
 */

export type Verdict = 'archive' | 'return_or_discard';

export interface DecisionChecklistInput {
  existsInMls: boolean;
  newCopyIsBetter?: boolean;
  conditionUsable: boolean;
  significanceFlags: readonly [boolean, boolean, boolean, boolean];
}

export function computeVerdict(input: DecisionChecklistInput): Verdict {
  if (input.existsInMls && !input.newCopyIsBetter) return 'return_or_discard';
  if (!input.conditionUsable) return 'return_or_discard';
  if (input.significanceFlags.some(Boolean)) return 'archive';
  return 'return_or_discard';
}
