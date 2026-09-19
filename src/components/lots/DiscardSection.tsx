'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { DISCARD_REASONS } from '@/lib/domain';
import { prettyEnum } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

const dash = <span className="text-ink-4">—</span>;

/** Stages from which a working lot may be discarded (server is source of truth). */
const DISCARDABLE = ['metadata', 'scanning', 'mls_tag', 'storage'];

export function DiscardSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const canConfirm = me.data ? me.data.grants.includes('discard:confirm') : false;
  const canReverse = me.data ? me.data.grants.includes('discard:reverse') : false;
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<(typeof DISCARD_REASONS)[number]>(DISCARD_REASONS[0] as (typeof DISCARD_REASONS)[number]);
  const [notes, setNotes] = useState('');

  const confirm = useMutation({
    mutationFn: () =>
      lotsApi.confirmDiscard(lot.id, {
        confirm: true,
        reason,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setFormError(null);
      setConfirming(false);
      setNotes('');
      onChanged();
    },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.message : 'Could not discard lot.'),
  });

  const reverse = useMutation({
    mutationFn: () => lotsApi.reverseDiscard(lot.id, lot.version),
    onSuccess: () => {
      setFormError(null);
      onChanged();
    },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.message : 'Could not reverse discard.'),
  });

  const isDiscarded = lot.stage === 'discarded';

  return (
    <Panel>
      <PanelHeader title="Discard" />
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">Reason</span>
            <span className="text-[13px] text-ink break-words">{lot.ops.discardReason ? prettyEnum(lot.ops.discardReason) : dash}</span>
          </div>
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
        ) : canConfirm && DISCARDABLE.includes(lot.stage) ? (
          confirming ? (
            <div className="flex flex-col gap-3">
              <Field label="Reason">
                <Select value={reason} onChange={(e) => setReason(e.target.value as (typeof DISCARD_REASONS)[number])}>
                  {DISCARD_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {prettyEnum(r)}
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
