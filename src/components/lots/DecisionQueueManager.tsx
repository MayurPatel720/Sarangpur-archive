'use client';

import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DecisionQueueManager() {
  return (
    <QueueTable
      title="Decision queue"
      subtitle={(total) =>
        total === null
          ? 'Oldest waiting first'
          : `Oldest waiting first · ${total} lot${total === 1 ? '' : 's'} awaiting decision`
      }
      gate="decision:view"
      deniedMessage="Decision queue is restricted."
      deniedHint="You don't have permission to work the decision queue."
      emptyMessage="The decision queue is empty — nothing is waiting."
      queryKey={(page, pageSize) => queryKeys.queues.decision(page, pageSize)}
      fetchPage={(page, pageSize) => queuesApi.decision(page, pageSize)}
      showDecision
    />
  );
}
