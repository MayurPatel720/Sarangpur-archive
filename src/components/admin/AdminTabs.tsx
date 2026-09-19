'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Users', href: '/admin/users' },
  { label: 'Roles', href: '/admin/roles' },
  { label: 'Lists', href: '/admin/lists' },
  { label: 'Settings', href: '/admin/settings' },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex gap-1 p-1 bg-rail-control/40 border border-line-soft rounded-[8px] w-full sm:w-auto overflow-x-auto">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`h-9 px-4 rounded-[6px] flex items-center text-[13px] font-semibold whitespace-nowrap transition-colors ${
              active ? 'bg-surface border border-line-strong shadow-control text-ink' : 'text-ink-3 hover:text-ink border border-transparent'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
