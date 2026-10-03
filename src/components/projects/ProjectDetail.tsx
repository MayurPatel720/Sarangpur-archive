'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { date, num } from '@/lib/format';
import { STAGE_LABELS } from '@/lib/domain';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUrlPagination } from '@/lib/useUrlPagination';
import {
  Badge,
  Definition,
  ErrorState,
  Meter,
  Panel,
  PanelHeader,
  Skeleton,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { GhostButton, Select } from '@/components/ui/Form';
import { useUserPicker } from '@/hooks/useUserPicker';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import type { ProjectDetailResponse } from '@/types/project';
import type { Severity } from '@/types/dashboard';
import { ProjectFormDialog } from './ProjectFormDialog';
import { AssignLotDialog } from './AssignLotDialog';
import { AddMediaDialog } from './AddMediaDialog';

type LotRow = ProjectDetailResponse['lots']['rows'][number];
type ActivityEntry = ProjectDetailResponse['recentActivity'][number];

const STAGE_SEVERITY: Record<string, Severity> = {
  intake: 'info',
  decision: 'warning',
  metadata: 'info',
  scanning: 'info',
  mls_tag: 'info',
  storage: 'good',
  returned: 'neutral',
  discarded: 'critical',
};

const lotColumns = (stageLabel: (s: string) => string): Column<LotRow>[] => [
  {
    key: 'ref',
    header: 'Lot',
    render: (r) => (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-mono font-semibold text-ink whitespace-nowrap">{r.lotReference}</span>
        {r.namingCode ? (
          <span className="text-[11.5px] text-ink-3 whitespace-nowrap">{r.namingCode}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'owner',
    header: 'Owner',
    render: (r) => <span className="truncate">{r.ownerName || '—'}</span>,
  },
  {
    key: 'assignee',
    header: 'Assignee',
    render: (r) =>
      r.assigneeName ? (
        <span className="whitespace-nowrap">{r.assigneeName}</span>
      ) : (
        <Badge severity="warning">Unassigned</Badge>
      ),
  },
  {
    key: 'media',
    header: 'Media',
    render: (r) => (
      <span className="whitespace-nowrap capitalize">
        {r.format} · {r.quantity}
      </span>
    ),
  },
  {
    key: 'stage',
    header: 'Stage',
    render: (r) => (
      <Badge severity={STAGE_SEVERITY[r.stage] ?? 'neutral'}>{stageLabel(r.stage)}</Badge>
    ),
  },
  {
    key: 'received',
    header: 'Received',
    render: (r) => <span className="whitespace-nowrap">{date(r.dateReceived)}</span>,
  },
];

function ProgressMeters({ progress }: { progress: ProjectDetailResponse['progress'] }) {
  const meters: { label: string; have: number; of: number }[] = [
    { label: 'Items selected', have: progress.selectedItems, of: progress.totalItems },
    { label: 'Items digitized', have: progress.digitizedItems, of: progress.selectedItems },
    { label: 'Items MLS-tagged', have: progress.taggedItems, of: progress.totalItems },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {meters.map((m) => (
        <div key={m.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium text-ink-2">{m.label}</span>
            <span className="text-[12px] font-semibold text-ink">
              {num(m.have)} / {num(m.of)}
            </span>
          </div>
          <Meter percent={m.of > 0 ? Math.round((m.have / m.of) * 100) : 0} severity="info" />
        </div>
      ))}
    </div>
  );
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const stages = useReferenceList('stage');
  const stageLabel = (s: string) =>
    stages.data?.items.find((i) => i.value === s)?.label ??
    STAGE_LABELS[s as keyof typeof STAGE_LABELS] ??
    s;
  const { page, pageSize, setPage, setPageSize } = useUrlPagination(25, 'lots');
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const users = useUserPicker();
  const [removeTarget, setRemoveTarget] = useState<LotRow | null>(null);

  const canView = me.data ? me.data.grants.includes('project:view') : false;
  const canEdit = me.data ? me.data.grants.includes('project:edit') : false;
  const canAssign = me.data ? me.data.grants.includes('project:assign') : false;

  const detail = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectsApi.detail(projectId, page, pageSize),
    enabled: !!me.data && canView,
  });

  const unassign = useMutation({
    mutationFn: (lotId: string) => projectsApi.unassignLot(projectId, lotId),
    onSuccess: (_data, lotId) => {
      const rows = detail.data?.lots.rows ?? [];
      const code = detail.data?.project.code ?? '';
      const row = rows.find((r) => r.id === lotId);
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      toast.success('Lot removed from project', row ? `${row.lotReference} × ${code}` : code);
    },
    onError: (e) => {
      toast.error(
        'Could not remove lot',
        e instanceof ApiRequestError ? e.message : undefined,
      );
    },
  });

  const reassign = useMutation({
    mutationFn: (v: { lotId: string; assigneeId: string | null }) => projectsApi.setAssignee(v.lotId, v.assigneeId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(res.lotId) });
      toast.success(res.assigneeName ? `Assigned to ${res.assigneeName}` : 'Assignee removed');
    },
    onError: (e) => toast.error('Could not change assignee', e instanceof ApiRequestError ? e.message : undefined),
  });

  if (me.isLoading || detail.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Panel>
          <div className="p-4 flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Progress" />
          <div className="p-4"><Skeleton className="h-10 w-full" /></div>
        </Panel>
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
  const totalPages = totalPagesOf(lots.total, lots.pageSize);
  const columns = lotColumns(stageLabel);

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="m-0 font-mono text-[12.5px] font-semibold text-ink-3">{project.code}</p>
            <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
              {project.name}
            </h1>
            {project.description ? (
              <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">{project.description}</p>
            ) : null}
          </div>
          {canEdit ? (
            <div className="sm:ml-auto flex flex-wrap gap-2 flex-shrink-0">
              <GhostButton onClick={() => setShowEdit(true)}>Edit</GhostButton>
              <GhostButton onClick={() => router.push(`/projects/${projectId}/shared`)}>Shared details</GhostButton>
              <GhostButton onClick={() => setShowAddMedia(true)}>Add media</GhostButton>
            </div>
          ) : null}
        </div>
      </header>

      <Panel>
        <PanelHeader title="Details" />
        <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Definition label="Coordinator">{project.coordinatorName ?? '—'}</Definition>
          <Definition label="Lots">{num(project.lotCount)}</Definition>
          <Definition label="Start">{project.startDate ? date(project.startDate) : '—'}</Definition>
          <Definition label="Target">{project.targetDate ? date(project.targetDate) : '—'}</Definition>
          <div className="col-span-2 md:col-span-4">
            <Definition label="Team (assignees)">
              {project.team.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {project.team.map((t) => (
                    <Badge key={t.userId} severity="neutral">
                      {t.userName} · {t.lotCount} {t.lotCount === 1 ? 'lot' : 'lots'}
                    </Badge>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </Definition>
          </div>
        </div>
      </Panel>

      {project.missing.length > 0 ? (
        <div role="note" className="rounded-[8px] border border-line bg-surface-sunken px-3 py-2.5 text-[12.5px] text-ink-2">
          <span className="font-semibold text-ink">Still to fill in: {project.missing.join(', ')}.</span>{' '}
          Assignees can enter these on their lot — they sync to the whole project, and lots can&apos;t leave Intake until
          they&apos;re filled.
          {canEdit ? (
            <>
              {' '}
              <Link href={`/projects/${projectId}/shared`} className="text-accent no-underline hover:underline">
                Fill in now
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <Panel>
        <PanelHeader title="Assignments" />
        <div className="p-3 md:p-4">
          {project.lotsByFormat.length === 0 ? (
            <p className="m-0 text-[12.5px] text-ink-3">No lots yet.</p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {project.lotsByFormat.map((l) => (
                <li
                  key={l.lotId}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_240px] gap-2 sm:gap-3 items-center rounded-[6px] border border-line-soft p-3"
                >
                  <Link href={`/register/${l.lotId}`} className="min-w-0 no-underline">
                    <span className="font-mono text-[12.5px] font-semibold text-ink">{l.lotReference}</span>
                    <span className="text-[12px] text-ink-3 capitalize"> · {l.format} · {num(l.quantity)} items</span>
                  </Link>
                  {canAssign ? (
                    <Select
                      value={l.assigneeId ?? ''}
                      disabled={reassign.isPending}
                      onChange={(e) => reassign.mutate({ lotId: l.lotId, assigneeId: e.target.value || null })}
                      aria-label={`Assignee for ${l.lotReference}`}
                    >
                      <option value="">Unassigned (admin only)</option>
                      {(users.data?.users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-[12.5px] text-ink-2">{l.assigneeName ?? 'Unassigned'}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Progress" />
        <div className="p-3 md:p-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {progress.lotsByStage.length > 0 ? (
              progress.lotsByStage.map((s) => (
                <Badge key={s.stage} severity={STAGE_SEVERITY[s.stage] ?? 'neutral'}>
                  {stageLabel(s.stage)} · {num(s.count)}
                </Badge>
              ))
            ) : (
              <span className="text-[12.5px] text-ink-3">No lots in this project yet.</span>
            )}
          </div>
          <ProgressMeters progress={progress} />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title={`Lots (${num(lots.total)})`}>
          {canAssign ? (
            <span className="ml-auto">
              <GhostButton onClick={() => setShowAssign(true)}>Add lots</GhostButton>
            </span>
          ) : null}
        </PanelHeader>
        <div className="p-3 md:p-4 pb-0">
          <DataTable<LotRow>
            columns={columns}
            rows={lots.rows}
            loading={false}
            emptyMessage="No lots in this project yet."
            getRowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/register/${r.id}`)}
            rowActions={
              canAssign
                ? (r) => (
                    <IconButton
                      label={`Remove ${r.lotReference} from project`}
                      variant="danger"
                      icon="trash"
                      onClick={() => setRemoveTarget(r)}
                    />
                  )
                : undefined
            }
          />
        </div>
        {lots.total > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={lots.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="lots"
          />
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Recent activity" />
        <div className="p-3 md:p-4">
          {recentActivity.length > 0 ? (
            <ul className="m-0 flex flex-col gap-2.5 p-0 list-none">
              {recentActivity.map((a: ActivityEntry) => (
                <li key={a.id} className="flex items-start gap-2.5 text-[12.5px]">
                  <span className="pt-0.5 flex-shrink-0">
                    <Badge severity={a.severity}>{a.kind.replace(/_/g, ' ')}</Badge>
                  </span>
                  <span className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-ink font-medium leading-snug">{a.title}</span>
                    <span className="text-ink-3 text-[11.5px]">
                      {a.actorName} · {date(a.at)}
                      {a.lotCode ? ` · ${a.lotCode}` : ''}
                      {a.projectCode ? ` · ${a.projectCode}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-3">No activity yet.</p>
          )}
          <p className="m-0 mt-3 text-[12px] text-ink-3">
            Full history lives on each lot's activity tab.
          </p>
        </div>
      </Panel>

      <p className="m-0 text-[12.5px]">
        <Link href="/projects" className="text-accent no-underline hover:underline">
          ← All projects
        </Link>
      </p>

      {showEdit ? (
        <ProjectFormDialog project={project} onClose={() => setShowEdit(false)} />
      ) : null}
      {showAssign ? (
        <AssignLotDialog projectId={projectId} projectCode={project.code} onClose={() => setShowAssign(false)} />
      ) : null}
      {showAddMedia ? (
        <AddMediaDialog
          projectId={projectId}
          existingFormats={[...new Set(project.lotsByFormat.map((l) => l.format))]}
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
