'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { referenceApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { REF_LIST_KEYS, type RefLists } from '@/lib/ref-lists';

/**
 * Loads several admin-managed lists at once (default: every list the Excel's dropdown columns use)
 * and returns them keyed by list key. Uses the same cache keys as `useReferenceList`.
 */
export function useReferenceLists(keys: string[] = REF_LIST_KEYS): { lists: RefLists; ready: boolean } {
  const results = useQueries({
    queries: keys.map((key) => ({
      queryKey: queryKeys.reference.byKey(key),
      queryFn: () => referenceApi.lookup(key),
      staleTime: 60_000,
    })),
  });
  const lists = useMemo(() => {
    const out: RefLists = {};
    keys.forEach((key, i) => {
      const items = results[i]?.data?.items;
      if (items) out[key] = items.map((x) => ({ value: x.value, label: x.label, meta: x.meta as Record<string, unknown> | undefined }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('|'), ...results.map((r) => r.data)]);
  return { lists, ready: results.every((r) => !r.isLoading) };
}
