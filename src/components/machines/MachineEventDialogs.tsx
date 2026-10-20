'use client';

import { useState, type ReactNode } from 'react';
import { MACHINE_CONDITIONS, MACHINE_CONDITION_LABELS, type MachineCondition } from '@/lib/machine';
import { todayIso } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import type { Machine, MachineEventBody, MachinePart, MachineRepair } from '@/types/machine';

/** Small forms for everything done to a machine: spare parts, lending, repairs, servicing. */

interface Common {
  pending: boolean;
  error: string | null;
  onSubmit: (body: MachineEventBody) => void;
  onClose: () => void;
}

function Shell({
  title,
  subtitle,
  submitLabel,
  disabled,
  pending,
  error,
  onClose,
  onSave,
  children,
}: {
  title: string;
  subtitle?: string;
  submitLabel: string;
  disabled?: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog title={title} subtitle={subtitle} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {children}
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending || disabled}>
            {pending ? 'Saving…' : submitLabel}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

const conditionOptions = MACHINE_CONDITIONS.map((c) => (
  <option key={c} value={c}>
    {MACHINE_CONDITION_LABELS[c]}
  </option>
));

/** Add a spare part, or edit one. */
export function PartDialog({ part, ...c }: Common & { part?: MachinePart }) {
  const [name, setName] = useState(part?.name ?? '');
  const [partNo, setPartNo] = useState(part?.partNo ?? '');
  const [qty, setQty] = useState(String(part?.qty ?? 1));
  const [note, setNote] = useState(part?.note ?? '');
  const n = Number(qty);
  return (
    <Shell
      title={part ? 'Edit spare part' : 'Add a spare part'}
      submitLabel={part ? 'Save' : 'Add part'}
      disabled={!name.trim() || !Number.isInteger(n) || n < 0}
      {...c}
      onSave={() =>
        c.onSubmit(
          part
            ? { type: 'part.update', partId: part.id, name: name.trim(), partNo: partNo.trim() || null, qty: n, note: note.trim() || null }
            : { type: 'part.add', name: name.trim(), partNo, qty: n, note },
        )
      }
    >
      <Field label="Part" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} name="name" autoComplete="off" placeholder="Battery, lens cap, charger…" aria-label="Part name" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Part number">
          <TextInput value={partNo} onChange={(e) => setPartNo(e.target.value)} maxLength={60} name="partNo" autoComplete="off" spellCheck={false} aria-label="Part number" />
        </Field>
        <Field label="Quantity in stock">
          <TextInput value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" name="qty" autoComplete="off" aria-label="Quantity" />
        </Field>
      </div>
      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} name="note" autoComplete="off" aria-label="Note" />
      </Field>
    </Shell>
  );
}

/** Lend the machine to a person or team. */
export function LendDialog({ machine, ...c }: Common & { machine: Machine }) {
  const [borrower, setBorrower] = useState('');
  const [purpose, setPurpose] = useState('');
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [expectedReturn, setExpectedReturn] = useState('');
  return (
    <Shell
      title="Lend out"
      subtitle={`${machine.code} · ${machine.name}`}
      submitLabel="Lend out"
      disabled={!borrower.trim() || !issuedOn}
      {...c}
      onSave={() =>
        c.onSubmit({ type: 'loan.start', borrower: borrower.trim(), purpose, issuedOn, ...(expectedReturn ? { expectedReturn } : {}) })
      }
    >
      <Field label="Lent to" required>
        <TextInput value={borrower} onChange={(e) => setBorrower(e.target.value)} maxLength={120} name="borrower" autoComplete="off" placeholder="Person or team, like Multimedia cell…" aria-label="Lent to" />
      </Field>
      <Field label="Purpose">
        <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} name="purpose" autoComplete="off" placeholder="Recording the Diwali programme…" aria-label="Purpose" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Given on" required>
          <DatePicker value={issuedOn} onChange={setIssuedOn} aria-label="Given on" />
        </Field>
        <Field label="Expected back">
          <DatePicker value={expectedReturn} onChange={setExpectedReturn} aria-label="Expected back" />
        </Field>
      </div>
      <p className="m-0 text-[12px] text-ink-3">It goes out as “{MACHINE_CONDITION_LABELS[machine.condition]}”.</p>
    </Shell>
  );
}

