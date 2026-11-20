'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { DOC_STAGES, DOC_STAGE_LABELS, stepDocStage, type DocStage } from '@/lib/domain';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { GhostButton, PrimaryButton } from '@/components/ui/Form';
import { Panel } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';

/**
 * The cycle of a letters lot: Scan & storage, Rewrite, Type, Recheck, Topics, Final edit. Shows where the lot is and moves it
 * one step forward or back. Leaving "Scan & storage" needs every letter to have its code (the server says how many are missing).
 */
export function DocumentStageBar({ lotId, stage, canEdit }: { lotId: string; stage: string; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const stages = useReferenceList('stage');
  const label = (s: DocStage) => stages.data?.items.find((i) => i.value === s)?.label ?? DOC_STAGE_LABELS[s];
  const at = (DOC_STAGES as readonly string[]).indexOf(stage);
  const next = stepDocStage(stage, 'next');
  const back = stepDocStage(stage, 'back');

  const move = useMutation({
    mutationFn: (direction: 'next' | 'back') => lotsApi.moveDocStage(lotId, { direction }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      toast.success(`Now at ${r.label}`);
    },
    onError: (e) => toast.error('Could not move the lot', e instanceof ApiRequestError ? e.message : undefined),
  });

  if (at < 0) return null;
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <ol aria-label="Letter stages" className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-1 gap-y-2 p-0">
          {DOC_STAGES.map((s, i) => {
            const state = i < at ? 'done' : i === at ? 'now' : 'todo';
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
        {canEdit ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {back ? (
              <GhostButton onClick={() => move.mutate('back')} disabled={move.isPending}>
                ← Back to {label(back)}
              </GhostButton>
            ) : null}
            {next ? (
              <PrimaryButton onClick={() => move.mutate('next')} disabled={move.isPending}>
                {move.isPending ? 'Moving…' : `Move to ${label(next)} →`}
              </PrimaryButton>
            ) : (
              <span className="text-[12.5px] text-ink-3">This is the last stage.</span>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
