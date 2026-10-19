/**
 * The Excel Decision columns → one result per item. Pure (shared by the server, the
 * grid and the verify script).
 *
 *   digital / redigital / discard — each Yes, No or unanswered (null).
 *
 *   undecided   any of the three still unanswered
 *   archive     digital or redigital = Yes — the item is digitized. discard may ALSO be Yes:
 *               digitize first, then the physical copy is thrown out
 *   discard     discard = Yes with neither digital nor redigital — discarded, never digitized
 *   physical    all three No — keep the physical item only
 */

export type Tri = boolean | null;
export type ItemResult = 'archive' | 'discard' | 'physical';

export interface ItemAnswers {
  digital: Tri;
  redigital: Tri;
  discard: Tri;
}

export function itemResultOf(a: ItemAnswers): ItemResult | null {
  if (a.digital === null || a.redigital === null || a.discard === null) return null;
  if (a.digital || a.redigital) return 'archive';
  if (a.discard) return 'discard';
  return 'physical';
}

/**
 * Formats that can never be digitized (Prasadi is a physical holy item). Their items are
 * created already decided as "keep physical" — Digital, Redigital and Discard all No — so the
 * lot is not held up waiting for answers nobody can give. Null for every other format.
 */
export const PHYSICAL_ONLY_FORMATS: readonly string[] = ['prasadi'];

export function autoDecisionFields(format: string): {
  selectedForDigitization: false;
  decision: { digital: false; redigital: false; discard: false; disposition: null; verdict: 'return_or_discard' };
} | null {
  if (!PHYSICAL_ONLY_FORMATS.includes(format)) return null;
  return {
    selectedForDigitization: false,
    decision: { digital: false, redigital: false, discard: false, disposition: null, verdict: 'return_or_discard' },
  };
}

/**
 * Photo and video lines entered as Data type "Digital" already exist as files, so their items
 * start with the Decision "Digital" answer = Yes. Redigital and Discard stay blank: they are still
 * the team's call, and an item counts as decided only once all three are answered. "Physical" and
 * "Physical + Digital" lines, and every other format, are left alone.
 */
export const BORN_DIGITAL_FORMATS: readonly string[] = ['photo', 'video'];

export function bornDigitalFields(format: string, dataType: string): { decision: { digital: true } } | null {
  return BORN_DIGITAL_FORMATS.includes(format) && dataType === 'digital' ? { decision: { digital: true } } : null;
}

/** True when the item is to be digitized (decided and digital or redigital = Yes). */
export const isDigitize = (a: ItemAnswers): boolean => itemResultOf(a) === 'archive';
