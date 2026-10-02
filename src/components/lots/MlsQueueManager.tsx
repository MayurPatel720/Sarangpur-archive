'use client';

import { queuesApi } from '@/lib/api-client';
import { FORMAT_LABELS } from '@/lib/domain';
import { useFormatParam } from '@/hooks/useFormatParam';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function MlsQueueManager() {
  const format = useFormatParam();
  const scope = format ? ` · ${FORMAT_LABELS[format]}` : '';

  return (
    <QueueTable
      title="MLS tagging queue"
      subtitle={(total) =>
        total === null
          ? `Reconciled lots awaiting manual MLS tagging${scope}`
          : `${total} lot${total === 1 ? '' : 's'} awaiting MLS tagging${scope}`
      }
      gate="mls:view"
      deniedMessage="MLS tagging queue is restricted."
      deniedHint="You don't have permission to work the MLS tagging queue."
      emptyMessage="The MLS queue is empty — nothing is waiting to be tagged."
      queryKey={(page, pageSize) => queryKeys.queues.mls(page, pageSize, format)}
      fetchPage={(page, pageSize) => queuesApi.mls(page, pageSize, format)}
    />
  );
}
