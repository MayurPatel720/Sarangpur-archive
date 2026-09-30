'use client';

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * Active user names for dropdowns (register Receiver filter). Session-only —
 * any signed-in volunteer can load it; not the admin `/api/users` list.
 */
export function useUserPicker() {
  return useQuery({
    queryKey: queryKeys.session.usersPicker(),
    queryFn: () => usersApi.picker(),
    staleTime: 60_000,
  });
}
