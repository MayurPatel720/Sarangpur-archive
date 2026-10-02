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
  /** One answer per active `significance` question, in list order. */
  significanceFlags: readonly boolean[];
}

export function computeVerdict(input: DecisionChecklistInput): Verdict {
  if (input.existsInMls && !input.newCopyIsBetter) return 'return_or_discard';
  if (!input.conditionUsable) return 'return_or_discard';
  if (input.significanceFlags.some(Boolean)) return 'archive';
  return 'return_or_discard';
}

/**
 * Triage union (decision AG Grid): significance is answered once per media
 * sub-type group, not once for the whole lot. The lot-level verdict still runs
 * through `computeVerdict`, so per-group answers are OR-ed — any single
 * criterion met in any group archives exactly as before.
 */
export type SignificanceFlags = readonly boolean[];

export function unionSignificanceFlags(
  groups: readonly SignificanceFlags[],
  count = 0,
): SignificanceFlags {
  const len = Math.max(
    count,
    groups.reduce((m, g) => Math.max(m, g.length), 0),
  );
  const out: boolean[] = Array.from({ length: len }, () => false);
  for (const g of groups) {
    for (let i = 0; i < g.length; i += 1) {
      if (g[i]) out[i] = true;
    }
  }
  return out;
}
