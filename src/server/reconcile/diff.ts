/**
 * Expected-vs-found diff (SPEC §4.5 step 3). Pure, unit-tested in
 * `scripts/verify-reconcile.ts`. Both sides are plain string arrays so the
 * database layer stays thin: callers pull selected item codes and indexed
 * matches, this function anti-joins them.
 */

export interface ReconciliationDiff {
  expected: number;
  found: number;
  /** Selected codes with no indexed file. Capped by the caller for responses. */
  missing: string[];
  /** Indexed codes that are not selected for this lot (possible strays). */
  unexpected: string[];
}

/**
 * Anti-join selected item codes against indexed file matches.
 * Comparison is exact — codes are canonicalised at write time on both sides.
 */
export function diffReconciliation(selectedCodes: string[], foundCodes: string[]): ReconciliationDiff {
  const foundSet = new Set(foundCodes);
  const selectedSet = new Set(selectedCodes);
  return {
    expected: selectedCodes.length,
    found: selectedCodes.filter((code) => foundSet.has(code)).length,
    missing: selectedCodes.filter((code) => !foundSet.has(code)),
    unexpected: [...new Set(foundCodes.filter((code) => !selectedSet.has(code)))],
  };
}
