'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';

/**
 * New project: just a name and a description. A project only groups lots — add existing lots, or create
 * new ones with the same intake form, from the project page afterwards.
 */
export function ProjectWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => projectsApi.create({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success('Project created', `${res.code} — now add lots to it.`);
      router.push(`/projects/${res.id}`);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not create the project.'),
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="New project" />
        <div className="p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      </Panel>
    );
  }
  if (!me.data?.grants.includes('project:create')) {
    return (
      <Panel>
        <ErrorState message="You can't create projects." hint="Ask an admin for the project:create permission." />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader title="New project" />
      <form
        className="p-3 md:p-4 flex flex-col gap-4 max-w-[640px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError('Give the project a name.');
            return;
          }
          setError(null);
          create.mutate();
        }}
      >
        <FormError message={error} />
        <Field label="Name" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dwarka camp digitization"
            maxLength={160}
            autoFocus
            aria-label="Project name"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this project covers…"
            rows={3}
            aria-label="Project description"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </PrimaryButton>
          <GhostButton onClick={() => router.push('/register?tab=projects')} disabled={create.isPending}>
            Cancel
          </GhostButton>
        </div>
      </form>
    </Panel>
  );
}
