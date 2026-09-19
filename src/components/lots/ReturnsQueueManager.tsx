'use client';

import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function ReturnsQueueManager() {
  return (
    <QueueTable
      title="Returns queue"
      subtitle={(total) =>
        total === null
          ? 'Requested and in-progress returns'
          : `${total} return${total === 1 ? '' : 's'} to work`
      }
      gate="returns:view"
      deniedMessage="Returns queue is restricted."
      deniedHint="You don't have permission to work the returns queue."
      emptyMessage="The returns queue is empty — no returns are outstanding."
      queryKey={(page, pageSize) => queryKeys.queues.returns(page, pageSize)}
      fetchPage={(page, pageSize) => queuesApi.returns(page, pageSize)}
      showReturn
    />
  );
}
