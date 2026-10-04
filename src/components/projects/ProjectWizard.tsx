'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useUserPicker } from '@/hooks/useUserPicker';
import { useReferenceList } from '@/hooks/useReferenceList';
import { todayDmy } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { focusEditableCell } from '@/components/ui/EditableTable';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import { useToast } from '@/components/ui/Toast';
import { Stepper } from '@/components/lots/Stepper';
import {
  ConditionStep,
  EMPTY_LINE,
  MediaStep,
  OriginContactsStep,
  ReviewSummary,
  RightsSection,
  buildMediaLines,
  buildSharedFields,
  emptyDraft,
  isLineErrorKey,
  totalQuantity,
  useIntakeDraft,
  validateMedia,
  validateOrigin,
  type FieldErrors,
  type StepCtx,
} from '@/components/lots/intake-steps';

/**
 * New-project wizard — the intake form plus a project step in front and an
 * assignment step at the end. Only the project name and the media
 * quantities are required; everything else may be filled in later by the people
 * the lots are assigned to, and syncs back here.
 */
const STEPS = [
  { label: 'Project' },
  { label: 'Origin & contacts' },
  { label: 'Condition & notes' },
  { label: 'Media & quantities' },
  { label: 'Assign & review' },
] as const;
const S_PROJECT = 0;
const S_ORIGIN = 1;
const S_CONDITION = 2;
const S_MEDIA = 3;
const S_ASSIGN = 4;

const INTROS: readonly (string | null)[] = [
  'Name the project. Its code is assigned automatically.',
  'Optional here — anything left blank is filled in by the assignees and shared across the project.',
  'Optional here — condition on arrival, why it was sent, and any return request.',
  null,
  'Pick who takes each lot, then review. Rights are optional.',
];

