'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { scopedHref } from '@/lib/dashboard-links';
import type { LotCreateBody } from '@/types/lot';
import { dmyToIso, todayDmy } from '@/lib/format';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { focusEditableCell } from '@/components/ui/EditableTable';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import { useCan, useMe } from '@/hooks/useCan';
import { useRowAssign } from '@/hooks/useRowAssign';
import { buildAssignPayload, formatFromTaskError } from '@/lib/row-assign';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { usePhotoUploads } from '@/hooks/usePhotoUploads';
import { useToast } from '@/components/ui/Toast';
import { ProjectPhotoPicker, type PickedPhoto } from '@/components/projects/ProjectPhotoPicker';
import { RowAssignButton } from '@/components/tasks/RowAssignButton';
import { RowAssignDialog } from '@/components/tasks/RowAssignDialog';

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
  useIntakeDraft,
  validateMedia,
  validateOrigin,
  type FieldErrors,
  type MediaLineForm,
  type StepCtx,
} from './intake-steps';
import { Stepper } from './Stepper';

// Condition comes BEFORE media: what arrived, and in what state, is recorded first.
const STEPS = [
  { label: 'Origin & contacts' },
  { label: 'Condition & notes' },
  { label: 'Media & quantities' },
  { label: 'Rights & review' },
] as const;
const STEP_ORIGIN = 0;
const STEP_CONDITION = 1;
const STEP_MEDIA = 2;

/** One-line orientation under the stepper. The media step's intro lives on its section. */
const STEP_INTROS: readonly (string | null)[] = [
  'Where the media came from and who to contact about it.',
  'Condition on arrival, why it was sent, and any return request.',
  null,
  'Rights paperwork, then a final review before registering.',
];

