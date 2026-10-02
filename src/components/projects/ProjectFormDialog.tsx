'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Dialog } from '@/components/ui/Dialog';
import {
  Field,
  FormError,
  GhostButton,
  PrimaryButton,
  Select,
  Textarea,
  TextInput,
} from '@/components/ui/Form';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import type { ProjectDetailResponse, ProjectUpdateBody } from '@/types/project';

type TeamEntry = { userId: string; userName: string; label: string };
type EditTarget = ProjectDetailResponse['project'];

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');
const toApiDate = (input: string): string | null =>
  input ? new Date(`${input}T00:00:00`).toISOString() : null;

export function ProjectFormDialog({
  mode,
  project,
  onClose,
}: {
  mode: 'create' | 'edit';
  project?: EditTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();
  const [code, setCode] = useState(project?.code ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [coordinatorId, setCoordinatorId] = useState(project?.coordinatorId ?? '');
  const [team, setTeam] = useState<TeamEntry[]>(
    (project?.team ?? []).map((t) => ({ userId: t.userId, userName: t.userName, label: t.label ?? '' })),
  );
  const [startDate, setStartDate] = useState(toDateInput(project?.startDate ?? null));
  const [targetDate, setTargetDate] = useState(toDateInput(project?.targetDate ?? null));
  const [teamUser, setTeamUser] = useState('');
  const [teamLabel, setTeamLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return projectsApi.create({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() ? description.trim() : undefined,
          coordinatorId: coordinatorId ? coordinatorId : undefined,
          team: team.map((t) => ({ userId: t.userId, label: t.label.trim() ? t.label.trim() : undefined })),
          startDate: toApiDate(startDate) ?? undefined,
          targetDate: toApiDate(targetDate) ?? undefined,
        });
      }
      const body: ProjectUpdateBody = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        coordinatorId: coordinatorId ? coordinatorId : null,
        team: team.map((t) => ({ userId: t.userId, label: t.label.trim() ? t.label.trim() : undefined })),
        startDate: toApiDate(startDate),
        targetDate: toApiDate(targetDate),
      };
      return projectsApi.update((project as EditTarget).id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success(mode === 'create' ? 'Project created' : 'Project updated', name.trim());
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not save the project.';
      setError(message);
      toast.error(mode === 'create' ? 'Could not create project' : 'Could not update project', message);
    },
  });

  const userOptions = users.data?.users ?? [];
  const addTeamMember = () => {
    if (!teamUser) return;
    if (team.some((t) => t.userId === teamUser)) return;
    const found = userOptions.find((u) => u.id === teamUser);
    if (!found) return;
    setTeam((prev) => [...prev, { userId: found.id, userName: found.name, label: teamLabel.trim() }]);
    setTeamUser('');
    setTeamLabel('');
  };

  const canSubmit = name.trim() !== '' && (mode === 'edit' || code.trim() !== '') && !save.isPending;

  return (
    <Dialog
      title={mode === 'create' ? 'New project' : `Edit ${project?.code ?? ''}`}
      subtitle={
        mode === 'create'
          ? 'The code is unique and can never change — pick it carefully.'
          : 'The project code is immutable and cannot be edited.'
      }
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        {mode === 'create' ? (
          <Field label="Code" required hint="Unique, immutable. e.g. DWARKA-2026.">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="DWARKA-2026"
              maxLength={40}
              aria-label="Project code"
            />
          </Field>
        ) : null}
        <Field label="Name" required>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dwarka camp digitization"
            maxLength={160}
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
        <Field label="Coordinator" hint="Informational — who runs this project.">
          <Select
            value={coordinatorId}
            onChange={(e) => setCoordinatorId(e.target.value)}
            aria-label="Project coordinator"
          >
            <option value="">No coordinator</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-ink-2">Team (informational)</span>
          {team.length > 0 ? (
            <ul className="m-0 flex flex-col gap-1.5 p-0 list-none">
              {team.map((t) => (
                <li
                  key={t.userId}
                  className="flex items-center gap-2 rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="font-semibold text-ink">{t.userName}</span>
                  {t.label ? <span className="text-ink-3">· {t.label}</span> : null}
                  <button
                    type="button"
                    onClick={() => setTeam((prev) => prev.filter((m) => m.userId !== t.userId))}
                    aria-label={`Remove ${t.userName} from team`}
                    className="ml-auto cursor-pointer border-0 bg-transparent p-1 text-ink-4 hover:text-ink"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Select
              value={teamUser}
              onChange={(e) => setTeamUser(e.target.value)}
              aria-label="Team member"
            >
              <option value="">Add a member…</option>
              {userOptions
                .filter((u) => !team.some((t) => t.userId === u.id) && u.id !== coordinatorId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </div>
          {teamUser ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <TextInput
                value={teamLabel}
                onChange={(e) => setTeamLabel(e.target.value)}
                placeholder="Role label (optional)"
                maxLength={60}
                aria-label="Team member role label"
              />
              <GhostButton type="button" onClick={addTeamMember}>
                Add
              </GhostButton>
            </div>
          ) : null}
        </div>
        {mode === 'edit' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <DatePicker value={startDate} onChange={setStartDate} aria-label="Project start date" />
            </Field>
            <Field label="Target date">
              <DatePicker value={targetDate} onChange={setTargetDate} aria-label="Project target date" />
            </Field>
          </div>
        ) : null}
        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {save.isPending ? 'Saving…' : mode === 'create' ? 'Create project' : 'Save changes'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
