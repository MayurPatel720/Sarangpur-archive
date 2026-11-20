'use client';

import { useQuery } from '@tanstack/react-query';
import { itemsGridApi } from '@/lib/api-client';
import { DOC_STAGES, DOC_STAGE_LABELS, docStageOf, type DocStage } from '@/lib/domain';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Panel } from '@/components/ui/primitives';

/**
 * The cycle of a letters lot: Scan & storage, Rewrite, Type, Recheck, Topics, Final edit. Every LETTER has its own stage, so this
 * bar only counts them — how many letters are at each stage. The lot sits at its least advanced letter. Letters are moved from the
 * sheet below: click a stage cell, or tick rows and use "Next stage". Leaving "Scan & storage" needs the letter's code.
 */
export function DocumentStageBar({ lotId, stage }: { lotId: string; stage: string; canEdit?: boolean }) {
  const stages = useReferenceList('stage');
  const grid = useQuery({ queryKey: queryKeys.lots.itemsGrid(lotId), queryFn: () => itemsGridApi.get(lotId) });
  const label = (s: DocStage) => stages.data?.items.find((i) => i.value === s)?.label ?? DOC_STAGE_LABELS[s];
  const at = (DOC_STAGES as readonly string[]).indexOf(stage);
  const letters = (grid.data?.items ?? []).filter((i) => i.format === 'documents');
  const count = new Map<DocStage, number>();
  for (const l of letters) count.set(docStageOf(l.attrs), (count.get(docStageOf(l.attrs)) ?? 0) + 1);

  if (at < 0) return null;
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <ol aria-label="Letter stages" className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-1 gap-y-2 p-0">
          {DOC_STAGES.map((s, i) => {
            const state = i < at ? 'done' : i === at ? 'now' : 'todo';
            const n = count.get(s) ?? 0;
            return (
              <li key={s} className="flex items-center gap-1">
                <span
                  aria-current={state === 'now' ? 'step' : undefined}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold ${
                    state === 'now'
                      ? 'border-accent bg-accent-soft text-accent'
                      : state === 'done'
                        ? 'border-good-line bg-good-bg text-good'
                        : 'border-line bg-surface text-ink-3'
                  }`}
                >
                  <span aria-hidden>{state === 'done' ? '✓' : i + 1}</span>
                  {label(s)}
                  <span className="rounded-full bg-surface px-1.5 text-[11px] font-bold tabular-nums text-ink-2" title={`${n} ${n === 1 ? 'letter is' : 'letters are'} here`}>
                    {n}
                  </span>
                </span>
                {i < DOC_STAGES.length - 1 ? (
                  <span aria-hidden className="text-ink-4">
                    ›
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="m-0 ml-auto max-w-[320px] text-[12px] leading-snug text-ink-3">
          Each letter has its own stage. Click a stage cell in the sheet, or tick letters and use “Next stage”.
        </p>
      </div>
    </Panel>
  );
}
