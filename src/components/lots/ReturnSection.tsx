'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { useReferenceList } from '@/hooks/useReferenceList';
import { date, prettyEnum } from '@/lib/format';
import { Field, FormError, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Definition, EmptyValue, Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

const dash = <EmptyValue />;

export function ReturnSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const canManage = me.data ? me.data.grants.includes('return:manage') : false;
  const returnFormats = useReferenceList('returnFormat');
  const returnStatuses = useReferenceList('returnStatus');
  const returnMethods = useReferenceList('returnMethod');
  const [formError, setFormError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [durationText, setDurationText] = useState('');
  const [method, setMethod] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: () =>
      lotsApi.manageReturn(lot.id, {
        ...(requested ? { requested: true } : {}),
        ...(format ? { format } : {}),
        ...(status ? { status } : {}),
        ...(durationText.trim() ? { durationText: durationText.trim() } : {}),
        ...(method ? { method } : {}),
        ...(trackingReference.trim() ? { trackingReference: trackingReference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setFormError(null);
      setRequested(false);
      setFormat('');
      setStatus('');
      setDurationText('');
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
      <div className="px-4 md:px-5 py-3.5 flex flex-col gap-3.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3.5">
          <Definition label="Status">{prettyEnum(lot.ops.returnStatus)}</Definition>
          <Definition label="Requested">{lot.ops.returnRequested ? 'Yes' : 'No'}</Definition>
          <Definition label="Format">
            {lot.ops.returnFormat ? prettyEnum(lot.ops.returnFormat) : dash}
          </Definition>
          <Definition label="Duration">{lot.ops.returnDuration ?? dash}</Definition>
          <Definition label="Due">{lot.ops.returnDueAt ? date(lot.ops.returnDueAt) : dash}</Definition>
          <Definition label="Returned">{lot.ops.returnedAt ? date(lot.ops.returnedAt) : dash}</Definition>
          <Definition label="Handled by">{lot.ops.returnHandledByName ?? dash}</Definition>
          <Definition label="Method">{lot.ops.returnMethod ?? dash}</Definition>
        </div>

        {canManage ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="">No change</option>
                  {(returnFormats.data?.items ?? []).map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">No change</option>
                  {(returnStatuses.data?.items ?? []).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Duration" hint="Agreed return duration text, e.g. Within 30 days.">
                <TextInput
                  value={durationText}
                  onChange={(e) => setDurationText(e.target.value)}
                  placeholder="e.g. Within 30 days"
                />
              </Field>
              <Field label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">No change</option>
                  {(returnMethods.data?.items ?? []).map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
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
