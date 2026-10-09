'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { todayIso } from '@/lib/format';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { InlineEditText } from '@/components/tasks/InlineEditText';
import { TaskActivity } from '@/components/tasks/TaskActivity';
import { TaskChecklist } from '@/components/tasks/TaskChecklist';
import { TaskDrawerHeader } from '@/components/tasks/TaskDrawerHeader';
import { TaskProperties } from '@/components/tasks/TaskProperties';
import { TaskStatusBar } from '@/components/tasks/TaskStatusBar';
import type { TaskDetailResponse } from '@/types/task';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Jira-style slide-over for one task. Header: title (admin edits inline), badges, "⋯"
 * menu. Main column: quick status pills, description, checklist, then one merged
 * activity timeline with the comment box. Right column: the property list (admin edits
 * each row in place). Escape or the scrim closes it. Stacks to one column on phones.
 */
export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusError, setStatusError] = useState<string | null>(null);
  const today = todayIso();

  const detail = useQuery({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: () => tasksApi.detail(taskId, today),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** One mutation runner: refetch (so `overdue` is judged against the viewer's today), toast failures. */
  const run = useMutation({
    mutationFn: (fn: () => Promise<TaskDetailResponse>) => fn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
    onError: (e) => {
      toast.error('Could not update the task', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  const data = detail.data;
  const task = data?.task;
  const canEdit = data?.can.edit ?? false;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="Task details">
      <button
        type="button"
        aria-label="Close task"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 border-0 cursor-default"
      />
      <aside className="relative w-full sm:w-[760px] sm:max-w-[calc(100vw-2rem)] h-full overflow-y-auto overflow-x-hidden bg-surface border-l border-line shadow-panel">
        <TaskDrawerHeader
          task={task}
          canEdit={canEdit}
          canCancel={data?.can.cancel ?? false}
          pending={run.isPending}
          onRename={(title) =>
            task && run.mutate(() => (task.personal ? tasksApi.updateMine(task.id, { title }) : tasksApi.update(task.id, { title })))
          }
          onDelete={
            task?.personal && canEdit
              ? () => {
                  void tasksApi
                    .deleteMine(task.id)
                    .then(() => {
                      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
                      onClose();
                    })
                    .catch((e) => toast.error('Could not delete the to-do', e instanceof ApiRequestError ? e.message : undefined));
                }
              : undefined
          }
          onCancelTask={() => task && run.mutate(() => tasksApi.setStatus(task.id, { status: 'cancelled' }))}
          onClose={onClose}
        />

        <div className="px-4 md:px-6 py-4">
          {detail.isError ? (
            <ErrorState
              message={detail.error instanceof Error ? detail.error.message : 'Could not load the task.'}
              onRetry={() => void detail.refetch()}
            />
          ) : !data || !task ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-6 md:gap-8">
              <div className="flex flex-col gap-5 min-w-0">
                {task.status === 'blocked' && task.blockedReason ? (
                  <div className="px-3 py-2.5 bg-danger-bg border border-danger-line rounded-[6px] text-[12.5px] text-danger">
                    <span className="font-semibold">Blocked: </span>
                    {task.blockedReason}
                  </div>
                ) : null}

                <TaskStatusBar
                  status={task.status}
                  canChange={data.can.changeStatus}
                  pending={run.isPending}
                  error={statusError}
                  onChange={(status, blockedReason) => {
                    setStatusError(null);
                    run.mutate(() => tasksApi.setStatus(task.id, { status, blockedReason }), {
                      onError: (e) => setStatusError(e instanceof ApiRequestError ? e.message : 'Could not change status.'),
                    });
                  }}
                />

                {canEdit || task.description ? (
                  <Section title="Description">
                    <div className="text-[13px] text-ink-2">
                      <InlineEditText
                        value={task.description ?? ''}
                        canEdit={canEdit}
                        multiline
                        allowEmpty
                        maxLength={2000}
                        placeholder="Add a description…"
                        ariaLabel="Task description"
                        onSave={(description) =>
                          run.mutate(() =>
                            task.personal ? tasksApi.updateMine(task.id, { description }) : tasksApi.update(task.id, { description }),
                          )
                        }
                      />
                    </div>
                  </Section>
                ) : null}

                <Section title="Checklist">
                  <TaskChecklist
                    items={task.checklist}
                    canEdit={data.can.changeStatus}
                    pending={run.isPending}
                    onSave={(items) => run.mutate(() => tasksApi.setChecklist(task.id, { items }))}
                  />
                </Section>

                <Section title="Activity">
                  <TaskActivity
                    taskId={task.id}
                    comments={task.comments}
                    history={data.history}
                    canComment={data.can.changeStatus || data.can.edit}
                    pending={run.isPending}
                    onPost={(body, reset) => run.mutate(() => tasksApi.comment(task.id, body), { onSuccess: reset })}
                  />
                </Section>
              </div>

              <aside className="min-w-0 md:border-l md:border-line-soft md:pl-6 border-t border-line-soft pt-4 md:border-t-0 md:pt-0">
                <TaskProperties
                  task={task}
                  canEdit={canEdit}
                  pending={run.isPending}
                  onUpdate={(body) =>
                    run.mutate(() =>
                      task.personal
                        ? tasksApi.updateMine(task.id, { priority: body.priority, dueDate: body.dueDate })
                        : tasksApi.update(task.id, body),
                    )
                  }
                />
              </aside>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
