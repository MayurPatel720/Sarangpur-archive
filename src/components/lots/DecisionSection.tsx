'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { TERMINAL_STAGES } from '@/lib/domain';
import { date } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Textarea } from '@/components/ui/Form';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';
import { DecisionTriage } from './DecisionTriage';

type DetailLot = LotDetailResponse['lot'];

export function DecisionSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const grants = me.data ? me.data.grants : [];
  const canSubmit = grants.includes('lot:edit');
  const canDecide = grants.includes('decision:record');
  const canRequest = grants.includes('override:request');
  const canApprove = grants.includes('override:approve');

  const recorded = lot.decisionDetail.status !== 'pending';
  const terminal = (TERMINAL_STAGES as string[]).includes(lot.stage);
  const [error, setError] = useState<string | null>(null);

  // Override state
  const [justification, setJustification] = useState('');
  const [requesting, setRequesting] = useState(false);

  const submitMut = useMutation({
    mutationFn: () => lotsApi.submit(lot.id),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not submit for decision.'),
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
            {lot.intakeMissing.length > 0 ? (
              <div role="note" className="rounded-[6px] border border-line bg-surface-sunken px-3 py-2.5 text-[12.5px] text-ink-2">
                <span className="font-semibold text-ink">Not ready for decision.</span> Still to fill in:{' '}
                {lot.intakeMissing.join(', ')}. Use Edit on this record
                {lot.syncProject ? ' (it syncs to the whole project)' : ''}.
              </div>
            ) : (
              <p className="m-0 text-[13px] text-ink-2">
                Intake is complete. Sending this lot to the decision queue locks nothing —
                the record stays editable until a decision is recorded.
              </p>
            )}
            {canSubmit ? (
              <div>
                <PrimaryButton
                  disabled={submitMut.isPending || lot.intakeMissing.length > 0}
                  onClick={() => submitMut.mutate()}
                >
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
                {d.decidedAt ? ` · ${date(d.decidedAt)}` : null}
              </span>
            </div>
            <div className="text-[13px] text-ink-2">
              In MLS: {d.existsInMls === null ? '—' : d.existsInMls ? 'yes' : 'no'}
              {d.newCopyIsBetter !== null ? ` · Better copy: ${d.newCopyIsBetter ? 'yes' : 'no'}` : ''}
              {' · '}Condition usable: {d.conditionUsable === null ? '—' : d.conditionUsable ? 'yes' : 'no'}
              {' · '}Significance: {d.significanceFlags === null ? '—' : d.significanceFlags.some(Boolean) ? `${d.significanceFlags.filter(Boolean).length} criteria met` : 'none met'}
            </div>
            {d.conditionIssue ? <p className="m-0 text-[13px] text-ink-2">Condition issue: {d.conditionIssue}</p> : null}
            {d.mlsMatchPaths.length > 0 ? (
              <p className="m-0 text-[13px] text-ink-2">MLS paths: {d.mlsMatchPaths.join(', ')}</p>
            ) : null}
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
              <DecisionTriage lot={lot} onChanged={onChanged} revisit={canRevisit} />
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
