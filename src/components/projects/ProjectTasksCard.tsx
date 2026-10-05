'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiRequestError } from '@/lib/api-client';
import { num } from '@/lib/format';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { GhostButton } from '@/components/ui/Form';
import { AssignTaskDialog } from '@/components/tasks/AssignTaskDialog';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { useProjectTasks } from '@/hooks/useProjectTasks';

const SHOWN = 10;

/**
 * Tasks linked to this project: counts in the header, the ten most pressing as cards
 * (overdue first), the existing drawer on click. The parent only renders it for viewers
 * with task:view; `canAssign` (task:assign) adds the "Assign task" button.
 */
export function ProjectTasksCard({
  projectId,
  projectCode,
  canAssign,
}: {
  projectId: string;
  projectCode: string;
  canAssign: boolean;
}) {
  const { query, counts, sorted } = useProjectTasks(projectId, true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const total = query.data?.total ?? 0;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Tasks">
        {query.data ? (
          <span className="text-[12px] text-ink-3">
            {num(counts.open)} open · {num(counts.overdue)} overdue · {num(counts.done)} done
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3">
          <Link
            href={`/tasks?project=${projectId}`}
            className="text-[12.5px] font-medium text-accent no-underline hover:underline"
          >
            View all{total > SHOWN ? ` (${num(total)})` : ''}
          </Link>
          {canAssign ? (
            <GhostButton className="!h-8 !px-3 text-[12px]" onClick={() => setAssigning(true)}>
              Assign task
            </GhostButton>
          ) : null}
        </span>
      </PanelHeader>

      {query.isError ? (
        <ErrorState
          message={query.error instanceof ApiRequestError ? query.error.message : 'Could not load tasks.'}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data ? (
        <div className="flex flex-col gap-3 p-4" aria-label="Loading tasks">
          <Skeleton className="h-[44px] w-full" />
          <Skeleton className="h-[44px] w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-[13px] font-medium text-ink-3">No tasks for this project yet.</p>
      ) : (
        sorted.slice(0, SHOWN).map((t) => <TaskCard key={t.id} task={t} onOpen={setOpenId} />)
      )}

      {openId ? <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} /> : null}
      {assigning ? (
        <AssignTaskDialog
          defaultProject={{ id: projectId, code: projectCode }}
          onClose={() => setAssigning(false)}
          onCreated={setOpenId}
        />
      ) : null}
    </Panel>
  );
}
