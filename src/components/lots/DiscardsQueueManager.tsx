'use client';

import { queuesApi } from '@/lib/api-client';
import { FORMAT_LABELS } from '@/lib/domain';
import { useFormatParam } from '@/hooks/useFormatParam';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DiscardsQueueManager() {
  const format = useFormatParam();
  const scope = format ? ` · ${FORMAT_LABELS[format]}` : '';

  return (
    <QueueTable
      title="Discards"
      subtitle={(total) =>
        total === null
          ? `Confirmed discards, newest decisions first${scope}`
          : `${total} discarded lot${total === 1 ? '' : 's'}${scope}`
      }
      gate="discards:view"
      deniedMessage="Discards list is restricted."
      deniedHint="You don't have permission to view confirmed discards."
      emptyMessage="No confirmed discards."
      queryKey={(page, pageSize) => queryKeys.queues.discards(page, pageSize, format)}
      fetchPage={(page, pageSize) => queuesApi.discards(page, pageSize, format)}
    />
  );
}
