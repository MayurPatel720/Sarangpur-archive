'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { Badge, ErrorState, Panel, PanelHeader } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

function AddToProjectDialog({ lotId, onClose }: { lotId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const projects = useQuery({
    queryKey: queryKeys.projects.list(JSON.stringify({ assignFor: lotId, search })),
    queryFn: () => projectsApi.list(1, 25, search.trim() || undefined),
  });

  const assign = useMutation({
    mutationFn: (project: { id: string; code: string }) => projectsApi.assignLot(project.id, lotId),
    onSuccess: (_data, project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lotProjects(lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success('Lot added to project', project.code);
      onClose();
    },
    onError: (e) => {
      setError(e instanceof ApiRequestError ? e.message : 'Could not add the lot.');
    },
  });

  return (
    <Dialog title="Add to project" subtitle="Only admins can assign lots to projects." onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Field label="Search projects">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name…"
            aria-label="Search projects"
          />
        </Field>
        {projects.isError ? (
          <ErrorState message="Couldn't load projects." onRetry={() => projects.refetch()} />
        ) : null}
        {(projects.data?.rows ?? []).length > 0 ? (
          <ul className="m-0 flex flex-col gap-1.5 p-0 list-none">
            {projects.data?.rows.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-2"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[12.5px] font-semibold text-ink">{p.code}</span>
                  <span className="truncate text-[11.5px] text-ink-3">{p.name}</span>
                </span>
                <span className="ml-auto flex-shrink-0">
                  <PrimaryButton onClick={() => assign.mutate({ id: p.id, code: p.code })} disabled={assign.isPending}>
                    Add
                  </PrimaryButton>
                </span>
              </li>
            ))}
          </ul>
        ) : !projects.isLoading ? (
          <p className="m-0 text-[12.5px] text-ink-3">No projects found.</p>
        ) : null}
        <FormError message={error} />
        <div className="flex justify-end">
          <GhostButton type="button" onClick={onClose}>
            Done
          </GhostButton>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Project chips on the lot overview tab. Everyone with lot access can see them;
 * only admins (project:assign) can attach or detach.
 */
export function LotProjectsSection({ lotId }: { lotId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canAssign = me.data ? me.data.grants.includes('project:assign') : false;
  const [showAdd, setShowAdd] = useState(false);
  const [removeCode, setRemoveCode] = useState<{ id: string; code: string } | null>(null);

  const chips = useQuery({
    queryKey: queryKeys.projects.lotProjects(lotId),
    queryFn: () => lotsApi.projects(lotId),
    enabled: !!me.data,
  });

  const unassign = useMutation({
    mutationFn: (projectId: string) => projectsApi.unassignLot(projectId, lotId),
    onSuccess: (_data) => {
      const code = removeCode?.code ?? '';
      setRemoveCode(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lotProjects(lotId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success('Lot removed from project', code);
    },
    onError: (e) => {
      toast.error('Could not remove lot', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  if (chips.isLoading) return null;
  if (chips.isError) return null;
  const rows = chips.data?.projects ?? [];
  if (rows.length === 0 && !canAssign) return null;

  return (
    <Panel>
      <PanelHeader title="Projects">
        {canAssign ? (
          <span className="ml-auto">
            <GhostButton onClick={() => setShowAdd(true)}>Add to project</GhostButton>
          </span>
        ) : null}
      </PanelHeader>
      <div className="p-3 md:p-4">
        {rows.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {rows.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <Link
                  href={`/projects/${p.id}`}
                  className="no-underline"
                  title={p.name}
                  aria-label={`Open project ${p.code}`}
                >
                  <Badge severity="info">{p.code}</Badge>
                </Link>
                {canAssign ? (
                  <button
                    type="button"
                    onClick={() => setRemoveCode({ id: p.id, code: p.code })}
                    aria-label={`Remove lot from project ${p.code}`}
                    className="cursor-pointer border-0 bg-transparent p-1 text-[12px] text-ink-4 hover:text-ink"
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            ))}
          </span>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-3">This lot is not in any project.</p>
        )}
      </div>
      {showAdd ? <AddToProjectDialog lotId={lotId} onClose={() => setShowAdd(false)} /> : null}
      {removeCode ? (
        <ConfirmDialog
          title={`Remove from ${removeCode.code}?`}
          body="The lot itself is untouched — it just leaves this project."
          confirmLabel="Remove from project"
          pending={unassign.isPending}
          onConfirm={() => unassign.mutate(removeCode.id)}
          onClose={() => setRemoveCode(null)}
        />
      ) : null}
    </Panel>
  );
}
