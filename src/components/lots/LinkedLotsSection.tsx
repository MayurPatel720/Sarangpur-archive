'use client';

import Link from 'next/link';
import { useReferenceList } from '@/hooks/useReferenceList';
import { FORMAT_LABELS, STAGE_LABELS, type Format, type Stage } from '@/lib/domain';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import type { LotDetailResponse } from '@/types/lot';

type DetailLot = LotDetailResponse['lot'];

/**
 * The other lots saved together with this one from one intake form (one lot per media format). A
 * standalone lot has no parent project to list its siblings, so each of them shows the others here.
 */
export function LinkedLotsSection({ lot }: { lot: DetailLot }) {
  const stages = useReferenceList('stage');
  const stageLabel = (s: string) => stages.data?.items.find((i) => i.value === s)?.label ?? STAGE_LABELS[s as Stage] ?? s;
  if (lot.linkedLots.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title={`Linked lots (${lot.linkedLots.length})`} />
      <div className="p-3 md:p-4 flex flex-col gap-2">
        <p className="m-0 text-[12.5px] text-ink-3">Saved together with this lot from the same intake form.</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {lot.linkedLots.map((l) => (
            <li key={l.id}>
              <Link
                href={`/register/${l.id}`}
                className="flex items-center gap-2 rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-2 no-underline hover:bg-accent-soft"
              >
                <span className="font-mono text-[12.5px] font-semibold text-accent">{l.lotReference}</span>
                <span className="text-[12px] text-ink-3">{FORMAT_LABELS[l.format as Format] ?? l.format}</span>
                <span className="ml-auto">
                  <Badge severity="info">{stageLabel(l.stage)}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