/** Mark the current loan returned, with the condition it came back in. */
export function ReturnDialog({ machine, ...c }: Common & { machine: Machine }) {
  const [returnedOn, setReturnedOn] = useState(todayIso());
  const [conditionIn, setConditionIn] = useState<MachineCondition>(machine.condition);
  const [note, setNote] = useState('');
  return (
    <Shell
      title="Mark returned"
      subtitle={`${machine.code} · from ${machine.loanedTo ?? ''}`}
      submitLabel="Mark returned"
      disabled={!returnedOn}
      {...c}
      onSave={() => c.onSubmit({ type: 'loan.return', returnedOn, conditionIn, note })}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Returned on" required>
          <DatePicker value={returnedOn} onChange={setReturnedOn} aria-label="Returned on" />
        </Field>
        <Field label="Condition now">
          <Select value={conditionIn} onChange={(e) => setConditionIn(e.target.value as MachineCondition)} aria-label="Condition now">
            {conditionOptions}
          </Select>
        </Field>
      </div>
      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} name="note" autoComplete="off" placeholder="Scratch on the side, cable missing…" aria-label="Note" />
      </Field>
    </Shell>
  );
}

/** Report a fault. */
export function RepairDialog({ machine, ...c }: Common & { machine: Machine }) {
  const [fault, setFault] = useState('');
  const [reportedOn, setReportedOn] = useState(todayIso());
  const [vendor, setVendor] = useState('');
  return (
    <Shell
      title="Report a fault"
      subtitle={`${machine.code} · ${machine.name}`}
      submitLabel="Open repair"
      disabled={!fault.trim() || !reportedOn}
      {...c}
      onSave={() => c.onSubmit({ type: 'repair.add', fault: fault.trim(), reportedOn, vendor })}
    >
      <Field label="What is wrong" required>
        <TextInput value={fault} onChange={(e) => setFault(e.target.value)} maxLength={400} name="fault" autoComplete="off" placeholder="No sound from the left channel…" aria-label="What is wrong" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reported on" required>
          <DatePicker value={reportedOn} onChange={setReportedOn} aria-label="Reported on" />
        </Field>
        <Field label="Sent to (repairer)">
          <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} name="vendor" autoComplete="off" aria-label="Repairer" />
        </Field>
      </div>
      <p className="m-0 text-[12px] text-ink-3">A working machine is marked “Needs repair” until the repair is closed.</p>
    </Shell>
  );
}

/** Close a repair: who fixed it, cost, bill, and the condition afterwards. */
export function ResolveDialog({ repair, ...c }: Common & { repair: MachineRepair }) {
  const [resolvedOn, setResolvedOn] = useState(todayIso());
  const [vendor, setVendor] = useState(repair.vendor ?? '');
  const [cost, setCost] = useState('');
  const [billRef, setBillRef] = useState('');
  const [outcome, setOutcome] = useState('');
  const [condition, setCondition] = useState<MachineCondition>('working');
  const amount = cost.trim() === '' ? undefined : Number(cost);
  return (
    <Shell
      title="Close repair"
      subtitle={repair.fault}
      submitLabel="Close repair"
      disabled={!resolvedOn || (amount !== undefined && !Number.isFinite(amount))}
      {...c}
      onSave={() =>
        c.onSubmit({
          type: 'repair.resolve',
          repairId: repair.id,
          resolvedOn,
          vendor,
          ...(amount !== undefined ? { cost: amount } : {}),
          billRef,
          outcome,
          condition,
        })
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Fixed on" required>
          <DatePicker value={resolvedOn} onChange={setResolvedOn} aria-label="Fixed on" />
        </Field>
        <Field label="Condition now">
          <Select value={condition} onChange={(e) => setCondition(e.target.value as MachineCondition)} aria-label="Condition now">
            {conditionOptions}
          </Select>
        </Field>
        <Field label="Repairer">
          <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} name="vendor" autoComplete="off" aria-label="Repairer" />
        </Field>
        <Field label="Cost (₹)">
          <TextInput value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" name="cost" autoComplete="off" aria-label="Cost" />
        </Field>
        <Field label="Bill number">
          <TextInput value={billRef} onChange={(e) => setBillRef(e.target.value)} maxLength={120} name="billRef" autoComplete="off" spellCheck={false} aria-label="Bill number" />
        </Field>
        <Field label="What was done">
          <TextInput value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={400} name="outcome" autoComplete="off" placeholder="Replaced the cable…" aria-label="What was done" />
        </Field>
      </div>
    </Shell>
  );
}

/** Log that the machine was serviced. */
export function ServiceDialog({ machine, ...c }: Common & { machine: Machine }) {
  const [servicedOn, setServicedOn] = useState(todayIso());
  const [note, setNote] = useState('');
  return (
    <Shell
      title="Log a service"
      subtitle={`${machine.code} · ${machine.name}`}
      submitLabel="Log service"
      disabled={!servicedOn}
      {...c}
      onSave={() => c.onSubmit({ type: 'service.log', servicedOn, note })}
    >
      <Field label="Serviced on" required>
        <DatePicker value={servicedOn} onChange={setServicedOn} aria-label="Serviced on" />
      </Field>
      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} name="note" autoComplete="off" placeholder="Cleaned, heads aligned…" aria-label="Note" />
      </Field>
    </Shell>
  );
}
