'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DECISION_LABELS, FORMAT_LABELS, type Decision, type Format } from '@/lib/domain';
import { num } from '@/lib/format';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Badge, Meter, Panel, PanelHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { GhostButton, Select } from '@/components/ui/Form';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import type { Severity } from '@/types/dashboard';
import type { ProjectDetailResponse, ProjectLotRow } from '@/types/project';
import { STAGE_SEVERITY } from './stage-severity';

const DECISION_SEVERITY: Record<string, Severity> = {
  pending: 'warning',
  archive: 'good',
  return: 'neutral',
  discard: 'critical',
};

const prettify = (v: string) => v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function MiniBar({ label, have, of }: { label: string; have: number; of: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[132px]">
      <span className="w-[44px] flex-shrink-0 text-[11px] text-ink-3">{label}</span>
      <Meter percent={of > 0 ? (have / of) * 100 : 0} className="flex-1" />
      <span className="w-[56px] flex-shrink-0 text-right text-[11px] tnum text-ink-2">
        {num(have)}/{num(of)}
      </span>
    </div>
  );
}

/**
 * One row per member lot: what it is, who has it, where it is and how far along. Replaces
 * the old Assignments and Lots panels. Admins (project:assign) can change the assignee
 * inline, add lots and remove them; everyone else sees plain text.
 */
export function ProjectLotsTable({
  lots,
  page,
  pageSize,
  canAssign,
  stageLabel,
  onPageChange,
  onPageSizeChange,
  onAddLots,
  onRemove,
}: {
  lots: ProjectDetailResponse['lots'];
  page: number;
  pageSize: number;
  canAssign: boolean;
  stageLabel: (stage: string) => string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAddLots: () => void;
  onRemove: (row: ProjectLotRow) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();

  const reassign = useMutation({
    mutationFn: (v: { lotId: string; assigneeId: string | null }) => projectsApi.setAssignee(v.lotId, v.assigneeId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(res.lotId) });
      toast.success(res.assigneeName ? `Assigned to ${res.assigneeName}` : 'Assignee removed');
    },
    onError: (e) => toast.error('Could not change assignee', e instanceof ApiRequestError ? e.message : undefined),
  });

  const columns: Column<ProjectLotRow>[] = [
    {
      key: 'lot',
      header: 'Lot',
      render: (r) => (
        <span className="flex flex-col gap-0.5 min-w-0">
          <Link
            href={`/register/${r.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono font-semibold text-ink no-underline hover:underline whitespace-nowrap"
          >
            {r.lotReference}
          </Link>
          {r.namingCode ? <span className="text-[11.5px] text-ink-3 whitespace-nowrap">{r.namingCode}</span> : null}
        </span>
      ),
    },
    {
      key: 'format',
      header: 'Format',
      render: (r) => <span className="whitespace-nowrap">{FORMAT_LABELS[r.format as Format] ?? prettify(r.format)}</span>,
    },
    {
      key: 'media',
      header: 'Media',
      render: (r) => (
        <span className="text-ink-2 break-words">
          {r.mediaLines.map((l) => `${l.mediaSubtype} × ${num(l.quantity)}`).join(', ')}
        </span>
      ),
    },
    { key: 'items', header: 'Items', className: 'tnum', render: (r) => num(r.quantity) },
    {
      key: 'stage',
      header: 'Stage',
      render: (r) => <Badge severity={STAGE_SEVERITY[r.stage] ?? 'neutral'}>{stageLabel(r.stage)}</Badge>,
    },
    {
      key: 'decision',
      header: 'Decision',
      render: (r) => <Badge severity={DECISION_SEVERITY[r.decision] ?? 'neutral'}>{DECISION_LABELS[r.decision as Decision] ?? prettify(r.decision)}</Badge>,
    },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (r) =>
        canAssign ? (
          <span
            className="block min-w-[150px]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Select
              value={r.assigneeId ?? ''}
              disabled={reassign.isPending}
              onChange={(e) => reassign.mutate({ lotId: r.id, assigneeId: e.target.value || null })}
              aria-label={`Assignee for ${r.lotReference}`}
            >
              <option value="">Unassigned (admin only)</option>
              {(users.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </span>
        ) : r.assigneeName ? (
          <span className="whitespace-nowrap">{r.assigneeName}</span>
        ) : (
          <Badge severity="warning">Unassigned</Badge>
        ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <MiniBar label="Scanned" have={r.scanned} of={r.scanTarget} />
          <MiniBar label="Tagged" have={r.tagged} of={r.quantity} />
        </div>
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader title={`Lots (${num(lots.total)})`}>
        {canAssign ? (
          <span className="ml-auto">
            <GhostButton onClick={onAddLots}>Add lots</GhostButton>
          </span>
        ) : null}
      </PanelHeader>
      <div className="p-3 md:p-4 pb-0">
        <DataTable<ProjectLotRow>
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
                    onClick={() => onRemove(r)}
                  />
                )
              : undefined
          }
        />
      </div>
      {lots.total > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPagesOf(lots.total, lots.pageSize)}
          total={lots.total}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          label="lots"
        />
      ) : null}
    </Panel>
  );
}
