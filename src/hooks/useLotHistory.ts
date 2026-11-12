'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, historyApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/ui/Toast';
import type { HistoryActionBody, HistoryActionResponse } from '@/types/history';

/**
 * Undo / redo / restore / saved versions of one lot's Excel (see src/server/lots/history.ts).
 * `run` sends an action; when somebody changed a cell since, nothing is written and `conflict` holds
 * the cells, so the screen can offer "Undo the rest".
 */
export function useLotHistory(lotId: string, enabled = true) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: queryKeys.lots.history(lotId), queryFn: () => historyApi.list(lotId), enabled });
  const [conflict, setConflict] = useState<{ body: HistoryActionBody; res: HistoryActionResponse } | null>(null);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lots.history(lotId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
  }, [queryClient, lotId]);

  const act = useMutation({
    mutationFn: (body: HistoryActionBody) => historyApi.act(lotId, body),
    onSuccess: (res, body) => {
      refreshAll();
      if (!res.done && res.conflicts.length > 0) {
        setConflict({ body, res });
        return;
      }
      setConflict(null);
      if (body.action === 'saveVersion') toast.success('Version saved', res.label);
      else toast.success(res.label, [res.applied > 0 ? `${res.applied} ${res.applied === 1 ? 'row' : 'rows'} changed` : '', ...res.notes].filter(Boolean).join(' · ') || undefined);
    },
    onError: (e) => {
      refreshAll();
      toast.error('Could not do that', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  const run = useCallback((body: HistoryActionBody) => act.mutateAsync(body).catch(() => null), [act]);

  return {
    list,
    data: list.data,
    pending: act.isPending,
    run,
    undo: () => run({ action: 'undo' }),
    redo: () => run({ action: 'redo' }),
    conflict,
    clearConflict: () => setConflict(null),
    /** "Undo the rest": send the same action again, skipping the cells that changed. */
    skipConflicts: () => (conflict ? run({ ...conflict.body, skipConflicts: true }) : Promise.resolve(null)),
    refreshAll,
  };
}

export type LotHistory = ReturnType<typeof useLotHistory>;
