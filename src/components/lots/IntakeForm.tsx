'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotCreateBody, LotContactInput } from '@/types/lot';
import { useReferenceList } from '@/hooks/useReferenceList';
import { date, dmyToIso, todayDmy } from '@/lib/format';
import {
  Field,
  FormError,
  GhostButton,
  PrimaryButton,
  Select,
  Textarea,
  TextInput,
} from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { EditableTable, focusEditableCell, type EditableColumn } from '@/components/ui/EditableTable';
import { RefSelect, SubtypeCell } from '@/components/ui/RefSelect';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import { useMe } from '@/hooks/useCan';
import {
  EMPTY_CONTACT,
  RightsTypeField,
  makeContactColumns,
  type ContactRow,
} from './lot-form-fields';
import { Stepper } from './Stepper';

function cleanContact(c: LotContactInput): LotContactInput {
  const out: LotContactInput = { name: c.name.trim() };
  if (c.phone?.trim()) out.phone = c.phone.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.address?.trim()) out.address = c.address.trim();
  return out;
}

/**
 * One editable row of the intake media table (step 1). All strings in the UI.
 * `id` is a client-only stable key so add/duplicate/delete never remounts
 * unrelated rows (index keys would steal focus and reset async sub-type state).
 */
interface MediaLineForm {
  id: string;
  format: string;
  dataType: string;
  mediaSubtype: string;
  quantity: string;
  quantityRemarks: string;
}

const EMPTY_LINE: Omit<MediaLineForm, 'id'> = {
  format: 'photo',
  dataType: 'physical',
  mediaSubtype: '',
  quantity: '',
  quantityRemarks: '',
};

/** Mirrors the server's per-line rules; returns the first failure, if any. */
function validateLine(l: MediaLineForm, i: number): { key: string; message: string } | null {
  // Errors are keyed by the stable row id, never the index, so deleting a
  // row above can never re-point a message at the wrong line.
  const tag = (f: string) => `${l.id}.${f}`;
  const lineNo = `Line ${i + 1}: `;
  if (!l.mediaSubtype.trim()) {
    return { key: tag('mediaSubtype'), message: `${lineNo}media sub-type is required.` };
  }
  const q = Number(l.quantity);
  if (!Number.isInteger(q) || q < 1) {
    return { key: tag('quantity'), message: `${lineNo}quantity must be a whole number of at least 1.` };
  }
  return null;
}

const STEPS = [
  { label: 'Origin & contacts' },
  { label: 'Media & quantities' },
  { label: 'Condition & notes' },
  { label: 'Rights & review' },
] as const;

/**
 * One-line orientation under the stepper. Step 1 is empty — its intro lives
 * on the "Media lines" section description instead.
 */
const STEP_INTROS: readonly (string | null)[] = [
  'Where the media came from and who to contact about it.',
  null,
  'Condition on arrival, why it was sent, and any return request.',
  'Rights paperwork, then a final review before registering.',
];

type FieldErrors = Partial<Record<string, string>>;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-1.5 border-b border-line-soft last:border-b-0">
      <span className="text-[12px] font-semibold text-ink-3">{label}</span>
      <span className="text-[13px] text-ink break-words">{value || '—'}</span>
    </div>
  );
}

function SummarySection({
  title,
  stepIndex,
  onEdit,
  children,
}: {
  title: string;
  stepIndex: number;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line-soft rounded-[6px] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-semibold text-accent bg-transparent border-0 p-0 cursor-pointer"
        >
          Edit
          <span className="sr-only"> {title} (step {stepIndex + 1})</span>
        </button>
      </div>
      {children}
    </section>
  );
}

