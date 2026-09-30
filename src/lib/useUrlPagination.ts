'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-backed page / pageSize. Deep-linkable, survives refresh, and keeps other
 * search params (filters) intact. Requires a Suspense boundary above the caller.
 *
 * `prefix` namespaces the params (e.g. `itemsPage`) for pages that host two
 * paginated lists at once — the lot record shows Items and Activity together,
 * and they must not fight over the same `?page=`.
 */
export function useUrlPagination(defaultPageSize = 25, prefix = '') {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageKey = prefix ? `${prefix}Page` : 'page';
  const sizeKey = prefix ? `${prefix}PageSize` : 'pageSize';

  const pageRaw = Number(searchParams.get(pageKey) ?? '1');
  const sizeRaw = Number(searchParams.get(sizeKey) ?? String(defaultPageSize));
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
        if (next <= 1) p.delete(pageKey);
        else p.set(pageKey, String(next));
      });
    },
    [replace, pageKey],
  );

  const setPageSize = useCallback(
    (next: number) => {
      replace((p) => {
        if (next === defaultPageSize) p.delete(sizeKey);
        else p.set(sizeKey, String(next));
        p.delete(pageKey);
      });
    },
    [replace, defaultPageSize, pageKey, sizeKey],
  );

  const resetPage = useCallback(() => {
    replace((p) => {
      p.delete(pageKey);
    });
  }, [replace, pageKey]);

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
