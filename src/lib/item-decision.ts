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

/** True when the item is to be digitized (decided and digital or redigital = Yes). */
export const isDigitize = (a: ItemAnswers): boolean => itemResultOf(a) === 'archive';
