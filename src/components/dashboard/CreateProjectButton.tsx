'use client';

import Link from 'next/link';
import { useCan } from '@/hooks/useCan';
import { IconPlus } from '@/components/ui/icons';

/** "Create project" shortcut for the format picker; renders only with project:create. */
export function CreateProjectButton() {
  const canCreate = useCan('project:create');
  if (!canCreate) return null;
  return (
    <Link
      href="/projects/new"
      className="h-10 px-3.5 bg-accent rounded-[6px] shadow-control text-[13px] font-semibold text-white no-underline flex items-center gap-1.5 w-fit"
    >
      <IconPlus size={15} />
      Create project
    </Link>
  );
}
