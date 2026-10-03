'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { Badge } from '@/components/ui/primitives';
import type { GridItem, ItemsBulkSet } from '@/types/items';

type Opt = { value: string; label: string };
type Tri = boolean | null;
const triVal = (v: Tri) => (v === true ? 'yes' : v === false ? 'no' : '');
const triParse = (s: string): Tri => (s === 'yes' ? true : s === 'no' ? false : null);

/**
 * One item as a form — the comfortable way to edit on a phone, and for long
 * descriptions on desktop. Saves only the fields that changed.
 */
export function ItemEditDialog({
  item,
  canDetails,
  canDecide,
  physical,
  conditions,
  reasons,
  pending,
  onSave,
  onClose,
}: {
  item: GridItem;
  canDetails: boolean;
  canDecide: boolean;
  physical: Opt[];
  conditions: Opt[];
  reasons: Opt[];
  pending: boolean;
  onSave: (set: ItemsBulkSet) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    name: item.name ?? '',
    nameOnCase: item.nameOnCase ?? '',
    description: item.description ?? '',
    year: item.year != null ? String(item.year) : '',
    month: item.month ?? '',
    place: item.place ?? '',
    event: item.event ?? '',
    people: item.people ?? '',
    physicalSource: item.physicalSource ?? '',
    itemCondition: item.itemCondition ?? '',
    remarks: item.remarks ?? '',
    existsInMls: triVal(item.existsInMls),
    newCopyIsBetter: triVal(item.newCopyIsBetter),
    conditionUsable: triVal(item.conditionUsable),
    significant: triVal(item.significant),
    disposition: item.disposition ?? '',
    reason: item.reason ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    const year = f.year.trim();
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1800 || Number(year) > 2200)) {
      setError('Year must be four digits, e.g. 1998.');
      return;
    }
    const answering = [f.existsInMls, f.conditionUsable, f.significant, f.disposition].some(Boolean);
    if (answering && !f.name.trim()) {
      setError('Give the item a name before answering the decision questions.');
      return;
    }
    const out: Record<string, unknown> = {};
    const str = (k: keyof GridItem & keyof typeof f) => {
      const next = f[k].trim() || null;
      if (next !== ((item[k] as string | null) ?? null)) out[k] = next;
    };
    (['name', 'nameOnCase', 'description', 'month', 'place', 'event', 'people', 'physicalSource', 'itemCondition', 'remarks'] as const).forEach(str);
    const nextYear = year ? Number(year) : null;
    if (nextYear !== item.year) out.year = nextYear;
    if (canDecide) {
      (['existsInMls', 'newCopyIsBetter', 'conditionUsable', 'significant'] as const).forEach((k) => {
        const next = triParse(f[k]);
        if (next !== item[k]) out[k] = next;
      });
      const disp = (f.disposition || null) as 'return' | 'discard' | null;
      if (disp !== item.disposition) out.disposition = disp;
      const reason = f.reason || null;
      if (reason !== item.reason) out.reason = reason;
    }
    if (Object.keys(out).length === 0) return onClose();
    setError(null);
    onSave(out as ItemsBulkSet);
  };

  const tri = (k: 'existsInMls' | 'newCopyIsBetter' | 'conditionUsable' | 'significant', label: string, disabled = false) => (
    <Field label={label}>
      <Select value={f[k]} onChange={on(k)} disabled={!canDecide || disabled}>
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </Select>
    </Field>
  );
  const ref = (k: 'physicalSource' | 'itemCondition' | 'reason', label: string, opts: Opt[], disabled = false) => (
    <Field label={label}>
      <Select value={f[k]} onChange={on(k)} disabled={disabled}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {f[k] && !opts.some((o) => o.value === f[k]) ? <option value={f[k]}>{f[k]}</option> : null}
      </Select>
    </Field>
  );
  const ro = !canDetails;

  return (
    <Dialog title={item.code} subtitle={`${item.format} · ${item.subtypeLabel}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <fieldset disabled={ro} className="m-0 p-0 border-0 min-w-0 flex flex-col gap-3">
          <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Details</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name / title" required>
              <TextInput value={f.name} onChange={on('name')} placeholder="e.g. Akshardham Gandhinagar Mahelav 23-12-2009 Tape #1" />
            </Field>
            <Field label="Name on case">
              <TextInput value={f.nameOnCase} onChange={on('nameOnCase')} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={f.description} onChange={on('description')} rows={3} />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Year">
              <TextInput value={f.year} onChange={on('year')} inputMode="numeric" placeholder="1998" />
            </Field>
            <Field label="Month">
              <TextInput value={f.month} onChange={on('month')} placeholder="07 or 11/12" />
            </Field>
            <Field label="Place">
              <TextInput value={f.place} onChange={on('place')} />
            </Field>
            <Field label="Event">
              <TextInput value={f.event} onChange={on('event')} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="People">
              <TextInput value={f.people} onChange={on('people')} />
            </Field>
            {ref('physicalSource', 'Physical source', physical)}
            {ref('itemCondition', 'Condition', conditions)}
          </div>
          <Field label="Remarks">
            <TextInput value={f.remarks} onChange={on('remarks')} />
          </Field>
        </fieldset>

        <fieldset disabled={!canDecide} className="m-0 p-0 border-0 min-w-0 flex flex-col gap-3">
          <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            Decision {item.result ? <Badge severity={item.result === 'archive' ? 'good' : item.result === 'return' ? 'info' : 'critical'}>{item.result}</Badge> : null}
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tri('existsInMls', 'Already in MLS?')}
            {tri('newCopyIsBetter', 'New copy better?', f.existsInMls !== 'yes')}
            {tri('conditionUsable', 'Condition usable?')}
            {tri('significant', 'Significant?')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Return or discard" hint="Only when the result is “Return or discard”.">
              <Select value={f.disposition} onChange={on('disposition')}>
                <option value="">—</option>
                <option value="return">Return</option>
                <option value="discard">Discard</option>
              </Select>
            </Field>
            {ref('reason', 'Reason', reasons)}
          </div>
        </fieldset>

        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>{ro ? 'Close' : 'Cancel'}</GhostButton>
          {ro ? null : (
            <PrimaryButton disabled={pending} onClick={submit}>
              {pending ? 'Saving…' : 'Save item'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Dialog>
  );
}
