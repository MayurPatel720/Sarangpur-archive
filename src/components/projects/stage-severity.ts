import type { Severity } from '@/types/dashboard';

/** Badge tone per lot stage, shared by the project page's table and progress card. */
export const STAGE_SEVERITY: Record<string, Severity> = {
  intake: 'info',
  decision: 'warning',
  metadata: 'info',
  scanning: 'info',
  mls_tag: 'info',
  storage: 'good',
  returned: 'neutral',
  discarded: 'critical',
};
