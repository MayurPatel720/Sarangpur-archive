/** Dashboard drill-down destinations. One map shared by tiles, KPIs and alerts. */

export const KPI_HREF: Record<string, string> = {
  received: '/register',
  awaiting_decision: '/queues/decision',
  in_digitization: '/queues/digitize',
  awaiting_mls_tag: '/queues/mls',
  returns_overdue: '/queues/returns',
};

export const ALERT_HREF: Record<string, string> = {
  decision_overdue: '/queues/decision',
  scan_stuck: '/queues/digitize',
  override_pending: '/queues/decision',
  return_overdue: '/queues/returns',
  mls_duplicate: '/queues/mls',
};
