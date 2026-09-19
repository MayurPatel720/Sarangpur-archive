'use client';

import { useQuery } from '@tanstack/react-query';
import { referenceApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Form-dropdown loader for Tier-2 vocabularies. Components offer these options;
 * they never hardcode their own. Retired values are excluded here (the server
 * only returns active items) but keep rendering on old records via
 * `resolveReferenceLabel()`.
 */
export function useReferenceList(key: string) {
  return useQuery({
    queryKey: queryKeys.reference.byKey(key),
    queryFn: () => referenceApi.lookup(key),
    staleTime: 60_000,
  });
}
