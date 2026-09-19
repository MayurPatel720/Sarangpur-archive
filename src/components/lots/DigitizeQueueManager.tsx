'use client';

import { queuesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DigitizeQueueManager() {
  return (
    <QueueTable
      title="Digitization queue"
      subtitle={(total) =>
        total === null
          ? 'Scanning and reconciliation, oldest first'
          : `${total} lot${total === 1 ? '' : 's'} waiting to be scanned · oldest first`
      }
      gate="digitize:view"
      deniedMessage="Digitization queue is restricted."
      deniedHint="You don't have permission to work the digitization queue."
      emptyMessage="The digitization queue is empty — nothing is waiting to be scanned."
      queryKey={(page, pageSize) => queryKeys.queues.digitize(page, pageSize)}
      fetchPage={(page, pageSize) => queuesApi.digitize(page, pageSize)}
    />
  );
}
