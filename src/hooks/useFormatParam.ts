'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FORMATS, type Format } from '@/lib/domain';

function asFormat(raw: string | null | undefined): Format | undefined {
  if (!raw) return undefined;
  return (FORMATS as readonly string[]).includes(raw) ? (raw as Format) : undefined;
}

/**
 * `?format=` from the URL, validated against FORMATS; undefined = global scope.
 * Queue pages render their manager inside Suspense, which is what
 * useSearchParams requires during the initial render.
 */
export function useFormatParam(): Format | undefined {
  return asFormat(useSearchParams().get('format'));
}

/**
 * The active format block anywhere in the shell: `?format=` when present,
 * otherwise the `/dashboard/[format]` path segment. Validated against FORMATS;
 * undefined = global scope (picker, unscoped pages).
 *
 * Header wraps its usage in a local Suspense boundary (layouts render Header
 * outside Suspense); Sidebar already sits behind the layout's boundary.
 */
export function useFormatContext(): Format | undefined {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const fromQuery = asFormat(searchParams.get('format'));
  if (fromQuery) return fromQuery;

  const match = /^\/dashboard\/([^/?#]+)/.exec(pathname ?? '');
  return match ? asFormat(match[1]) : undefined;
}
