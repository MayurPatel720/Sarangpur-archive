'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { FormSection } from '@/components/ui/FormSection';
import { useToast } from '@/components/ui/Toast';
import {
  ConditionStep,
  OriginContactsStep,
  RightsSection,
  buildSharedFields,
  draftFromShared,
  useIntakeDraft,
  validateOrigin,
  type StepCtx,
} from '@/components/lots/intake-steps';
import { SHARED_KEYS, type ProjectSharedPatch } from '@/types/project';
import type { ProjectDetailResponse } from '@/types/project';

/**
 * One value for the whole project: edit the shared intake details here and the
 * change is written to the project AND every child lot. The same fields are
 * editable from any child lot's "Edit intake record" and sync back here.
 */
export function ProjectSharedEditor({ projectId }: { projectId: string }) {
  const me = useMe();
  const canEdit = me.data ? me.data.grants.includes('project:edit') : false;
  const detail = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectsApi.detail(projectId, 1, 1),
    enabled: !!me.data && canEdit,
  });

  if (me.isLoading || (canEdit && detail.isLoading)) {
    return (
      <Panel>
        <PanelHeader title="Shared details" />
        <div className="p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Panel>
    );
  }
  if (!canEdit) {
    return (
      <Panel>
        <ErrorState message="You can't edit project details." hint="Ask an admin for the project:edit permission." />
      </Panel>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Panel>
        <ErrorState message="Couldn't load this project." onRetry={() => detail.refetch()} />
      </Panel>
    );
  }
  return <Editor projectId={projectId} project={detail.data.project} />;
}

function Editor({
  projectId,
  project,
}: {
  projectId: string;
  project: ProjectDetailResponse['project'];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() =>
    draftFromShared(project.shared, [...new Set(project.lotsByFormat.map((l) => l.format))]),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [draft]);

  const ctx: StepCtx = { mode: 'project', draft, patch, errors: fieldErrors, clearPrefix, newRowId };

  const save = useMutation({
    mutationFn: () => {
      const next = buildSharedFields(draft) as Record<string, unknown>;
      // Every shared key is sent explicitly: a missing value clears it everywhere.
      const body: Record<string, unknown> = {};
      for (const k of SHARED_KEYS) body[k] = next[k] ?? null;
      return projectsApi.update(projectId, { shared: body as ProjectSharedPatch });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      toast.success('Shared details saved', `Applied to ${project.lotCount} ${project.lotCount === 1 ? 'lot' : 'lots'}`);
      router.push(`/projects/${projectId}`);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not save.'),
  });

  const submit = () => {
    const errs = validateOrigin(draft, 'project');
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError(`${Object.keys(errs).length} field(s) need attention.`);
      return;
    }
    save.mutate();
  };

  return (
    <Panel>
      <PanelHeader title={`Shared details · ${project.code}`} />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <p className="m-0 text-[12.5px] text-ink-3 max-w-[72ch]">
          One value for the whole project. Saving updates this project and all {project.lotCount}{' '}
          {project.lotCount === 1 ? 'lot' : 'lots'} in it. Quantities, file paths and labels stay on each lot.
        </p>
        <FormError message={error} />
        <OriginContactsStep ctx={ctx} />
        <div className="border-t border-line-soft pt-4">
          <ConditionStep ctx={ctx} />
        </div>
        <div className="border-t border-line-soft pt-4">
          <RightsSection ctx={ctx} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line-soft">
          <Link href={`/projects/${projectId}`} className="text-[12.5px] text-accent no-underline hover:underline">
            ← Back to project
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <GhostButton disabled={save.isPending} onClick={() => router.push(`/projects/${projectId}`)}>
              Cancel
            </GhostButton>
            <PrimaryButton disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save to all lots'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}
