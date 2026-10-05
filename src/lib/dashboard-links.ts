/** Dashboard drill-down destinations. One map shared by tiles, KPIs and alerts. */

/**
 * Keeps a drill-down inside its format block: appends `?format=x` (or `&format=x`
 * when the target already has a query) so nothing reached from a format dashboard
 * silently falls back to global data.
 */
export function scopedHref(href: string, format?: string): string {
  if (!format) return href;
  return `${href}${href.includes('?') ? '&' : '?'}format=${encodeURIComponent(format)}`;
}

export const KPI_HREF: Record<string, string> = {
  received: '/register',
  awaiting_decision: '/register?stage=decision',
  in_digitization: '/register?stage=scanning',
  awaiting_mls_tag: '/register?stage=mls_tag',
  returns_pending: '/queues/returns',
  returns_overdue: '/queues/returns',
  discarded: '/queues/discards',
};

export const ALERT_HREF: Record<string, string> = {
  decision_overdue: '/register?stage=decision',
  scan_stuck: '/register?stage=scanning',
  override_pending: '/register?stage=decision',
  return_overdue: '/queues/returns',
  mls_duplicate: '/register?stage=mls_tag',
};
