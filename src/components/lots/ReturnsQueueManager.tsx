'use client';

import { queuesApi } from '@/lib/api-client';
import { FORMAT_LABELS } from '@/lib/domain';
import { useFormatParam } from '@/hooks/useFormatParam';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function ReturnsQueueManager() {
  const format = useFormatParam();
  const scope = format ? ` · ${FORMAT_LABELS[format]}` : '';

  return (
    <QueueTable
      title="Returns queue"
      subtitle={(total) =>
        total === null
          ? `Requested and in-progress returns${scope}`
          : `${total} return${total === 1 ? '' : 's'} to work${scope}`
      }
      gate="returns:view"
      deniedMessage="Returns queue is restricted."
      deniedHint="You don't have permission to work the returns queue."
      emptyMessage="The returns queue is empty — no returns are outstanding."
      queryKey={(page, pageSize) => queryKeys.queues.returns(page, pageSize, format)}
      fetchPage={(page, pageSize) => queuesApi.returns(page, pageSize, format)}
      showReturn
    />
  );
}
