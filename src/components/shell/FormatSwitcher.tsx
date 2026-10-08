'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccessibleFormats, useLastFormat } from '@/hooks/useFormatChoice';
import { useFormatContext } from '@/hooks/useFormatParam';
import { FORMAT_LABELS } from '@/lib/domain';
import { IconChevronDown } from '@/components/ui/icons';

/**
 * Header dropdown: the media formats this user can open (admins see all). Picking one reloads
 * the current page for that format — the dashboard goes to /dashboard/[format]; every other
 * page keeps its filters and just swaps `?format=`. "All formats" clears the scope.
 * Needs a Suspense boundary (useSearchParams).
 */
export function FormatSwitcher() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const formats = useAccessibleFormats();
  const current = useFormatContext();
  useLastFormat(current);

  if (!formats || formats.length === 0) return null;

  const go = (value: string) => {
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
      router.push(value ? `/dashboard/${value}` : '/dashboard');
      return;
    }
    // A single lot belongs to one format — switching from it goes to that format's register.
    const base = /^\/register\/(?!new$)[^/]+$/.test(pathname) ? '/register' : pathname;
    const params = new URLSearchParams(base === pathname ? searchParams.toString() : '');
    if (value) params.set('format', value);
    else params.delete('format');
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${base}?${qs}` : base);
  };

  return (
    <label className="relative flex-shrink-0 z-10">
      <span className="sr-only">Media format</span>
      <select
        value={current ?? ''}
        onChange={(e) => go(e.target.value)}
        className="h-10 appearance-none bg-surface border border-line rounded-[6px] shadow-control pl-3 pr-8 text-[13px] font-semibold text-ink cursor-pointer"
      >
        <option value="">All formats</option>
        {formats.map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>
      <IconChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
    </label>
  );
}
