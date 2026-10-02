'use client';

import { queuesApi } from '@/lib/api-client';
import { FORMAT_LABELS } from '@/lib/domain';
import { useFormatParam } from '@/hooks/useFormatParam';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DigitizeQueueManager() {
  const format = useFormatParam();
  const scope = format ? ` · ${FORMAT_LABELS[format]}` : '';

  return (
    <QueueTable
      title="Digitization queue"
      subtitle={(total) =>
        total === null
          ? `Scanning and reconciliation, oldest first${scope}`
          : `${total} lot${total === 1 ? '' : 's'} waiting to be scanned · oldest first${scope}`
      }
      gate="digitize:view"
      deniedMessage="Digitization queue is restricted."
      deniedHint="You don't have permission to work the digitization queue."
      emptyMessage="The digitization queue is empty — nothing is waiting to be scanned."
      queryKey={(page, pageSize) => queryKeys.queues.digitize(page, pageSize, format)}
      fetchPage={(page, pageSize) => queuesApi.digitize(page, pageSize, format)}
    />
  );
}
