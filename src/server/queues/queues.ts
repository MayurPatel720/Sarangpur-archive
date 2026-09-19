import type { Stage } from '@/lib/domain';
import type { ReturnStatus } from '@/lib/domain';
import type { Permission } from '@/server/permissions';
import { listLots } from '@/server/lots/queries';
import type { LotListQuery, LotListResponse } from '@/types/lot';
import { HttpError } from '@/lib/api';

/**
 * Queue definitions (API.md §6). Five screens, one shared shape: each queue is
 * a stage filter (or return-status filter) plus FIFO sort over the register.
 */
interface QueueConfig {
  stage?: Stage;
  /** The returns queue filters on return.status, not stage. */
  returnStatus?: ReturnStatus[];
  viewPermission: Permission;
  /** Oldest-waiting first — queues are worked FIFO. */
  sort: LotListQuery['sort'];
}

const QUEUES: Record<string, QueueConfig> = {
  decision: { stage: 'decision', viewPermission: 'decision:view', sort: 'stageEnteredAt' },
  digitize: { stage: 'scanning', viewPermission: 'digitize:view', sort: 'stageEnteredAt' },
  mls: { stage: 'mls_tag', viewPermission: 'mls:view', sort: 'stageEnteredAt' },
  returns: { returnStatus: ['pending', 'in_progress'], viewPermission: 'returns:view', sort: 'stageEnteredAt' },
  discards: { stage: 'discarded', viewPermission: 'discards:view', sort: 'stageEnteredAt' },
};

export function queuePermission(key: string): Permission {
  const config = QUEUES[key];
  if (!config) throw new HttpError(404, `Unknown queue '${key}'.`);
  return config.viewPermission;
}

export async function runQueue(
  key: string,
  page: number,
  pageSize: number,
): Promise<LotListResponse> {
  const config = QUEUES[key];
  if (!config) throw new HttpError(404, `Unknown queue '${key}'.`);
  return listLots({
    page,
    pageSize,
    sort: config.sort,
    ...(config.stage ? { stage: config.stage } : {}),
    ...(config.returnStatus ? { returnStatus: config.returnStatus } : {}),
  });
}
