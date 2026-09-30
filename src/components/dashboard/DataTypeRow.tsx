import Link from 'next/link';
import { IconBox, IconDatabase } from '@/components/ui/icons';
import { Panel } from '@/components/ui/primitives';

/**
 * Data-type shortcut row. Links land on the Master List pre-filtered by
 * dataType (see RegisterManager initialDataType) — the same deep-link
 * pattern the pipeline board uses for stages.
 */
const CELLS = [
  {
    label: 'Physical originals',
    hint: 'Prints, negatives, tapes on hand',
    href: '/register?dataType=physical',
    Icon: IconBox,
  },
  {
    label: 'Digital arrivals',
    hint: 'Files received on drive / link',
    href: '/register?dataType=digital',
    Icon: IconDatabase,
  },
] as const;

export function DataTypeRow() {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-3.5">
      {CELLS.map(({ label, hint, href, Icon }) => (
        <Panel key={href} className="px-4 py-3">
          <Link href={href} className="flex items-center gap-3 no-underline">
            <span className="w-9 h-9 rounded-md bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <Icon size={17} />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold text-ink">{label}</span>
              <span className="text-[11.5px] text-ink-3 truncate">{hint}</span>
            </span>
          </Link>
        </Panel>
      ))}
    </div>
  );
}
