'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-backed page / pageSize. Deep-linkable, survives refresh, and keeps other
 * search params (filters) intact. Requires a Suspense boundary above the caller.
 */
export function useUrlPagination(defaultPageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageRaw = Number(searchParams.get('page') ?? '1');
  const sizeRaw = Number(searchParams.get('pageSize') ?? String(defaultPageSize));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1 ? Math.min(100, Math.floor(sizeRaw)) : defaultPageSize;

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      replace((p) => {
        if (next <= 1) p.delete('page');
        else p.set('page', String(next));
      });
    },
    [replace],
  );

  const setPageSize = useCallback(
    (next: number) => {
      replace((p) => {
        if (next === defaultPageSize) p.delete('pageSize');
        else p.set('pageSize', String(next));
        p.delete('page');
      });
    },
    [replace, defaultPageSize],
  );

  const resetPage = useCallback(() => {
    replace((p) => {
      p.delete('page');
    });
  }, [replace]);

  /** Mirror current page/size into params for API + query keys. */
  const apiParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const base: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
        ...extra,
      };
      return base;
    },
    [page, pageSize],
  );

  return useMemo(
    () => ({ page, pageSize, setPage, setPageSize, resetPage, apiParams }),
    [page, pageSize, setPage, setPageSize, resetPage, apiParams],
  );
}
