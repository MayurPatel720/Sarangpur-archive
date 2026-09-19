'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { RETURN_FORMATS, RETURN_STATUSES } from '@/lib/domain';
import { prettyEnum } from '@/lib/format';
import { Field, FormError, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

const dash = <span className="text-ink-4">—</span>;

export function ReturnSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const canManage = me.data ? me.data.grants.includes('return:manage') : false;
  const [formError, setFormError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: () =>
      lotsApi.manageReturn(lot.id, {
        ...(requested ? { requested: true } : {}),
        ...(format ? { format: format as (typeof RETURN_FORMATS)[number] } : {}),
        ...(status ? { status: status as (typeof RETURN_STATUSES)[number] } : {}),
        ...(method.trim() ? { method: method.trim() } : {}),
        ...(trackingReference.trim() ? { trackingReference: trackingReference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setFormError(null);
      setRequested(false);
      setFormat('');
      setStatus('');
      setMethod('');
      setTrackingReference('');
      setNotes('');
      onChanged();
    },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.message : 'Could not save return.'),
  });

  return (
    <Panel>
      <PanelHeader title="Return" />
      <div className="p-3 md:p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">Status</span>
            <span className="text-[13px] text-ink break-words">{prettyEnum(lot.ops.returnStatus)}</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">Format</span>
            <span className="text-[13px] text-ink break-words">{lot.ops.returnFormat ? prettyEnum(lot.ops.returnFormat) : dash}</span>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="">No change</option>
                  {RETURN_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {prettyEnum(f)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">No change</option>
                  {RETURN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {prettyEnum(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Method">
                <TextInput value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. Hand delivery" />
              </Field>
              <Field label="Tracking reference">
                <TextInput value={trackingReference} onChange={(e) => setTrackingReference(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <Field label="Notes">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input type="checkbox" checked={requested} onChange={(e) => setRequested(e.target.checked)} className="h-4 w-4 accent-accent" />
              Mark as requested
            </label>
            {formError ? <FormError message={formError} /> : null}
            <div>
              <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save return'}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
