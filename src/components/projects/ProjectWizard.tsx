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
import {
  cleanReferencePeople,
  validateReferencePeople,
  type ReferencePersonRow,
} from '@/components/lots/lot-form-fields';
import { ProjectPeopleEditor } from './ProjectPeopleEditor';

/**
 * New project: a name, a description and the people involved. A project only groups lots — add existing
 * lots, or create new ones with the same intake form, from the project page afterwards.
 */
export function ProjectWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [people, setPeople] = useState<ReferencePersonRow[]>([]);
  const [peopleErrors, setPeopleErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        referencePeople: cleanReferencePeople(people),
      }),
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
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError('Give the project a name.');
            return;
          }
          const errs = validateReferencePeople(people);
          setPeopleErrors(errs);
          if (Object.keys(errs).length > 0) {
            setError('Fix the highlighted people rows.');
            return;
          }
          setError(null);
          create.mutate();
        }}
      >
        <div className="px-4 pt-4 md:px-5 md:pt-5">
          <p className="m-0 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-3">
            A project groups lots that belong together. Create it here, then add existing lots or create new ones from
            the project page.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 p-4 md:p-5 lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col gap-4">
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
                rows={5}
                aria-label="Project description"
              />
            </Field>
          </div>
          <div className="rounded-[10px] border border-line-soft bg-surface-subtle p-4">
            <ProjectPeopleEditor
              rows={people}
              onChange={setPeople}
              errors={peopleErrors}
              onEdit={(id) =>
                setPeopleErrors((prev) =>
                  Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}.`))),
                )
              }
              hint="Anyone connected to this project, such as the donor, a family member or a contact person."
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3 md:px-5">
          <GhostButton onClick={() => router.push('/register?tab=projects')} disabled={create.isPending}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </PrimaryButton>
        </div>
      </form>
    </Panel>
  );
}
