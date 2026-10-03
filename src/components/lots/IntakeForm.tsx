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
import { useMe } from '@/hooks/useCan';
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
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      router.push(scopedHref(`/register/${res.id}`, initialFormat));
    },
    onError: (e) => {
      setFormError(e instanceof ApiRequestError ? e.message : 'Could not register this lot.');
    },
  });

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
        {step === STEP_MEDIA ? <MediaStep ctx={ctx} /> : null}
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
            <GhostButton disabled={create.isPending} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton
              disabled={create.isPending}
              onClick={() => router.push(scopedHref('/register', initialFormat))}
            >
              Cancel
            </GhostButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={goNext}>Next</PrimaryButton>
            ) : (
              <PrimaryButton disabled={create.isPending} onClick={submit}>
                {create.isPending ? 'Registering…' : 'Register lot'}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
