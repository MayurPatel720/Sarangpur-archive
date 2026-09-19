'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Permission } from '@/server/permissions';

/**
 * UI permission gating. Reads the caller's LIVE grants from `/api/users/me` —
 * never the JWT — so a revoked permission hides its screens on next refetch.
 *
 * `useCan('roles:manage')` for a single gate, `useCanAny([...])` for section
 * links visible to several admin flavours.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.session.me(),
    queryFn: usersApi.me,
    staleTime: 30_000,
  });
}

export function useCan(permission: Permission): boolean {
  const { data } = useMe();
  return data ? data.grants.includes(permission) : false;
}

export function useCanAny(permissions: Permission[]): boolean {
  const { data } = useMe();
  return data ? permissions.some((p) => data.grants.includes(p)) : false;
}
