'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-backed tab id (deep-linkable, survives refresh). Keeps other search params.
 * Requires a Suspense boundary above the caller.
 */
export function useUrlTab<T extends string>(allowed: readonly T[], fallback: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('tab');
  const tab = (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;

  const setTab = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete('tab');
      else params.set('tab', next);
      // Tab change is a different view — don't keep the old page offset.
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, fallback],
  );

  return useMemo(() => ({ tab, setTab }), [tab, setTab]);
}
