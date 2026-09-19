'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { DecisionBody, LotDetailResponse } from '@/types/lot';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea } from '@/components/ui/Form';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

const TERMINAL_STAGES = ['returned', 'discarded'];

function YesNo({ value, onChange, label }: { value: '' | 'yes' | 'no'; onChange: (v: 'yes' | 'no') => void; label: string }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as 'yes' | 'no')}>
        <option value="">Choose…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </Select>
    </Field>
  );
}

export function DecisionSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const grants = me.data ? me.data.grants : [];
  const canSubmit = grants.includes('lot:edit');
  const canDecide = grants.includes('decision:record');
  const canRequest = grants.includes('override:request');
  const canApprove = grants.includes('override:approve');

  const recorded = lot.decisionDetail.status !== 'pending';
  const terminal = TERMINAL_STAGES.includes(lot.stage);
  const [error, setError] = useState<string | null>(null);

  // Checklist state
  const [existsInMls, setExistsInMls] = useState<'' | 'yes' | 'no'>('');
  const [newCopyIsBetter, setNewCopyIsBetter] = useState<'' | 'yes' | 'no'>('');
  const [conditionUsable, setConditionUsable] = useState<'' | 'yes' | 'no'>('');
  const [conditionIssue, setConditionIssue] = useState('');
  const [flags, setFlags] = useState([false, false, false, false]);
  const [notes, setNotes] = useState('');
  const [disposition, setDisposition] = useState<'' | 'return' | 'discard'>('');
  const [needsDisposition, setNeedsDisposition] = useState(false);

  // Override state
  const [justification, setJustification] = useState('');
  const [requesting, setRequesting] = useState(false);

  const resetChecklist = () => {
    setExistsInMls('');
    setNewCopyIsBetter('');
    setConditionUsable('');
    setConditionIssue('');
    setFlags([false, false, false, false]);
    setNotes('');
    setDisposition('');
    setNeedsDisposition(false);
  };

  const submitMut = useMutation({
    mutationFn: () => lotsApi.submit(lot.id),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not submit for decision.'),
  });

  const decideMut = useMutation({
    mutationFn: (body: DecisionBody) => lotsApi.recordDecision(lot.id, body),
    onSuccess: () => {
      setError(null);
      resetChecklist();
      onChanged();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not record the decision.';
      // Server names the verdict when a disposition is required but missing.
      if (e instanceof ApiRequestError && e.status === 400 && /return_or_discard/.test(message)) {
        setNeedsDisposition(true);
        setError('The checklist points away from the archive — choose return or discard below.');
      } else {
        setError(message);
      }
    },
  });

  const requestMut = useMutation({
    mutationFn: () => lotsApi.requestOverride(lot.id, { justification: justification.trim() }),
    onSuccess: () => {
      setError(null);
      setJustification('');
      setRequesting(false);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not request an override.'),
  });

  const decideOverrideMut = useMutation({
    mutationFn: (outcome: 'approved' | 'rejected') => lotsApi.decideOverride(lot.id, { outcome }),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not decide the override.'),
  });

  const record = () => {
    setError(null);
    if (!existsInMls) return setError('State whether this lot already exists in MLS.');
    if (existsInMls === 'yes' && !newCopyIsBetter) {
      return setError('State whether this copy is better — the lot already exists in MLS.');
    }
    if (!conditionUsable) return setError('State whether the condition is usable.');
    if (conditionUsable === 'no' && !conditionIssue.trim()) {
      return setError('Describe the condition issue — condition was marked unusable.');
    }
    if (needsDisposition && !disposition) return setError('Choose return or discard.');
    const body: DecisionBody = {
      existsInMls: existsInMls === 'yes',
      ...(existsInMls === 'yes' ? { newCopyIsBetter: newCopyIsBetter === 'yes' } : {}),
      conditionUsable: conditionUsable === 'yes',
      ...(conditionUsable === 'no' ? { conditionIssue: conditionIssue.trim() } : {}),
      significanceFlags: [flags[0] ?? false, flags[1] ?? false, flags[2] ?? false, flags[3] ?? false],
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(needsDisposition && disposition ? { disposition } : {}),
    };
    decideMut.mutate(body);
  };

  const showChecklist =
    !terminal && (lot.stage === 'decision' || lot.decisionDetail.overrideStatus === 'approved');
  const canRevisit =
    recorded && !terminal && lot.decisionDetail.overrideStatus === 'approved';
  const showRequest =
    recorded && !terminal && (lot.decisionDetail.overrideStatus === 'none' || lot.decisionDetail.overrideStatus === 'rejected');
  const showApproval = recorded && lot.decisionDetail.overrideStatus === 'requested';

  const d = lot.decisionDetail;

  return (
    <Panel>
      <PanelHeader title="Decision" />
      <div className="p-3 md:p-4 flex flex-col gap-4">
        <FormError message={error} />

        {lot.stage === 'intake' ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] text-ink-2">
              Intake is complete. Sending this lot to the decision queue locks nothing —
              the record stays editable until a decision is recorded.
            </p>
            {canSubmit ? (
              <div>
                <PrimaryButton disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
                  {submitMut.isPending ? 'Submitting…' : 'Submit for decision'}
                </PrimaryButton>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-ink-3">You don&apos;t have permission to submit lots.</p>
            )}
          </div>
        ) : null}

        {recorded ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge severity={d.verdict === 'archive' ? 'good' : 'warning'}>
                <span className="capitalize">{d.status}</span>
              </Badge>
              <span className="text-[13px] text-ink-2">
                {d.verdict ? `Verdict: ${d.verdict === 'archive' ? 'archive' : 'return or discard'}` : null}
                {d.decidedByName ? ` · by ${d.decidedByName}` : null}
                {d.decidedAt ? ` · ${d.decidedAt.slice(0, 10)}` : null}
              </span>
            </div>
            <div className="text-[13px] text-ink-2">
              In MLS: {d.existsInMls === null ? '—' : d.existsInMls ? 'yes' : 'no'}
              {' · '}Condition usable: {d.conditionUsable === null ? '—' : d.conditionUsable ? 'yes' : 'no'}
              {' · '}Significance: {d.significanceFlags === null ? '—' : d.significanceFlags.some(Boolean) ? `${d.significanceFlags.filter(Boolean).length} of 4 criteria met` : 'none met'}
            </div>
            {d.notes ? <p className="m-0 text-[13px] text-ink-2">Notes: {d.notes}</p> : null}
            {d.overrideStatus !== 'none' ? (
              <p className="m-0 text-[13px] text-ink-2">
                Override: <span className="capitalize">{d.overrideStatus}</span>
                {d.overrideRequestedByName ? ` · requested by ${d.overrideRequestedByName}` : null}
                {d.overrideApprovedByName ? ` · decided by ${d.overrideApprovedByName}` : null}
              </p>
            ) : null}
          </div>
        ) : (
          lot.stage !== 'intake' ? (
            <p className="m-0 text-[13px] text-ink-2">No decision recorded yet — the checklist below writes the first one.</p>
          ) : null
        )}

        {showChecklist ? (
          canDecide ? (
            <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
              <h3 className="m-0 text-[13px] font-semibold text-ink">
                {canRevisit ? 'Re-record decision (approved override)' : 'Record decision'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <YesNo label="Already exists in MLS?" value={existsInMls} onChange={setExistsInMls} />
                {existsInMls === 'yes' ? (
                  <YesNo label="This copy is better?" value={newCopyIsBetter} onChange={setNewCopyIsBetter} />
                ) : null}
                <YesNo label="Condition usable?" value={conditionUsable} onChange={setConditionUsable} />
                {conditionUsable === 'no' ? (
                  <Field label="Condition issue">
                    <Textarea value={conditionIssue} onChange={(e) => setConditionIssue(e.target.value)} />
                  </Field>
                ) : null}
              </div>
              <fieldset className="m-0 p-0 border-0 min-w-0">
                <legend className="px-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  Significance criteria (any one archives the lot)
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {flags.map((on, i) => (
                    <label key={i} className="flex items-center gap-2 min-h-[44px] text-[13px] text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-accent)]"
                        checked={on}
                        onChange={(e) => setFlags(flags.map((f, j) => (j === i ? e.target.checked : f)))}
                      />
                      Criterion {i + 1}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Decision notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              {needsDisposition ? (
                <Field label="Disposition — the checklist points away from the archive">
                  <Select value={disposition} onChange={(e) => setDisposition(e.target.value as '' | 'return' | 'discard')}>
                    <option value="">Choose…</option>
                    <option value="return">Return to sender</option>
                    <option value="discard">Discard</option>
                  </Select>
                </Field>
              ) : null}
              <div>
                <PrimaryButton disabled={decideMut.isPending} onClick={record}>
                  {decideMut.isPending ? 'Recording…' : 'Record decision'}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-ink-3">You don&apos;t have permission to record decisions.</p>
          )
        ) : null}

        {showRequest ? (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
            {requesting ? (
              <>
                <Field label="Why should this decision be revisited?">
                  <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
                </Field>
                <div className="flex items-center gap-2">
                  <PrimaryButton
                    disabled={requestMut.isPending || !justification.trim()}
                    onClick={() => requestMut.mutate()}
                  >
                    {requestMut.isPending ? 'Sending…' : 'Send request'}
                  </PrimaryButton>
                  <GhostButton onClick={() => { setRequesting(false); setJustification(''); }}>
                    Cancel
                  </GhostButton>
                </div>
              </>
            ) : canRequest ? (
              <div>
                <GhostButton onClick={() => setRequesting(true)}>Request override</GhostButton>
              </div>
            ) : null}
          </div>
        ) : null}

        {showApproval ? (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
            <p className="m-0 text-[13px] text-ink-2">
              Override requested{d.overrideRequestedByName ? ` by ${d.overrideRequestedByName}` : ''} — approval
              re-opens the checklist above{terminal ? ', but this lot is in a terminal stage and stays locked' : ''}.
            </p>
            {canApprove ? (
              <div className="flex items-center gap-2">
                <PrimaryButton
                  disabled={decideOverrideMut.isPending}
                  onClick={() => decideOverrideMut.mutate('approved')}
                >
                  Approve
                </PrimaryButton>
                <GhostButton
                  disabled={decideOverrideMut.isPending}
                  onClick={() => decideOverrideMut.mutate('rejected')}
                >
                  Reject
                </GhostButton>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-ink-3">A lead reviewer needs to approve or reject this request.</p>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
