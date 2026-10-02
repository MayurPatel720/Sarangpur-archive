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
  awaiting_decision: '/queues/decision',
  in_digitization: '/queues/digitize',
  awaiting_mls_tag: '/queues/mls',
  returns_pending: '/queues/returns',
  returns_overdue: '/queues/returns',
  discarded: '/queues/discards',
};

export const ALERT_HREF: Record<string, string> = {
  decision_overdue: '/queues/decision',
  scan_stuck: '/queues/digitize',
  override_pending: '/queues/decision',
  return_overdue: '/queues/returns',
  mls_duplicate: '/queues/mls',
};