export function IntakeForm({ initialFormat }: { initialFormat?: string } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('lot:create') : false;
  /**
   * Format block the user came from — seeds every new row AND locks the
   * format dropdown to that block's format. No `initialFormat` = unlocked,
   * mixed-format lots allowed.
   */
  const seedLine: Omit<MediaLineForm, 'id'> = initialFormat
    ? { ...EMPTY_LINE, format: initialFormat }
    : EMPTY_LINE;

  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() =>
    emptyDraft(seedLine, todayDmy()),
  );
  const [step, setStep] = useState(0);
  /**
   * Which steps the user has actually completed (left via a passing
   * validation). Drives the stepper ✓ — a step never filled in shows as
   * upcoming, never as done just because it sits behind the current one.
   */
  const [stepsDone, setStepsDone] = useState<boolean[]>(() => STEPS.map(() => false));
  const markDone = (index: number, done: boolean) =>
    setStepsDone((prev) => (prev[index] === done ? prev : prev.map((v, k) => (k === index ? done : v))));
  const [formError, setFormError] = useState<string | null>(null);

  // Photos of the physical items: kept in state and uploaded once the lot exists.
  const toast = useToast();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoUploads = usePhotoUploads(undefined, 'lot');

  // Per-row "Assign", exactly like the project wizard: rows of one format share one assignment
  // (owner + optional task). One person for every assigned format keeps ONE lot; different people on
  // different formats make one lot per format — a lot has a single owner.
  const rowAssign = useRowAssign();
  const canAssignLot = useCan('project:assign');
  const lineFormats = [...new Set(draft.lines.map((l) => l.format).filter(Boolean))];
  const assignmentBody = (): Pick<LotCreateBody, 'assignments' | 'tasks'> => {
    if (!canAssignLot) return {};
    const { assignments, tasks } = buildAssignPayload(rowAssign.drafts, lineFormats, rowAssign.canAssignTasks);
    const owners = assignments.flatMap((a) => (a.assigneeId ? [{ format: a.format, assigneeId: a.assigneeId }] : []));
    return { ...(owners.length ? { assignments: owners } : {}), ...(tasks.length ? { tasks } : {}) };
  };
  const ownerIds = new Set(lineFormats.flatMap((f) => (rowAssign.drafts[f]?.assignees[0] ? [rowAssign.drafts[f]!.assignees[0]!.id] : [])));
  const splitsIntoLots = canAssignLot && ownerIds.size > 1;

  const ctx: StepCtx = {
    mode: 'lot',
    draft,
    patch,
    errors: fieldErrors,
    clearPrefix,
    newRowId,
    initialFormat,
  };

  const create = useMutation({
    mutationFn: (body: LotCreateBody) => lotsApi.create(body),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      // Photos never block registration: upload them now, report failures, open the lot either way.
      if (photos.length > 0) {
        setUploadingPhotos(true);
        const failed = await photoUploads
          .start(res.id, photos.map((p) => ({ file: p.file, caption: p.caption, format: null })))
          .catch(() => photos.length);
        if (failed > 0) {
          toast.error(`${failed} ${failed === 1 ? 'photo' : 'photos'} failed — add ${failed === 1 ? 'it' : 'them'} from the lot page`);
        }
      }
      if (res.lots.length > 1) {
        toast.success(`${res.lots.length} lots registered`, res.lots.map((l) => l.lotReference).join(', '));
        router.push(scopedHref('/register', initialFormat));
      } else {
        router.push(scopedHref(`/register/${res.id}`, initialFormat));
      }
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not register this lot.';
      setFormError(message);
      // A task failure names its format: flag that row and reopen its dialog.
      const bad = formatFromTaskError(message, lineFormats);
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
        <PanelHeader title="New intake" />
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
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
          message="You don't have access to register lots."
          hint="Ask an admin for the lot:create permission."
        />
      </Panel>
    );
  }

  const clearErrors = () => setFieldErrors({});

  /**
   * Apply every collected error at once — inline per cell plus one summary
   * line when there is more than one — and focus the first problem. Returns
   * whether the check passed. `deferFocus` waits a tick so a caller that just
   * switched steps can focus a cell that is about to mount.
   */
  const applyErrors = (errs: FieldErrors, deferFocus = false): boolean => {
    const keys = Object.keys(errs);
    if (keys.length === 0) {
      setFieldErrors({});
      setFormError(null);
      return true;
    }
    setFieldErrors(errs);
    // A single failure already shows inline — only add a summary when there
    // is genuinely more than one thing to fix.
    setFormError(keys.length > 1 ? `${keys.length} fields need attention.` : null);
    const focusFirst = () => focusEditableCell(keys[0]!);
    if (deferFocus) setTimeout(focusFirst, 0);
    else focusFirst();
    return false;
  };

  const validateStep = (index: number): boolean => {
    // Condition & notes / Rights are optional — nothing to gate on.
    if (index === STEP_ORIGIN) return applyErrors(validateOrigin(draft, 'lot'));
    if (index === STEP_MEDIA) return applyErrors(validateMedia(draft));
    return applyErrors({});
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const goNext = () => {
    if (!validateStep(step)) {
      markDone(step, false);
      return;
    }
    markDone(step, true);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollTop();
  };

  const goBack = () => {
    clearErrors();
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  };

  const jumpTo = (index: number) => {
    if (index === step) return;
    // Jumping is allowed, but the page being left must be valid first.
    if (!validateStep(step)) {
      markDone(step, false);
      return;
    }
    markDone(step, true);
    clearErrors();
    setFormError(null);
    setStep(index);
    scrollTop();
  };

  const submit = () => {
    // Full pre-check mirrors the per-step gates, so a jump-to-review path can
    // never skip them. Every failure is collected first and shown at once.
    const errs: FieldErrors = { ...validateOrigin(draft, 'lot'), ...validateMedia(draft) };
    const keys = Object.keys(errs);
    if (keys.length > 0) {
      if (keys.some(isLineErrorKey)) markDone(STEP_MEDIA, false);
      if (keys.some((k) => !isLineErrorKey(k))) markDone(STEP_ORIGIN, false);
      const target = isLineErrorKey(keys[0]!) ? STEP_MEDIA : STEP_ORIGIN;
      const changedStep = target !== step;
      if (changedStep) {
        setStep(target);
        scrollTop();
      }
      // Defer focus when the step just changed — the target cell mounts on the next render.
      applyErrors(errs, changedStep);
      return;
    }

    const shared = buildSharedFields(draft);
    const body: LotCreateBody = {
      ...shared,
      // Present: validated above (date, origin, owner are required for standalone intake).
      dateReceived: new Date(`${dmyToIso(draft.dateReceived)}T00:00:00`).toISOString(),
      originSource: draft.originSource,
      owner: shared.owner!,
      pointsOfContact: shared.pointsOfContact ?? [],
      mediaLines: buildMediaLines(draft),
      ...(draft.digitalFilePath.trim() ? { digitalFilePath: draft.digitalFilePath.trim() } : {}),
      ...(draft.physicalLabelApplied ? { physicalLabelApplied: true } : {}),
      ...(draft.containerLabelApplied ? { containerLabelApplied: true } : {}),
      ...assignmentBody(),
    };
    create.mutate(body);
  };

  return (
    <Panel>
      <PanelHeader title="New intake" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} done={stepsDone} onJump={jumpTo} />
        {STEP_INTROS[step] ? (
          <p className="m-0 -mt-3 text-[12.5px] text-ink-3 max-w-[72ch]">{STEP_INTROS[step]}</p>
        ) : null}

        <FormError message={formError} />

        {step === STEP_ORIGIN ? <OriginContactsStep ctx={ctx} /> : null}
        {step === STEP_CONDITION ? <ConditionStep ctx={ctx} /> : null}
        {step === STEP_MEDIA ? (
          <MediaStep
            ctx={ctx}
            rowActions={
              canAssignLot
                ? (line) => (
                    <RowAssignButton
                      format={line.format}
                      draft={rowAssign.drafts[line.format]}
                      error={rowAssign.errors[line.format]}
                      onOpen={() => rowAssign.open(line.format)}
                    />
                  )
                : undefined
            }
            footerNote={
              <>
                {splitsIntoLots ? (
                  <p role="status" className="m-0 mt-3 rounded-[6px] border border-info-line bg-info-bg px-3 py-2 text-[12.5px] text-info">
                    {lineFormats.map((f) => FORMAT_LABELS[f as Format] ?? f).join(' and ')} are assigned to different people, so registering
                    creates {lineFormats.length} lots — one per format, each with its own owner. Photos you add go to the first lot.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
                  <span className="text-[12.5px] font-semibold text-ink-2">Photos of the physical items (optional)</span>
                  <ProjectPhotoPicker
                    photos={photos}
                    onChange={setPhotos}
                    disabled={busy}
                    showFormat={false}
                    waitingNote="Photos are resized and uploaded after the lot is registered. You can add or remove them later from the lot page."
                  />
                  {uploadingPhotos ? (
                    <p role="status" className="m-0 text-[12.5px] font-medium text-ink-2">
                      Uploading photos… {photoUploads.entries.filter((e) => e.status === 'done').length} of {photoUploads.entries.length} done
                    </p>
                  ) : null}
                </div>
              </>
            }
          />
        ) : null}
        {step === 3 ? (
          <StepBlocks>
            <RightsSection ctx={ctx} />
            <FormSection legend="Review">
              <ReviewSummary
                mode="lot"
                draft={draft}
                steps={{ origin: STEP_ORIGIN, condition: STEP_CONDITION, media: STEP_MEDIA }}
                onJump={jumpTo}
              />
            </FormSection>
          </StepBlocks>
        ) : null}

        {/* ------------------------------------------------------- footer */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line-soft">
          {step > 0 ? (
            <GhostButton disabled={busy} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton
              disabled={busy}
              onClick={() => router.push(scopedHref('/register', initialFormat))}
            >
              Cancel
            </GhostButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={goNext}>Next</PrimaryButton>
            ) : (
              <PrimaryButton disabled={busy} onClick={submit}>
                {uploadingPhotos ? 'Uploading photos…' : create.isPending ? 'Registering…' : 'Register lot'}
              </PrimaryButton>
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