export function ProjectWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('project:create') : false;
  const users = useUserPicker();
  const formats = useReferenceList('format');

  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() => ({
    ...emptyDraft(EMPTY_LINE, ''),
    // Project mode: no pre-filled receipt date — the assignee records the real one.
    dateReceived: '',
  }));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [step, setStep] = useState(0);
  const [stepsDone, setStepsDone] = useState<boolean[]>(() => STEPS.map(() => false));
  const [formError, setFormError] = useState<string | null>(null);
  const markDone = (i: number, done: boolean) =>
    setStepsDone((prev) => (prev[i] === done ? prev : prev.map((v, k) => (k === i ? done : v))));

  const ctx: StepCtx = {
    mode: 'project',
    draft,
    patch,
    errors: fieldErrors,
    clearPrefix,
    newRowId,
  };

  /** One child lot per format — the groups shown in the assign step. */
  const groups = useMemo(() => {
    const map = new Map<string, { format: string; lines: number; quantity: number; subtypes: string[] }>();
    for (const l of draft.lines) {
      const g = map.get(l.format) ?? { format: l.format, lines: 0, quantity: 0, subtypes: [] };
      g.lines += 1;
      const q = Number(l.quantity);
      g.quantity += Number.isInteger(q) && q > 0 ? q : 0;
      if (l.mediaSubtype.trim() && !g.subtypes.includes(l.mediaSubtype.trim())) g.subtypes.push(l.mediaSubtype.trim());
      map.set(l.format, g);
    }
    return [...map.values()];
  }, [draft.lines]);
  const formatLabel = (f: string) => formats.data?.items.find((i) => i.value === f)?.label ?? f;
  const userOptions = users.data?.users ?? [];

  const create = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(coordinatorId ? { coordinatorId } : {}),
        shared: buildSharedFields(draft),
        mediaLines: buildMediaLines(draft),
        assignments: groups
          .filter((g) => assignees[g.format])
          .map((g) => ({ format: g.format, assigneeId: assignees[g.format]! })),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      toast.success('Project created', `${res.code} · ${res.lots.length} ${res.lots.length === 1 ? 'lot' : 'lots'}`);
      router.push(`/projects/${res.id}`);
    },
    onError: (e) => {
      setFormError(e instanceof ApiRequestError ? e.message : 'Could not create the project.');
    },
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="New project" />
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      </Panel>
    );
  }
  if (!can) {
    return (
      <Panel>
        <ErrorState
          message="Only admins can create projects."
          hint="Ask an admin for the project:create permission."
        />
      </Panel>
    );
  }

  const validateProject = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!name.trim()) errs['project.name'] = 'Project name is required.';
    return errs;
  };

  const applyErrors = (errs: FieldErrors, deferFocus = false): boolean => {
    const keys = Object.keys(errs);
    if (keys.length === 0) {
      setFieldErrors({});
      setFormError(null);
      return true;
    }
    setFieldErrors(errs);
    setFormError(keys.length > 1 ? `${keys.length} fields need attention.` : null);
    const focusFirst = () => focusEditableCell(keys[0]!);
    if (deferFocus) setTimeout(focusFirst, 0);
    else focusFirst();
    return false;
  };

  const validateStep = (i: number): boolean => {
    if (i === S_PROJECT) return applyErrors(validateProject());
    if (i === S_ORIGIN) return applyErrors(validateOrigin(draft, 'project'));
    if (i === S_MEDIA) return applyErrors(validateMedia(draft));
    return applyErrors({});
  };
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const goNext = () => {
    if (!validateStep(step)) return markDone(step, false);
    markDone(step, true);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollTop();
  };
  const goBack = () => {
    setFieldErrors({});
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  };
  const jumpTo = (i: number) => {
    if (i === step) return;
    if (!validateStep(step)) return markDone(step, false);
    markDone(step, true);
    setFieldErrors({});
    setFormError(null);
    setStep(i);
    scrollTop();
  };

  const submit = () => {
    const errs: FieldErrors = { ...validateProject(), ...validateOrigin(draft, 'project'), ...validateMedia(draft) };
    const keys = Object.keys(errs);
    if (keys.length > 0) {
      const first = keys[0]!;
      const target = first.startsWith('project.') ? S_PROJECT : isLineErrorKey(first) ? S_MEDIA : S_ORIGIN;
      markDone(target, false);
      const changed = target !== step;
      if (changed) {
        setStep(target);
        scrollTop();
      }
      applyErrors(errs, changed);
      return;
    }
    setFormError(null);
    create.mutate();
  };

  const applyBulk = () => {
    if (!bulkAssignee) return;
    setAssignees(Object.fromEntries(groups.map((g) => [g.format, bulkAssignee])));
  };

  return (
    <Panel>
      <PanelHeader title="New project" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} done={stepsDone} onJump={jumpTo} />
        {INTROS[step] ? <p className="m-0 -mt-3 text-[12.5px] text-ink-3 max-w-[72ch]">{INTROS[step]}</p> : null}
        <FormError message={formError} />

        {step === S_PROJECT ? (
          <StepBlocks>
            <FormSection legend="Project">
              <div>
                <Field label="Name" required error={fieldErrors['project.name']}>
                  <TextInput
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearPrefix('project.name');
                    }}
                    placeholder="Dwarka camp digitization"
                    maxLength={160}
                    aria-label="Project name"
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this project covers…"
                    rows={3}
                    aria-label="Project description"
                  />
                </Field>
              </div>
            </FormSection>
          </StepBlocks>
        ) : null}

        {step === S_ORIGIN ? <OriginContactsStep ctx={ctx} /> : null}
        {step === S_CONDITION ? <ConditionStep ctx={ctx} /> : null}
        {step === S_MEDIA ? <MediaStep ctx={ctx} /> : null}

        {step === S_ASSIGN ? (
          <StepBlocks>
            <RightsSection ctx={ctx} />

            <FormSection legend="Coordinator (optional)">
              <div className="max-w-[420px]">
                <Field label="Coordinator">
                  <Select value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)} aria-label="Project coordinator">
                    <option value="">No coordinator</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </FormSection>

            <FormSection
              legend="Assign lots"
              description="One lot is created per format. The assignee owns that lot end to end — only they and admins can change it. Leave a lot unassigned to assign it later."
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-[6px] border border-line-soft bg-surface-sunken p-3">
                  <div className="flex-1 min-w-0">
                    <Field label="Assign all to one person">
                      <Select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} aria-label="Assign every lot to">
                        <option value="">Choose a person…</option>
                        {userOptions.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <GhostButton type="button" onClick={applyBulk} disabled={!bulkAssignee}>
                    Apply to all
                  </GhostButton>
                </div>

                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {groups.map((g) => (
                    <li
                      key={g.format}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_240px] gap-2 sm:gap-3 items-center rounded-[6px] border border-line-soft p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-ink">
                          {formatLabel(g.format)} lot · {g.quantity} items
                        </div>
                        <div className="text-[11.5px] text-ink-3 truncate">
                          {g.subtypes.length ? g.subtypes.join(', ') : 'No sub-type yet'}
                          {g.lines > 1 ? ` · ${g.lines} rows` : ''}
                        </div>
                      </div>
                      <Select
                        value={assignees[g.format] ?? ''}
                        onChange={(e) => setAssignees((prev) => ({ ...prev, [g.format]: e.target.value }))}
                        aria-label={`Assignee for the ${formatLabel(g.format)} lot`}
                      >
                        <option value="">Unassigned (admin only)</option>
                        {userOptions.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
            </FormSection>

            <FormSection legend="Review">
              <div className="mb-3 rounded-[6px] border border-line-soft p-3 text-[13px]">
                <span className="text-ink">{name.trim() || '—'}</span>
                <div className="text-[12px] text-ink-3 mt-0.5">
                  {totalQuantity(draft.lines)} items → {groups.length} {groups.length === 1 ? 'lot' : 'lots'}
                </div>
              </div>
              <ReviewSummary
                mode="project"
                draft={draft}
                steps={{ origin: S_ORIGIN, condition: S_CONDITION, media: S_MEDIA }}
                onJump={jumpTo}
              />
            </FormSection>
          </StepBlocks>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line-soft">
          {step > 0 ? (
            <GhostButton disabled={create.isPending} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton disabled={create.isPending} onClick={() => router.push('/projects')}>
              Cancel
            </GhostButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={goNext}>Next</PrimaryButton>
            ) : (
              <PrimaryButton disabled={create.isPending} onClick={submit}>
                {create.isPending ? 'Creating…' : 'Create project'}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
