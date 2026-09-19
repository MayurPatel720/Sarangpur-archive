'use client';

import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function MlsQueueManager() {
  return (
    <QueueTable
      title="MLS tagging queue"
      subtitle={(total) =>
        total === null
          ? 'Reconciled lots awaiting manual MLS tagging'
          : `${total} lot${total === 1 ? '' : 's'} awaiting MLS tagging`
      }
      gate="mls:view"
      deniedMessage="MLS tagging queue is restricted."
      deniedHint="You don't have permission to work the MLS tagging queue."
      emptyMessage="The MLS queue is empty — nothing is waiting to be tagged."
      queryKey={(page, pageSize) => queryKeys.queues.mls(page, pageSize)}
      fetchPage={(page, pageSize) => queuesApi.mls(page, pageSize)}
    />
  );
}
