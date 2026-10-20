'use client';

import { useState } from 'react';
import {
  MACHINE_CATEGORY_SUGGESTIONS,
  MACHINE_CONDITIONS,
  MACHINE_CONDITION_LABELS,
  MACHINE_SOURCES,
  MACHINE_SOURCE_LABELS,
  type MachineCondition,
  type MachineSource,
} from '@/lib/machine';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import type { Machine, MachineCreateBody } from '@/types/machine';

/**
 * Add or edit a machine. One form for both: what it is, where it came from, where it is and
 * how it is doing, and how often it needs servicing. When editing, changing the condition or
 * usage shows a "Reason" box so the history says why.
 */
export function MachineDialog({
  machine,
  pending,
  error,
  onSave,
  onClose,
}: {
  /** Present when editing. */
  machine?: Machine;
  pending: boolean;
  error: string | null;
  onSave: (body: MachineCreateBody & { reason?: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(machine?.name ?? '');
  const [category, setCategory] = useState(machine?.category ?? '');
  const [make, setMake] = useState(machine?.make ?? '');
  const [model, setModel] = useState(machine?.model ?? '');
  const [version, setVersion] = useState(machine?.version ?? '');
  const [serialNo, setSerialNo] = useState(machine?.serialNo ?? '');
  const [sourceType, setSourceType] = useState<MachineSource>(machine?.sourceType ?? 'purchased');
  const [sourceName, setSourceName] = useState(machine?.sourceName ?? '');
  const [sourceContact, setSourceContact] = useState(machine?.sourceContact ?? '');
  const [acquiredOn, setAcquiredOn] = useState(machine?.acquiredOn ?? '');
  const [location, setLocation] = useState(machine?.location ?? '');
  const [condition, setCondition] = useState<MachineCondition>(machine?.condition ?? 'working');
  const [inUse, setInUse] = useState(machine?.inUse ?? false);
  const [serviceEvery, setServiceEvery] = useState(machine?.serviceEveryMonths ? String(machine.serviceEveryMonths) : '');
  const [notes, setNotes] = useState(machine?.notes ?? '');
  const [reason, setReason] = useState('');

  const stateChanged = machine ? condition !== machine.condition || inUse !== machine.inUse : false;

  return (
    <Dialog title={machine ? 'Edit machine' : 'Add a machine'} subtitle={machine?.code} onClose={onClose} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const months = Number(serviceEvery);
          onSave({
            name: name.trim(),
            category,
            make,
            model,
            version,
            serialNo,
            sourceType,
            sourceName,
            sourceContact,
            ...(acquiredOn ? { acquiredOn } : {}),
            location,
            condition,
            inUse,
            notes,
            ...(Number.isInteger(months) && months > 0 ? { serviceEveryMonths: months } : {}),
            ...(stateChanged && reason.trim() ? { reason: reason.trim() } : {}),
          });
        }}
      >
        <Section title="What it is">
          <Field label="Name" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} name="name" autoComplete="off" placeholder="Zoom H6 recorder…" aria-label="Machine name" />
          </Field>
          <Field label="Category">
            <TextInput value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} name="category" autoComplete="off" list="machine-categories" placeholder="Audio recorder…" aria-label="Category" />
            <datalist id="machine-categories">
              {MACHINE_CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Make">
            <TextInput value={make} onChange={(e) => setMake(e.target.value)} maxLength={80} name="make" autoComplete="off" aria-label="Make" />
          </Field>
          <Field label="Model">
            <TextInput value={model} onChange={(e) => setModel(e.target.value)} maxLength={80} name="model" autoComplete="off" aria-label="Model" />
          </Field>
          <Field label="Version">
            <TextInput value={version} onChange={(e) => setVersion(e.target.value)} maxLength={60} name="version" autoComplete="off" placeholder="Firmware or edition…" aria-label="Version" />
          </Field>
          <Field label="Serial number">
            <TextInput value={serialNo} onChange={(e) => setSerialNo(e.target.value)} maxLength={80} name="serialNo" autoComplete="off" spellCheck={false} aria-label="Serial number" />
          </Field>
        </Section>

        <Section title="Where it came from">
          <Field label="How we got it">
            <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as MachineSource)} aria-label="How we got it">
              {MACHINE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {MACHINE_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier or donor">
            <TextInput value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={160} name="sourceName" autoComplete="off" aria-label="Supplier or donor" />
          </Field>
          <Field label="Contact">
            <TextInput value={sourceContact} onChange={(e) => setSourceContact(e.target.value)} maxLength={160} name="sourceContact" autoComplete="off" placeholder="Phone or email…" aria-label="Contact" />
          </Field>
          <Field label="Date received">
            <DatePicker value={acquiredOn} onChange={setAcquiredOn} aria-label="Date received" />
          </Field>
        </Section>

        <Section title="Where it is and how it is">
          <Field label="Location">
            <TextInput value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} name="location" autoComplete="off" placeholder="Room or cupboard…" aria-label="Location" />
          </Field>
          <Field label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value as MachineCondition)} aria-label="Condition">
              {MACHINE_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {MACHINE_CONDITION_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usage">
            <Select value={inUse ? 'in_use' : 'idle'} onChange={(e) => setInUse(e.target.value === 'in_use')} aria-label="Usage">
              <option value="in_use">Currently in use</option>
              <option value="idle">Not in use</option>
            </Select>
          </Field>
          <Field label="Service every (months)">
            <TextInput value={serviceEvery} onChange={(e) => setServiceEvery(e.target.value.replace(/\D/g, ''))} inputMode="numeric" name="serviceEvery" autoComplete="off" placeholder="Leave empty for none…" aria-label="Service every months" />
          </Field>
          {stateChanged ? (
            <div className="sm:col-span-2">
              <Field label="Reason for the change">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} name="reason" autoComplete="off" placeholder="Stopped recording after a fall…" aria-label="Reason for the change" />
              </Field>
            </div>
          ) : null}
        </Section>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} name="notes" autoComplete="off" aria-label="Notes" />
        </Field>

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : machine ? 'Save' : 'Add machine'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2.5 p-0 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
