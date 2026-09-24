import type { Stage } from '@/lib/domain';
import type { ReturnStatus } from '@/lib/domain';
import type { Permission } from '@/server/permissions';
import { listLots } from '@/server/lots/queries';
import type { LotListQuery, LotListResponse } from '@/types/lot';
import { HttpError } from '@/lib/api';
import { activeValuesWithFlag } from '@/server/reference/runtime';

/**
 * Queue definitions (API.md §6). Five screens, one shared shape: each queue is
 * a stage filter (or return-status filter) plus FIFO sort over the register.
 */
interface QueueConfig {
  stage?: Stage;
  /** The returns queue filters on open return.status values, not stage. */
  returnStatus?: ReturnStatus[] | 'open';
  viewPermission: Permission;
  /** Oldest-waiting first — queues are worked FIFO. */
  sort: LotListQuery['sort'];
}

const QUEUES: Record<string, QueueConfig> = {
  decision: { stage: 'decision', viewPermission: 'decision:view', sort: 'stageEnteredAt' },
  digitize: { stage: 'scanning', viewPermission: 'digitize:view', sort: 'stageEnteredAt' },
  mls: { stage: 'mls_tag', viewPermission: 'mls:view', sort: 'stageEnteredAt' },
  returns: { returnStatus: 'open', viewPermission: 'returns:view', sort: 'stageEnteredAt' },
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

  let returnStatus: ReturnStatus[] | undefined;
  if (config.returnStatus === 'open') {
    const open = await activeValuesWithFlag('returnStatus', 'open');
    returnStatus = (open.length > 0 ? open : ['pending', 'in_progress']) as ReturnStatus[];
  } else if (config.returnStatus) {
    returnStatus = config.returnStatus;
  }

  return listLots({
    page,
    pageSize,
    sort: config.sort,
    ...(config.stage ? { stage: config.stage } : {}),
    ...(returnStatus ? { returnStatus } : {}),
  });
}
