'use client';

import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DiscardsQueueManager() {
  return (
    <QueueTable
      title="Discards"
      subtitle={(total) =>
        total === null
          ? 'Confirmed discards, newest decisions first'
          : `${total} discarded lot${total === 1 ? '' : 's'}`
      }
      gate="discards:view"
      deniedMessage="Discards list is restricted."
      deniedHint="You don't have permission to view confirmed discards."
      emptyMessage="No confirmed discards."
      queryKey={(page, pageSize) => queryKeys.queues.discards(page, pageSize)}
      fetchPage={(page, pageSize) => queuesApi.discards(page, pageSize)}
    />
  );
}
