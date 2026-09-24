'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { useReferenceList } from '@/hooks/useReferenceList';
import { prettyEnum } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Definition, EmptyValue, Panel, PanelHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

const dash = <EmptyValue />;

export function DiscardSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const toast = useToast();
  const canConfirm = me.data ? me.data.grants.includes('discard:confirm') : false;
  const canReverse = me.data ? me.data.grants.includes('discard:reverse') : false;
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const discardReasons = useReferenceList('discardReason');
  const stages = useReferenceList('stage');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const discardable = (stages.data?.items ?? [])
    .filter((i) => i.meta.discardable === true)
    .map((i) => i.value);

  const confirm = useMutation({
    mutationFn: () =>
      lotsApi.confirmDiscard(lot.id, {
        confirm: true,
        reason: reason || (discardReasons.data?.items[0]?.value ?? ''),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setFormError(null);
      setConfirming(false);
      setNotes('');
      toast.success('Lot discarded', `${lot.lotReference} moved to Discarded.`);
      onChanged();
    },
    onError: (e) => {
      const msg = e instanceof ApiRequestError ? e.message : 'Could not discard lot.';
      setFormError(msg);
      toast.error('Couldn’t discard lot', msg);
    },
  });

  const reverse = useMutation({
    mutationFn: () => lotsApi.reverseDiscard(lot.id, lot.version),
    onSuccess: () => {
      setFormError(null);
      toast.success('Discard reversed', `${lot.lotReference} returned to metadata.`);
      onChanged();
    },
    onError: (e) => {
      const msg = e instanceof ApiRequestError ? e.message : 'Could not reverse discard.';
      setFormError(msg);
      toast.error('Couldn’t reverse discard', msg);
    },
  });

  const isDiscarded = lot.stage === 'discarded';

  return (
    <Panel>
      <PanelHeader title="Discard" />
      <div className="px-4 md:px-5 py-3.5 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3.5">
          <Definition label="Reason">
            {lot.ops.discardReason ? prettyEnum(lot.ops.discardReason) : dash}
          </Definition>
        </div>

        {formError ? <FormError message={formError} /> : null}

        {isDiscarded ? (
          canReverse ? (
            <div>
              <GhostButton onClick={() => reverse.mutate()} disabled={reverse.isPending}>
                {reverse.isPending ? 'Reversing…' : 'Reverse discard (back to metadata)'}
              </GhostButton>
            </div>
          ) : null
        ) : canConfirm && discardable.includes(lot.stage) ? (
          confirming ? (
            <div className="flex flex-col gap-3">
              <Field label="Reason">
                <Select
                  value={reason || (discardReasons.data?.items[0]?.value ?? '')}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {(discardReasons.data?.items ?? []).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
              <div className="flex gap-2">
                <PrimaryButton onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                  {confirm.isPending ? 'Discarding…' : 'Confirm discard'}
                </PrimaryButton>
                <GhostButton onClick={() => { setConfirming(false); setFormError(null); }}>Cancel</GhostButton>
              </div>
            </div>
          ) : (
            <div>
              <GhostButton onClick={() => setConfirming(true)}>Discard lot…</GhostButton>
            </div>
          )
        ) : null}
      </div>
    </Panel>
  );
}
