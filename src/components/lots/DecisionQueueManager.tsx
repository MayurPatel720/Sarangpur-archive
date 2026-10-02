'use client';

import { queuesApi } from '@/lib/api-client';
import { FORMAT_LABELS } from '@/lib/domain';
import { useFormatParam } from '@/hooks/useFormatParam';
import { queryKeys } from '@/lib/query-keys';
import { QueueTable } from './QueueTable';

export function DecisionQueueManager() {
  const format = useFormatParam();
  const scope = format ? ` · ${FORMAT_LABELS[format]}` : '';

  return (
    <QueueTable
      title="Decision queue"
      subtitle={(total) =>
        total === null
          ? `Oldest waiting first${scope}`
          : `Oldest waiting first · ${total} lot${total === 1 ? '' : 's'} awaiting decision${scope}`
      }
      gate="decision:view"
      deniedMessage="Decision queue is restricted."
      deniedHint="You don't have permission to work the decision queue."
      emptyMessage="The decision queue is empty — nothing is waiting."
      queryKey={(page, pageSize) => queryKeys.queues.decision(page, pageSize, format)}
      fetchPage={(page, pageSize) => queuesApi.decision(page, pageSize, format)}
      showDecision
    />
  );
}
