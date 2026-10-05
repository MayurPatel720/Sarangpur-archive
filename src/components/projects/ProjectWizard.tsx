'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useRowAssign } from '@/hooks/useRowAssign';
import { usePhotoUploads } from '@/hooks/usePhotoUploads';
import { buildAssignPayload, formatFromTaskError } from '@/lib/row-assign';
import { todayIso } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { focusEditableCell } from '@/components/ui/EditableTable';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import { useToast } from '@/components/ui/Toast';
import { RowAssignButton } from '@/components/tasks/RowAssignButton';
import { RowAssignDialog } from '@/components/tasks/RowAssignDialog';
import { Stepper } from '@/components/lots/Stepper';
import { ProjectPhotoPicker, type PickedPhoto } from './ProjectPhotoPicker';
import {
  ConditionStep,
  EMPTY_LINE,
  MediaStep,
  OriginContactsStep,
  ReviewSummary,
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
 * New-project wizard in two steps.
 *   1. Project details — project name/description, origin & contacts, and
 *      condition & notes, stacked on one page.
 *   2. Media & review — media quantities, lot assignment
 *      and the review summary, stacked on one page.
 * Only the project name and the media quantities are required; everything else
 * may be filled in later by the people the lots are assigned to, and syncs back
 * here. Next validates step 1 (name + origin) and scrolls to the first error;
 * the API payload is unchanged from the old five-step flow.
 */
const STEPS = [{ label: 'Project details' }, { label: 'Media & review' }] as const;
const S_DETAILS = 0;
const S_REVIEW = 1;

const INTROS: readonly (string | null)[] = [
  null,
  null,
];

export function ProjectWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('project:create') : false;
  const rowAssign = useRowAssign();

  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() => ({
    ...emptyDraft(EMPTY_LINE, ''),
    // Project mode: no pre-filled receipt date — the assignee records the real one.
    dateReceived: '',
  }));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [step, setStep] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [stepsDone, setStepsDone] = useState<boolean[]>(() => STEPS.map(() => false));
  const [formError, setFormError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoUploads = usePhotoUploads();
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

  /** One child lot per format — the formats currently present in the media table. */
  const lotFormats = [...new Set(draft.lines.map((l) => l.format))];

  const create = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        shared: buildSharedFields(draft),
        mediaLines: buildMediaLines(draft),
        // Only formats with a row right now are sent; a draft for a removed format stays in memory.
        ...buildAssignPayload(rowAssign.drafts, lotFormats, rowAssign.canAssignTasks),
        today: todayIso(),
      }),
    onSuccess: async (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      toast.success('Project created', `${res.code} · ${res.lots.length} ${res.lots.length === 1 ? 'lot' : 'lots'}`);
      // Photos never block creation: upload them now, report failures, go to the project either way.
      if (photos.length > 0) {
        setUploadingPhotos(true);
        const failed = await photoUploads
          .start(res.id, photos.map((p) => ({ file: p.file, caption: p.caption, format: p.format })))
          .catch(() => photos.length);
        if (failed > 0) {
          toast.error(
            `${failed} ${failed === 1 ? 'photo' : 'photos'} failed — add ${failed === 1 ? 'it' : 'them'} from the project page`,
          );
        }
      }
      router.push(`/projects/${res.id}`);
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not create the project.';
      setFormError(message);
      // A task failure names its format: flag that row and reopen its dialog.
      const bad = formatFromTaskError(message, lotFormats);
      if (bad) {
        rowAssign.setFormatError(bad, message);
        rowAssign.open(bad);
      }
    },
  });

  const busy = create.isPending || uploadingPhotos;

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
    // Editable cells take focus; plain fields have no data-cell, so fall back to
    // scrolling the first rendered field error into view.
    const focusFirst = () => {
      if (focusEditableCell(keys[0]!)) return;
      document.querySelector<HTMLElement>('span[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    // Errors render on the next paint, so always look them up after it.
    setTimeout(focusFirst, deferFocus ? 0 : 50);
    return false;
  };

  const validateStep = (i: number): boolean => {
    if (i === S_DETAILS) return applyErrors({ ...validateProject(), ...validateOrigin(draft, 'project') });
    return applyErrors(validateMedia(draft));
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
      const target = isLineErrorKey(first) ? S_REVIEW : S_DETAILS;
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

  return (
    <Panel>
      <PanelHeader title="New project" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} done={stepsDone} onJump={jumpTo} />
        {INTROS[step] ? <p className="m-0 -mt-3 text-[12.5px] text-ink-3 max-w-[72ch]">{INTROS[step]}</p> : null}
        <FormError message={formError} />

        {step === S_DETAILS ? (
          <StepBlocks>
            <OriginContactsStep
              ctx={ctx}
              leading={
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
              }
              below={
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this project covers…"
                    rows={3}
                    aria-label="Project description"
                  />
                </Field>
              }
            />
            <ConditionStep ctx={ctx} />
          </StepBlocks>
        ) : null}

        {step === S_REVIEW ? (
          <StepBlocks>
            <MediaStep
              ctx={ctx}
              rowActions={(line) => (
                <RowAssignButton
                  format={line.format}
                  draft={rowAssign.drafts[line.format]}
                  error={rowAssign.errors[line.format]}
                  onOpen={() => rowAssign.open(line.format)}
                />
              )}
            />

            <FormSection
              legend="Photos of the physical items (optional)"
              description="Add pictures of the items as received. You can add or change them later from the project page."
            >
              <ProjectPhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
              {uploadingPhotos ? (
                <p role="status" className="m-0 mt-3 text-[12.5px] font-medium text-ink-2">
                  Uploading photos… {photoUploads.entries.filter((e) => e.status === 'done').length} of {photoUploads.entries.length} done
                </p>
              ) : null}
            </FormSection>

            {showReview ? (
            <FormSection legend="Review">
              <div className="mb-3 rounded-[6px] border border-line-soft p-3 text-[13px]">
                <span className="text-ink">{name.trim() || '—'}</span>
                <div className="text-[12px] text-ink-3 mt-0.5">
                  {totalQuantity(draft.lines)} items → {lotFormats.length} {lotFormats.length === 1 ? 'lot' : 'lots'}
                </div>
              </div>
              <ReviewSummary
                mode="project"
                draft={draft}
                steps={{ origin: S_DETAILS, condition: S_DETAILS, media: S_REVIEW }}
                onJump={jumpTo}
              />
            </FormSection>
            ) : null}
          </StepBlocks>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line-soft">
          {step > 0 ? (
            <GhostButton disabled={busy} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton disabled={busy} onClick={() => router.push('/register?tab=projects')}>
              Cancel
            </GhostButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={goNext}>Next</PrimaryButton>
            ) : (
              <>
                <GhostButton disabled={busy} onClick={() => setShowReview((v) => !v)}>
                  {showReview ? 'Hide review' : 'View review'}
                </GhostButton>
                <PrimaryButton disabled={busy} onClick={submit}>
                  {uploadingPhotos ? 'Uploading photos…' : create.isPending ? 'Creating…' : 'Create project'}
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </div>
      {rowAssign.editing ? (
        <RowAssignDialog
          initial={rowAssign.drafts[rowAssign.editing] ?? null}
          canAssignTasks={rowAssign.canAssignTasks}
          serverError={rowAssign.errors[rowAssign.editing]}
          onSave={(d) => rowAssign.save(rowAssign.editing!, d)}
          onClear={rowAssign.drafts[rowAssign.editing] ? () => rowAssign.clear(rowAssign.editing!) : undefined}
          onClose={rowAssign.close}
        />
      ) : null}
    </Panel>
  );
}
