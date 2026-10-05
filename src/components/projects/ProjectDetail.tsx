'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { STAGE_LABELS } from '@/lib/domain';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUrlPagination } from '@/lib/useUrlPagination';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { ProjectLotRow } from '@/types/project';
import { ProjectFormDialog } from './ProjectFormDialog';
import { AssignLotDialog } from './AssignLotDialog';
import { AddMediaDialog } from './AddMediaDialog';
import { ProjectHeader } from './ProjectHeader';
import { ProjectKpis } from './ProjectKpis';
import { ProjectInfoCard } from './ProjectInfoCard';
import { ProjectLotsTable } from './ProjectLotsTable';
import { ProjectTasksCard } from './ProjectTasksCard';
import { ProjectProgressCard } from './ProjectProgressCard';
import { ProjectActivityCard } from './ProjectActivityCard';

function SectionSkeleton({ title, height = 'h-24' }: { title: string; height?: string }) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <div className="p-4">
        <Skeleton className={`${height} w-full`} />
      </div>
    </Panel>
  );
}

/** Thin composer: loads the project, owns dialog state, and lays the sections out in order. */
export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const stages = useReferenceList('stage');
  const origins = useReferenceList('originSource');
  const stageLabel = (s: string) =>
    stages.data?.items.find((i) => i.value === s)?.label ?? STAGE_LABELS[s as keyof typeof STAGE_LABELS] ?? s;
  const originLabel = (v: string) => origins.data?.items.find((i) => i.value === v)?.label ?? v;
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25, 'lots');
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectLotRow | null>(null);

  const grants = me.data?.grants ?? [];
  const canView = grants.includes('project:view');
  const canEdit = grants.includes('project:edit');
  const canAssign = grants.includes('project:assign');
  const canViewTasks = grants.includes('task:view');
  const canAssignTasks = grants.includes('task:assign');

  const detail = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectsApi.detail(projectId, page, pageSize),
    enabled: !!me.data && canView,
  });
  // Same cache entry as the tasks card, so the KPI tile costs no extra request.
  const projectTasks = useProjectTasks(projectId, !!me.data && canViewTasks);

  const unassign = useMutation({
    mutationFn: (lotId: string) => projectsApi.unassignLot(projectId, lotId),
    onSuccess: (_data, lotId) => {
      const row = detail.data?.lots.rows.find((r) => r.id === lotId);
      const code = detail.data?.project.code ?? '';
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      toast.success('Lot removed from project', row ? `${row.lotReference} × ${code}` : code);
    },
    onError: (e) => {
      toast.error('Could not remove lot', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  if (me.isLoading || detail.isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-5" aria-label="Loading project">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[88px] w-full" />
          ))}
        </div>
        <SectionSkeleton title="Project information" />
        <SectionSkeleton title="Lots" height="h-40" />
        <SectionSkeleton title="Progress by stage" height="h-16" />
      </div>
    );
  }

  if (!canView) {
    return (
      <Panel>
        <ErrorState
          message="You don't have access to projects."
          hint="Ask an admin for the project:view permission."
        />
      </Panel>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Panel>
        <ErrorState
          message="Couldn't load this project."
          hint="It may have been deleted, or check your connection."
          onRetry={() => detail.refetch()}
        />
      </Panel>
    );
  }

  const { project, progress, lots, recentActivity } = detail.data;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <ProjectHeader
        project={project}
        canEdit={canEdit}
        onEdit={() => setShowEdit(true)}
        onShared={() => router.push(`/projects/${projectId}/shared`)}
        onAddMedia={() => setShowAddMedia(true)}
      />

      <ProjectKpis
        project={project}
        progress={progress}
        tasks={!canViewTasks ? undefined : projectTasks.query.data ? projectTasks.counts : null}
      />

      <ProjectInfoCard projectId={projectId} shared={project.shared} canEdit={canEdit} originLabel={originLabel} />

      <ProjectLotsTable
        lots={lots}
        page={page}
        pageSize={pageSize}
        canAssign={canAssign}
        stageLabel={stageLabel}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onAddLots={() => setShowAssign(true)}
        onRemove={setRemoveTarget}
      />

      {canViewTasks ? (
        <ProjectTasksCard projectId={projectId} projectCode={project.code} canAssign={canAssignTasks} />
      ) : null}

      <ProjectProgressCard progress={progress} stageLabel={stageLabel} />

      <ProjectActivityCard activity={recentActivity} />

      <p className="m-0 text-[12.5px]">
        <Link href="/register?tab=projects" className="text-accent no-underline hover:underline">
          ← All projects
        </Link>
      </p>

      {showEdit ? <ProjectFormDialog project={project} onClose={() => setShowEdit(false)} /> : null}
      {showAssign ? (
        <AssignLotDialog projectId={projectId} projectCode={project.code} onClose={() => setShowAssign(false)} />
      ) : null}
      {showAddMedia ? (
        <AddMediaDialog
          projectId={projectId}
          existingFormats={[...new Set(project.lotsByFormat.map((l) => l.format))]}
          existingLots={project.lotsByFormat.map((l) => ({ format: l.format, assigneeName: l.assigneeName }))}
          onClose={() => setShowAddMedia(false)}
        />
      ) : null}
      {removeTarget ? (
        <ConfirmDialog
          title={`Remove ${removeTarget.lotReference}?`}
          body={`This removes the lot from ${project.code}. The lot itself is untouched.`}
          confirmLabel="Remove from project"
          pending={unassign.isPending}
          onConfirm={() => unassign.mutate(removeTarget.id)}
          onClose={() => setRemoveTarget(null)}
        />
      ) : null}
    </div>
  );
}