export function IntakeForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('lot:create') : false;

  const [step, setStep] = useState(0);
  /**
   * Which steps the user has actually completed (left via a passing
   * validation). Drives the stepper ✓ — a step never filled in shows as
   * upcoming, never as done just because it sits behind the current one.
   */
  const [stepsDone, setStepsDone] = useState<boolean[]>(() => STEPS.map(() => false));
  const markDone = (index: number, done: boolean) =>
    setStepsDone((prev) =>
      prev[index] === done ? prev : prev.map((v, k) => (k === index ? done : v)),
    );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dateReceived, setDateReceived] = useState(todayDmy());
  const [originSource, setOriginSource] = useState('');
  const [owner, setOwner] = useState<ContactRow>({ ...EMPTY_CONTACT, id: 'owner' });
  const [pocs, setPocs] = useState<ContactRow[]>([]);
  /** `null` = no facilitator (the row IS the toggle — no separate checkbox). */
  const [facilitator, setFacilitator] = useState<ContactRow | null>(null);
  const [lines, setLines] = useState<MediaLineForm[]>([{ ...EMPTY_LINE, id: 'r0' }]);
  /** Row id counter for added/duplicated rows (contacts and media lines). */
  const rowId = useRef(1);
  const [conditionNotes, setConditionNotes] = useState('');
  const [conditionPhotoUrl, setConditionPhotoUrl] = useState('');
  const [reasonForSending, setReasonForSending] = useState('');
  const [senderRemarks, setSenderRemarks] = useState('');
  const [photoDate, setPhotoDate] = useState('');
  const [photoLocation, setPhotoLocation] = useState('');
  const [photoEvent, setPhotoEvent] = useState('');
  const [peopleInPhoto, setPeopleInPhoto] = useState('');
  const [digitalFilePath, setDigitalFilePath] = useState('');
  const [physicalLabelApplied, setPhysicalLabelApplied] = useState(false);
  const [containerLabelApplied, setContainerLabelApplied] = useState(false);
  const [returnRequested, setReturnRequested] = useState(false);
  const [returnFormat, setReturnFormat] = useState('');
  const [returnDuration, setReturnDuration] = useState('');
  const [returnDueDate, setReturnDueDate] = useState('');
  const [rightsType, setRightsType] = useState('');
  const [deedReference, setDeedReference] = useState('');
  const [rightsNotes, setRightsNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const originSources = useReferenceList('originSource');
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const returnFormatList = useReferenceList('returnFormat');

  const newRowId = () => `r${rowId.current++}`;

  /** A corrected cell stops showing its error immediately (inline feedback). */
  const clearPrefix = (prefix: string) =>
    setFieldErrors((prev) => {
      if (!Object.keys(prev).some((k) => k.startsWith(prefix))) return prev;
      const next: FieldErrors = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return next;
    });

  const setLine = (id: string, patch: Partial<MediaLineForm>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    clearPrefix(`${id}.`);
  };

  const updatePoc = (id: string, patch: Partial<ContactRow>) => {
    setPocs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    clearPrefix(`${id}.`);
  };

  const updateFac = (id: string, patch: Partial<ContactRow>) => {
    setFacilitator((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    clearPrefix(`${id}.`);
  };

  const updateOwner = (_id: string, patch: Partial<ContactRow>) => {
    setOwner((prev) => ({ ...prev, ...patch }));
    clearPrefix('owner.');
  };

  const totalQuantity = lines.reduce((sum, l) => {
    const q = Number(l.quantity);
    return sum + (Number.isInteger(q) && q > 0 ? q : 0);
  }, 0);

  const labelFor = (
    list: { items: { value: string; label: string }[] } | undefined,
    value: string,
    fallback?: (v: string) => string,
  ): string => {
    if (!value) return '';
    const hit = list?.items.find((i) => i.value === value);
    return hit?.label ?? (fallback ? fallback(value) : value);
  };

  const create = useMutation({
    mutationFn: (body: LotCreateBody) => lotsApi.create(body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      router.push(`/register/${res.id}`);
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
    const errs: FieldErrors = {};
    const add = (key: string, message: string) => {
      if (!errs[key]) errs[key] = message;
    };
    if (index === 0) {
      if (!dateReceived.trim()) add('dateReceived', 'Date received is required.');
      else if (!dmyToIso(dateReceived)) {
        add('dateReceived', 'Date received must be dd/mm/yyyy (e.g. 23/09/2026).');
      }
      if (!originSource) add('originSource', 'Origin source is required.');
      if (!owner.name.trim()) add('owner.name', 'Owner name is required.');
      for (const [i, p] of pocs.entries()) {
        if (!p.name.trim()) add(`${p.id}.name`, `Point of contact ${i + 1} needs a name.`);
      }
      if (facilitator && !facilitator.name.trim()) {
        add('fac.name', 'Facilitator name is required once a facilitator is added.');
      }
    } else if (index === 1) {
      for (const [i, l] of lines.entries()) {
        const failure = validateLine(l, i);
        if (failure) add(failure.key, failure.message);
      }
      if (totalQuantity > 20000) {
        add('lines.total', 'Total quantity across media lines cannot exceed 20000.');
      }
    }
    // Condition & notes / Rights are optional — nothing to gate on.
    return applyErrors(errs);
  };

  const goNext = () => {
    if (!validateStep(step)) {
      markDone(step, false);
      return;
    }
    markDone(step, true);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    clearErrors();
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpTo = (index: number) => {
    if (index === step) return;
    // Jumping is allowed, but the page being left must be valid first —
    // fill in the current step's details, then jump anywhere.
    if (!validateStep(step)) {
      markDone(step, false);
      return;
    }
    markDone(step, true);
    clearErrors();
    setFormError(null);
    setStep(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = () => {
    // Full pre-check mirrors the per-step gates, so a jump-to-review path can
    // never skip them. Every failure is collected first and shown at once —
    // the user should not have to submit five times to discover five problems.
    const errs: FieldErrors = {};
    const add = (key: string, message: string) => {
      if (!errs[key]) errs[key] = message;
    };
    if (!dateReceived.trim()) add('dateReceived', 'Date received is required.');
    const dateReceivedIso = dmyToIso(dateReceived);
    if (!dateReceivedIso) {
      add('dateReceived', 'Date received must be dd/mm/yyyy (e.g. 23/09/2026).');
    }
    if (!originSource) add('originSource', 'Origin source is required.');
    if (!owner.name.trim()) add('owner.name', 'Owner name is required.');
    for (const [i, p] of pocs.entries()) {
      if (!p.name.trim()) add(`${p.id}.name`, `Point of contact ${i + 1} needs a name.`);
    }
    if (facilitator && !facilitator.name.trim()) {
      add('fac.name', 'Facilitator name is required once a facilitator is added.');
    }
    for (const [i, l] of lines.entries()) {
      const failure = validateLine(l, i);
      if (failure) add(failure.key, failure.message);
    }
    const submitTotal = lines.reduce((sum, l) => sum + Number(l.quantity), 0);
    if (submitTotal > 20000) {
      add('lines.total', 'Total quantity across media lines cannot exceed 20000.');
    }

    const keys = Object.keys(errs);
    if (keys.length > 0) {
      const isLineKey = (k: string) =>
        k === 'lines.total' ||
        /\.(format|dataType|mediaSubtype|quantity|quantityRemarks)$/.test(k);
      if (keys.some(isLineKey)) markDone(1, false);
      if (keys.some((k) => !isLineKey(k))) markDone(0, false);
      const target = isLineKey(keys[0]!) ? 1 : 0;
      const changedStep = target !== step;
      if (changedStep) {
        setStep(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      // Defer focus when the step just changed — the target cell mounts on
      // the next render, so focusing now would be a no-op.
      applyErrors(errs, changedStep);
      return;
    }

    const body: LotCreateBody = {
      dateReceived: new Date(`${dateReceivedIso}T00:00:00`).toISOString(),
      originSource: originSource as LotCreateBody['originSource'],
      owner: cleanContact(owner),
      pointsOfContact: pocs.map(cleanContact),
      ...(facilitator ? { facilitator: cleanContact(facilitator) } : {}),
      mediaLines: lines.map((l) => ({
        format: l.format,
        dataType: l.dataType,
        mediaSubtype: l.mediaSubtype.trim(),
        quantity: Number(l.quantity),
        // The form no longer captures the split — selection is decided at a
        // later stage, so every line enters with nothing selected.
        quantityToDigitize: 0,
        quantityAlreadyDigitized: 0,
        ...(l.quantityRemarks.trim() ? { quantityRemarks: l.quantityRemarks.trim() } : {}),
      })),
      ...(conditionNotes.trim() ? { conditionNotes: conditionNotes.trim() } : {}),
      ...(conditionPhotoUrl.trim() ? { conditionPhotoUrl: conditionPhotoUrl.trim() } : {}),
      ...(reasonForSending.trim() ? { reasonForSending: reasonForSending.trim() } : {}),
      ...(senderRemarks.trim() ? { senderRemarks: senderRemarks.trim() } : {}),
      ...(rightsType.trim() || deedReference.trim() || rightsNotes.trim()
        ? {
            rights: {
              ...(rightsType.trim() ? { type: rightsType.trim() } : {}),
              ...(deedReference.trim() ? { deedReference: deedReference.trim() } : {}),
              ...(rightsNotes.trim() ? { notes: rightsNotes.trim() } : {}),
            },
          }
        : {}),
      ...(photoDate.trim() ? { photoDate: photoDate.trim() } : {}),
      ...(photoLocation.trim() ? { photoLocation: photoLocation.trim() } : {}),
      ...(photoEvent.trim() ? { photoEvent: photoEvent.trim() } : {}),
      ...(peopleInPhoto.trim() ? { peopleInPhoto: peopleInPhoto.trim() } : {}),
      ...(digitalFilePath.trim() ? { digitalFilePath: digitalFilePath.trim() } : {}),
      ...(physicalLabelApplied ? { physicalLabelApplied: true } : {}),
      ...(containerLabelApplied ? { containerLabelApplied: true } : {}),
      ...(returnRequested
        ? {
            returnRequested: true,
            ...(returnFormat ? { returnFormat } : {}),
            ...(returnDuration.trim() ? { returnDuration: returnDuration.trim() } : {}),
            ...(returnDueDate ? { returnDueAt: new Date(`${returnDueDate}T00:00:00`).toISOString() } : {}),
          }
        : {}),
    };
    create.mutate(body);
  };

  const originLabel = originSource
    ? labelFor(originSources.data, originSource, (v) => `${v}`)
    : '';
  const contactLine = (c: LotContactInput) =>
    [c.name, c.phone, c.email, c.address].filter(Boolean).join(' · ');
  /** One-line summary of a media line for the review step. */
  const lineSummary = (l: MediaLineForm): string => {
    const f = labelFor(formats.data, l.format, (v) => v.charAt(0).toUpperCase() + v.slice(1));
    const d = labelFor(dataTypes.data, l.dataType, (v) => v.charAt(0).toUpperCase() + v.slice(1));
    const parts = [
      `${f} · ${d} · ${l.mediaSubtype.trim() || '—'}`,
      `${l.quantity || '0'} items`,
    ];
    if (l.quantityRemarks.trim()) parts.push(l.quantityRemarks.trim());
    return parts.join(' — ');
  };

  /* ------------------------------------------------------------ columns */

  const lineColumns: EditableColumn<MediaLineForm>[] = [
    {
      key: 'format',
      header: 'Format',
      className: 'min-w-[138px]',
      render: ({ row, rowId, index, autoFocus }) => (
        <Select
          aria-label={`Line ${index + 1}, format`}
          autoFocus={autoFocus}
          value={row.format}
          onChange={(e) => setLine(rowId, { format: e.target.value, mediaSubtype: '' })}
        >
          {(formats.data?.items ?? []).map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'dataType',
      header: 'Data type',
      className: 'min-w-[128px]',
      render: ({ row, rowId, index, autoFocus }) => (
        <Select
          aria-label={`Line ${index + 1}, data type`}
          autoFocus={autoFocus}
          value={row.dataType}
          onChange={(e) => setLine(rowId, { dataType: e.target.value })}
        >
          {(dataTypes.data?.items ?? []).map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'mediaSubtype',
      header: 'Media sub-type',
      className: 'min-w-[180px]',
      required: true,
      render: ({ row, rowId, index, autoFocus }) => (
        <SubtypeCell
          format={row.format}
          value={row.mediaSubtype}
          onChange={(v) => setLine(rowId, { mediaSubtype: v })}
          ariaLabel={`Line ${index + 1}, media sub-type`}
          autoFocus={autoFocus}
        />
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      className: 'w-[112px]',
      required: true,
      render: ({ row, rowId, index, error, autoFocus }) => (
        <TextInput
          aria-label={`Line ${index + 1}, quantity`}
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
          inputMode="numeric"
          value={row.quantity}
          onChange={(e) => setLine(rowId, { quantity: e.target.value })}
          placeholder="e.g. 40"
          className="text-right tabular-nums"
        />
      ),
    },
    {
      key: 'quantityRemarks',
      header: 'Remarks',
      className: 'min-w-[150px]',
      render: ({ row, rowId, index, autoFocus }) => (
        <TextInput
          aria-label={`Line ${index + 1}, remarks`}
          autoFocus={autoFocus}
          value={row.quantityRemarks}
          onChange={(e) => setLine(rowId, { quantityRemarks: e.target.value })}
          placeholder="Optional"
        />
      ),
    },
  ];

  const ownerColumns = makeContactColumns(updateOwner);
  const pocColumns = makeContactColumns(updatePoc);
  const facColumns = makeContactColumns(updateFac);

  return (
    <Panel>
      <PanelHeader title="New intake" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} done={stepsDone} onJump={jumpTo} />
        {STEP_INTROS[step] ? (
          <p className="m-0 -mt-3 text-[12.5px] text-ink-3 max-w-[72ch]">{STEP_INTROS[step]}</p>
        ) : null}

        <FormError message={formError} />

        {/* ------------------------------------------------------ step 0 */}
        {step === 0 ? (
          <StepBlocks>
            <FormSection legend="Receipt">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Date received"
                  required
                  error={fieldErrors.dateReceived}
                >
                  <TextInput
                    value={dateReceived}
                    onChange={(e) => {
                      setDateReceived(e.target.value);
                      clearPrefix('dateReceived');
                    }}
                    placeholder="dd/mm/yyyy"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-describedby="date-received-hint"
                  />
                  <span id="date-received-hint" className="sr-only">
                    Format dd/mm/yyyy
                  </span>
                </Field>
                <Field
                  label="Origin source"
                  required
                  error={fieldErrors.originSource}
                >
                  <RefSelect
                    listKey="originSource"
                    value={originSource}
                    onChange={(v) => {
                      setOriginSource(v);
                      clearPrefix('originSource');
                    }}
                    placeholder="Select origin…"
                    createLabel="origin"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              legend="Owner"
              description="Legal owner of the originals — the person, family or trust the media belongs to."
            >
              <EditableTable
                columns={ownerColumns}
                rows={[owner]}
                getRowId={(o) => o.id}
                onChange={(next) => {
                  const row = next[0] ?? owner;
                  setOwner(row);
                  clearPrefix('owner.');
                }}
                errors={fieldErrors}
                minRows={1}
                maxRows={1}
                allowDelete={false}
                rowName={() => 'Owner'}
                emptyMessage="Owner is required."
              />
            </FormSection>

            <FormSection
              legend={`Points of contact ${pocs.length > 0 ? `(${pocs.length})` : ''}`}
              description="Friend of the cause (FOC) — day-to-day contact for pickup, questions and return coordination."
            >
              <EditableTable
                columns={pocColumns}
                rows={pocs}
                getRowId={(p) => p.id}
                onChange={setPocs}
                errors={fieldErrors}
                createRow={() => ({ ...EMPTY_CONTACT, id: newRowId() })}
                cloneRow={(p) => ({ ...p, id: newRowId() })}
                minRows={0}
                maxRows={5}
                addLabel="Add contact"
                rowName={(i) => `Contact ${i + 1}`}
                emptyMessage="No points of contact yet."
              />
            </FormSection>

            <FormSection
              legend="Facilitator"
              description="Volunteer or sevak who collected and facilitated this lot."
            >
              <EditableTable
                columns={facColumns}
                rows={facilitator ? [facilitator] : []}
                getRowId={(f) => f.id}
                onChange={(next) => setFacilitator(next[0] ?? null)}
                errors={fieldErrors}
                createRow={() => ({ ...EMPTY_CONTACT, id: 'fac' })}
                minRows={0}
                maxRows={1}
                addLabel="Add facilitator"
                rowName={() => 'Facilitator'}
                emptyMessage="No facilitator added."
              />
            </FormSection>
          </StepBlocks>
        ) : null}

        {/* ------------------------------------------------------ step 1 */}
        {step === 1 ? (
          <StepBlocks>
            <FormSection
              legend="Media lines"
              description="One row per format / sub-type combination — a mixed lot of prints and cassettes gets two rows. Selection for digitization happens at a later stage."
            >
              <EditableTable
                columns={lineColumns}
                rows={lines}
                getRowId={(l) => l.id}
                onChange={setLines}
                errors={fieldErrors}
                createRow={() => ({ ...EMPTY_LINE, id: newRowId() })}
                cloneRow={(l) => ({ ...l, id: newRowId() })}
                minRows={1}
                maxRows={20}
                addLabel="Add row"
                rowName={(i) => `Line ${i + 1}`}
                minRowsHint="At least one media line is required"
                emptyMessage="No media lines yet."
                footer={
                  <>
                    {fieldErrors['lines.total'] ? (
                      <span role="alert" className="text-[11.5px] font-medium text-danger">
                        {fieldErrors['lines.total']}
                      </span>
                    ) : null}
                    <span className="text-[12.5px] text-ink-2 tabular-nums">
                      Total: {totalQuantity} items across {lines.length}{' '}
                      {lines.length === 1 ? 'line' : 'lines'}
                    </span>
                  </>
                }
              />
            </FormSection>
          </StepBlocks>
        ) : null}

        {/* ------------------------------------------------------ step 2 */}
        {step === 2 ? (
          <StepBlocks>
            <FormSection legend="Condition">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Condition notes">
                  <Textarea
                    value={conditionNotes}
                    onChange={(e) => setConditionNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field
                  label="Condition photo"
                  error={fieldErrors.conditionPhotoUrl}
                  hint="A file reference or URL — upload arrives later."
                >
                  <TextInput
                    value={conditionPhotoUrl}
                    onChange={(e) => setConditionPhotoUrl(e.target.value)}
                    placeholder="Required"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection legend="Reason &amp; remarks">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Reason for sending">
                  <Textarea
                    value={reasonForSending}
                    onChange={(e) => setReasonForSending(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Sender remarks">
                  <Textarea
                    value={senderRemarks}
                    onChange={(e) => setSenderRemarks(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection legend="Media content metadata (optional)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Photo date">
                  <TextInput value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} placeholder="e.g. 1985 or c. 1990" />
                </Field>
                <Field label="Photo location">
                  <TextInput value={photoLocation} onChange={(e) => setPhotoLocation(e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Photo event">
                  <TextInput value={photoEvent} onChange={(e) => setPhotoEvent(e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="People in photo">
                  <TextInput value={peopleInPhoto} onChange={(e) => setPeopleInPhoto(e.target.value)} placeholder="Optional" />
                </Field>
              </div>
            </FormSection>

            <FormSection legend="Naming &amp; storage (optional)">
              <Field label="Digital file path">
                <TextInput
                  value={digitalFilePath}
                  onChange={(e) => setDigitalFilePath(e.target.value)}
                  placeholder="e.g. /archive/2026/LOT-2026-1285"
                />
              </Field>
              <div className="mt-2 flex flex-col gap-1">
                <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={physicalLabelApplied}
                    onChange={(e) => setPhysicalLabelApplied(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Physical label applied
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={containerLabelApplied}
                    onChange={(e) => setContainerLabelApplied(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Container label applied
                </label>
              </div>
            </FormSection>

            <FormSection legend="Return request (optional)">
              <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={returnRequested}
                  onChange={(e) => setReturnRequested(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Sender requested return of originals or a digital copy
              </label>
              {returnRequested ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Return format">
                    <RefSelect
                      listKey="returnFormat"
                      value={returnFormat}
                      onChange={setReturnFormat}
                      placeholder="Choose…"
                      createLabel="return format"
                    />
                  </Field>
                  <Field label="Return duration">
                    <TextInput
                      value={returnDuration}
                      onChange={(e) => setReturnDuration(e.target.value)}
                      placeholder="e.g. Within 30 days"
                    />
                  </Field>
                  <Field label="Return by (date)" hint="Calendar due date for the return.">
                    <TextInput
                      type="date"
                      value={returnDueDate}
                      onChange={(e) => setReturnDueDate(e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </FormSection>
          </StepBlocks>
        ) : null}

        {/* ------------------------------------------------------ step 3 */}
        {step === 3 ? (
          <StepBlocks>
            <FormSection legend="Rights (optional)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Rights type">
                  <RightsTypeField value={rightsType} onChange={setRightsType} />
                </Field>
                <Field label="Deed reference">
                  <TextInput
                    value={deedReference}
                    onChange={(e) => setDeedReference(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Rights notes">
                  <TextInput
                    value={rightsNotes}
                    onChange={(e) => setRightsNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection legend="Review">
              <div className="flex flex-col gap-3">
                <SummarySection title="Origin & contacts" stepIndex={0} onEdit={() => jumpTo(0)}>
                <SummaryRow label="Date received" value={date(dateReceived)} />
                <SummaryRow label="Origin source" value={originLabel} />
                <SummaryRow label="Owner" value={contactLine(owner)} />
                <SummaryRow
                  label="Points of contact"
                  value={pocs.length ? pocs.map(contactLine).join(' | ') : 'None'}
                />
                <SummaryRow
                  label="Facilitator"
                  value={facilitator ? contactLine(facilitator) : 'None'}
                />
              </SummarySection>

              <SummarySection title="Media & quantities" stepIndex={1} onEdit={() => jumpTo(1)}>
                {lines.map((l, i) => (
                  <SummaryRow key={i} label={lines.length > 1 ? `Line ${i + 1}` : 'Media'} value={lineSummary(l)} />
                ))}
                {lines.length > 1 ? (
                  <SummaryRow
                    label="Total"
                    value={`${totalQuantity} items across ${lines.length} lines`}
                  />
                ) : null}
              </SummarySection>

              <SummarySection title="Condition & notes" stepIndex={2} onEdit={() => jumpTo(2)}>
                <SummaryRow label="Condition notes" value={conditionNotes} />
                <SummaryRow label="Condition photo" value={conditionPhotoUrl} />
                <SummaryRow label="Reason for sending" value={reasonForSending} />
                <SummaryRow label="Sender remarks" value={senderRemarks} />
                <SummaryRow label="Photo date" value={photoDate} />
                <SummaryRow label="Photo location" value={photoLocation} />
                <SummaryRow label="Photo event" value={photoEvent} />
                <SummaryRow label="People in photo" value={peopleInPhoto} />
                <SummaryRow label="Digital file path" value={digitalFilePath} />
                <SummaryRow label="Physical label" value={physicalLabelApplied ? 'Applied' : 'Not applied'} />
                <SummaryRow label="Container label" value={containerLabelApplied ? 'Applied' : 'Not applied'} />
                <SummaryRow
                  label="Return requested"
                  value={returnRequested ? `Yes${returnFormat ? ` · ${labelFor(returnFormatList.data, returnFormat)}` : ''}${returnDuration ? ` · ${returnDuration}` : ''}${returnDueDate ? ` · by ${date(returnDueDate)}` : ''}` : 'No'}
                />
                </SummarySection>
              </div>
            </FormSection>
          </StepBlocks>
        ) : null}

        {/* ------------------------------------------------------- footer */}
        <div className="flex items-center gap-2 pt-1 border-t border-line-soft">
          {step > 0 ? (
            <GhostButton disabled={create.isPending} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton disabled={create.isPending} onClick={() => router.push('/register')}>
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
