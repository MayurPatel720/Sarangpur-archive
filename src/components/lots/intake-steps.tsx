'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { LotContactInput } from '@/types/lot';
import { useReferenceList } from '@/hooks/useReferenceList';
import { date, dmyToIso, isoToDmy } from '@/lib/format';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, Select, Textarea, TextInput } from '@/components/ui/Form';
import { EditableTable, type EditableColumn } from '@/components/ui/EditableTable';
import { RefSelect, SubtypeCell } from '@/components/ui/RefSelect';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import {
  EMPTY_CONTACT,
  RightsTypeField,
  makeContactColumns,
  type ContactRow,
} from './lot-form-fields';

/**
 * The intake steps, shared by the standalone intake form (`mode: 'lot'`) and the
 * project wizard (`mode: 'project'`). One component per step, driven by a single
 * `IntakeDraft`. Project mode relaxes the required markers (date, origin and
 * owner may be filled later by the assignees) and hides the per-lot "Naming &
 * storage" block — those belong to each child lot, not to the project.
 */

export type IntakeMode = 'lot' | 'project';

export interface MediaLineForm {
  id: string;
  format: string;
  dataType: string;
  mediaSubtype: string;
  quantity: string;
  quantityRemarks: string;
}

export const EMPTY_LINE: Omit<MediaLineForm, 'id'> = {
  format: 'photo',
  dataType: 'physical',
  mediaSubtype: '',
  quantity: '',
  quantityRemarks: '',
};

export interface IntakeDraft {
  dateReceived: string;
  originSource: string;
  owner: ContactRow;
  pocs: ContactRow[];
  /** `null` = no facilitator (the row IS the toggle). */
  facilitator: ContactRow | null;
  lines: MediaLineForm[];
  conditionNotes: string;
  conditionPhotoUrl: string;
  reasonForSending: string;
  senderRemarks: string;
  photoDate: string;
  photoLocation: string;
  photoEvent: string;
  peopleInPhoto: string;
  digitalFilePath: string;
  physicalLabelApplied: boolean;
  containerLabelApplied: boolean;
  returnRequested: boolean;
  returnFormat: string;
  returnDuration: string;
  returnDueDate: string;
  rightsType: string;
  deedReference: string;
  rightsNotes: string;
}

/** ISO due date = date received (dd/mm/yyyy; today if blank) + N days. '' when days is empty. */
function dueDateFrom(receivedDmy: string, days: string): string {
  const n = Number(days);
  if (!Number.isInteger(n) || n <= 0) return '';
  const base = dmyToIso(receivedDmy);
  const d = base ? new Date(`${base}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDraft(seedLine: Omit<MediaLineForm, 'id'>, today: string): IntakeDraft {
  return {
    dateReceived: today,
    originSource: '',
    owner: { ...EMPTY_CONTACT, id: 'owner' },
    pocs: [],
    facilitator: null,
    lines: [{ ...seedLine, id: 'r0' }],
    conditionNotes: '',
    conditionPhotoUrl: '',
    reasonForSending: '',
    senderRemarks: '',
    photoDate: '',
    photoLocation: '',
    photoEvent: '',
    peopleInPhoto: '',
    digitalFilePath: '',
    physicalLabelApplied: false,
    containerLabelApplied: false,
    returnRequested: false,
    returnFormat: '',
    returnDuration: '',
    returnDueDate: '',
    rightsType: '',
    deedReference: '',
    rightsNotes: '',
  };
}

export type FieldErrors = Partial<Record<string, string>>;

/** Form state shared by every step: the draft, its patcher, errors and a row-id counter. */
export function useIntakeDraft(initial: () => IntakeDraft) {
  const [draft, setDraft] = useState<IntakeDraft>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const rowId = useRef(1);
  const newRowId = () => `r${rowId.current++}`;
  /** Accepts a value or an updater per key, like useState setters. */
  const patch = (p: { [K in keyof IntakeDraft]?: IntakeDraft[K] | ((prev: IntakeDraft[K]) => IntakeDraft[K]) }) =>
    setDraft((prev) => {
      const next = { ...prev } as Record<string, unknown>;
      for (const [k, v] of Object.entries(p)) {
        next[k] = typeof v === 'function' ? (v as (x: unknown) => unknown)(prev[k as keyof IntakeDraft]) : v;
      }
      return next as unknown as IntakeDraft;
    });
  /** A corrected cell stops showing its error immediately (inline feedback). */
  const clearPrefix = (prefix: string) =>
    setFieldErrors((prev) => {
      if (!Object.keys(prev).some((k) => k.startsWith(prefix))) return prev;
      const next: FieldErrors = {};
      for (const [k, v] of Object.entries(prev)) if (!k.startsWith(prefix)) next[k] = v;
      return next;
    });
  return { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId };
}

export interface StepCtx {
  mode: IntakeMode;
  draft: IntakeDraft;
  patch: ReturnType<typeof useIntakeDraft>['patch'];
  errors: FieldErrors;
  clearPrefix: (prefix: string) => void;
  newRowId: () => string;
  /** Locks the format dropdown to one block's format (standalone intake only). */
  initialFormat?: string;
}

/* --------------------------------------------------------------- validation */

/** Mirrors the server's per-line rules; returns the first failure, if any. */
export function validateLine(l: MediaLineForm, i: number): { key: string; message: string } | null {
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

export const isLineErrorKey = (k: string) =>
  k === 'lines.total' || /\.(format|dataType|mediaSubtype|quantity|quantityRemarks)$/.test(k);

export function totalQuantity(lines: MediaLineForm[]): number {
  return lines.reduce((sum, l) => {
    const q = Number(l.quantity);
    return sum + (Number.isInteger(q) && q > 0 ? q : 0);
  }, 0);
}

/** Origin & contacts step. Project mode: nothing is required. */
export function validateOrigin(d: IntakeDraft, mode: IntakeMode): FieldErrors {
  const errs: FieldErrors = {};
  const add = (key: string, message: string) => {
    if (!errs[key]) errs[key] = message;
  };
  if (mode === 'lot') {
    if (!d.dateReceived.trim()) add('dateReceived', 'Date received is required.');
    if (!d.originSource) add('originSource', 'Origin source is required.');
    if (!d.owner.name.trim()) add('owner.name', 'Owner name is required.');
  }
  if (d.dateReceived.trim() && !dmyToIso(d.dateReceived)) {
    add('dateReceived', 'Date received must be dd/mm/yyyy (e.g. 23/09/2026).');
  }
  // A half-filled owner row (phone but no name) is still a mistake in project mode.
  if (!d.owner.name.trim() && (d.owner.phone || d.owner.email || d.owner.address)) {
    add('owner.name', 'Owner name is required once other owner details are filled.');
  }
  for (const [i, p] of d.pocs.entries()) {
    if (!p.name.trim()) add(`${p.id}.name`, `Point of contact ${i + 1} needs a name.`);
  }
  if (d.facilitator && !d.facilitator.name.trim()) {
    add('fac.name', 'Facilitator name is required once a facilitator is added.');
  }
  return errs;
}

export function validateMedia(d: IntakeDraft): FieldErrors {
  const errs: FieldErrors = {};
  for (const [i, l] of d.lines.entries()) {
    const failure = validateLine(l, i);
    if (failure && !errs[failure.key]) errs[failure.key] = failure.message;
  }
  if (totalQuantity(d.lines) > 20000) {
    errs['lines.total'] = 'Total quantity across media lines cannot exceed 20000.';
  }
  return errs;
}

/* ------------------------------------------------------------ wire builders */

export function cleanContact(c: LotContactInput): LotContactInput {
  const out: LotContactInput = { name: c.name.trim() };
  if (c.phone?.trim()) out.phone = c.phone.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.address?.trim()) out.address = c.address.trim();
  return out;
}

export function hasPhotoLines(d: IntakeDraft): boolean {
  return d.lines.some((l) => l.format === 'photo');
}

/**
 * The shared intake fields in wire shape — exactly the keys of a project's `shared`
 * block and of the lot-create body. Empty values are omitted.
 */
export function buildSharedFields(d: IntakeDraft) {
  const photo = hasPhotoLines(d);
  const dateIso = dmyToIso(d.dateReceived);
  return {
    ...(dateIso ? { dateReceived: new Date(`${dateIso}T00:00:00`).toISOString() } : {}),
    ...(d.originSource ? { originSource: d.originSource } : {}),
    ...(d.owner.name.trim() ? { owner: cleanContact(d.owner) } : {}),
    ...(d.pocs.length ? { pointsOfContact: d.pocs.map(cleanContact) } : {}),
    ...(d.facilitator ? { facilitator: cleanContact(d.facilitator) } : {}),
    ...(d.conditionNotes.trim() ? { conditionNotes: d.conditionNotes.trim() } : {}),
    ...(d.conditionPhotoUrl.trim() ? { conditionPhotoUrl: d.conditionPhotoUrl.trim() } : {}),
    ...(d.reasonForSending.trim() ? { reasonForSending: d.reasonForSending.trim() } : {}),
    ...(d.senderRemarks.trim() ? { senderRemarks: d.senderRemarks.trim() } : {}),
    ...(photo && d.photoDate.trim() ? { photoDate: d.photoDate.trim() } : {}),
    ...(photo && d.photoLocation.trim() ? { photoLocation: d.photoLocation.trim() } : {}),
    ...(photo && d.photoEvent.trim() ? { photoEvent: d.photoEvent.trim() } : {}),
    ...(photo && d.peopleInPhoto.trim() ? { peopleInPhoto: d.peopleInPhoto.trim() } : {}),
    ...(d.returnRequested
      ? {
          returnRequested: true,
          ...(d.returnFormat ? { returnFormat: d.returnFormat } : {}),
          ...(Number(d.returnDuration) > 0 ? { returnDuration: `${Number(d.returnDuration)} ${Number(d.returnDuration) === 1 ? 'day' : 'days'}` } : {}),
          ...(d.returnDueDate ? { returnDueAt: new Date(`${d.returnDueDate}T00:00:00`).toISOString() } : {}),
        }
      : {}),
    ...(d.rightsType.trim() || d.deedReference.trim() || d.rightsNotes.trim()
      ? {
          rights: {
            ...(d.rightsType.trim() ? { type: d.rightsType.trim() } : {}),
            ...(d.deedReference.trim() ? { deedReference: d.deedReference.trim() } : {}),
            ...(d.rightsNotes.trim() ? { notes: d.rightsNotes.trim() } : {}),
          },
        }
      : {}),
  };
}

export function buildMediaLines(d: IntakeDraft) {
  return d.lines.map((l) => ({
    format: l.format,
    dataType: l.dataType,
    mediaSubtype: l.mediaSubtype.trim(),
    quantity: Number(l.quantity),
    // Selection for digitization is decided at a later stage.
    quantityToDigitize: 0,
    quantityAlreadyDigitized: 0,
    ...(l.quantityRemarks.trim() ? { quantityRemarks: l.quantityRemarks.trim() } : {}),
  }));
}

/* -------------------------------------------------------------------- steps */

export function OriginContactsStep({ ctx }: { ctx: StepCtx }) {
  const { mode, draft, patch, errors, clearPrefix, newRowId } = ctx;
  const req = mode === 'lot';
  const optional = req ? '' : ' (optional now — the assignee can fill it in)';

  const updatePoc = (id: string, p: Partial<ContactRow>) => {
    patch({ pocs: (prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)) });
    clearPrefix(`${id}.`);
  };
  const updateFac = (id: string, p: Partial<ContactRow>) => {
    patch({ facilitator: (prev) => (prev && prev.id === id ? { ...prev, ...p } : prev) });
    clearPrefix(`${id}.`);
  };
  const updateOwner = (_id: string, p: Partial<ContactRow>) => {
    patch({ owner: (prev) => ({ ...prev, ...p }) });
    clearPrefix('owner.');
  };
  const ownerColumns = makeContactColumns(updateOwner, { nameRequired: req });
  const pocColumns = makeContactColumns(updatePoc);
  const facColumns = makeContactColumns(updateFac);

  return (
    <StepBlocks>
      <FormSection legend="Receipt">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date received" required={req} error={errors.dateReceived}>
            <DatePicker
              value={dmyToIso(draft.dateReceived) ?? ''}
              onChange={(iso) => {
                const dmy = isoToDmy(iso);
                patch({
                  dateReceived: dmy,
                  ...(draft.returnDuration ? { returnDueDate: dueDateFrom(dmy, draft.returnDuration) } : {}),
                });
                clearPrefix('dateReceived');
              }}
              aria-label="Date received"
            />
          </Field>
          <Field label="Origin source" required={req} error={errors.originSource}>
            <RefSelect
              listKey="originSource"
              value={draft.originSource}
              onChange={(v) => {
                patch({ originSource: v });
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
        description={`Legal owner of the originals — the person, family or trust the media belongs to.${optional}`}
      >
        <EditableTable
          columns={ownerColumns}
          rows={[draft.owner]}
          getRowId={(o) => o.id}
          onChange={(next) => {
            patch({ owner: next[0] ?? draft.owner });
            clearPrefix('owner.');
          }}
          errors={errors}
          minRows={1}
          maxRows={1}
          allowDelete={false}
          rowName={() => 'Owner'}
          emptyMessage="Owner is required."
        />
      </FormSection>

      <FormSection
        legend={`Points of contact ${draft.pocs.length > 0 ? `(${draft.pocs.length})` : ''}`}
        description="Friend of the cause (FOC) — day-to-day contact for pickup, questions and return coordination."
      >
        <EditableTable
          columns={pocColumns}
          rows={draft.pocs}
          getRowId={(p) => p.id}
          onChange={(next) => patch({ pocs: next })}
          errors={errors}
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
          rows={draft.facilitator ? [draft.facilitator] : []}
          getRowId={(f) => f.id}
          onChange={(next) => patch({ facilitator: next[0] ?? null })}
          errors={errors}
          createRow={() => ({ ...EMPTY_CONTACT, id: 'fac' })}
          minRows={0}
          maxRows={1}
          addLabel="Add facilitator"
          rowName={() => 'Facilitator'}
          emptyMessage="No facilitator added."
        />
      </FormSection>
    </StepBlocks>
  );
}

export function ConditionStep({ ctx }: { ctx: StepCtx }) {
  const { mode, draft, patch, errors } = ctx;
  return (
    <StepBlocks>
      <FormSection legend="Condition">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Condition notes">
            <Textarea
              value={draft.conditionNotes}
              onChange={(e) => patch({ conditionNotes: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field
            label="Condition photo"
            error={errors.conditionPhotoUrl}
            hint="A file reference or URL — upload arrives later."
          >
            <TextInput
              value={draft.conditionPhotoUrl}
              onChange={(e) => patch({ conditionPhotoUrl: e.target.value })}
              placeholder="Optional"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection legend="Reason &amp; remarks">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Reason for sending">
            <Textarea
              value={draft.reasonForSending}
              onChange={(e) => patch({ reasonForSending: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Sender remarks">
            <Textarea
              value={draft.senderRemarks}
              onChange={(e) => patch({ senderRemarks: e.target.value })}
              placeholder="Optional"
            />
          </Field>
        </div>
      </FormSection>

      {hasPhotoLines(draft) ? (
        <FormSection legend="Media content metadata (optional)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Photo date">
              <TextInput value={draft.photoDate} onChange={(e) => patch({ photoDate: e.target.value })} placeholder="e.g. 1985 or c. 1990" />
            </Field>
            <Field label="Photo location">
              <TextInput value={draft.photoLocation} onChange={(e) => patch({ photoLocation: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Photo event">
              <TextInput value={draft.photoEvent} onChange={(e) => patch({ photoEvent: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="People in photo">
              <TextInput value={draft.peopleInPhoto} onChange={(e) => patch({ peopleInPhoto: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {mode === 'lot' ? (
        <FormSection legend="Naming &amp; storage (optional)">
          <Field label="Digital file path">
            <TextInput
              value={draft.digitalFilePath}
              onChange={(e) => patch({ digitalFilePath: e.target.value })}
              placeholder="e.g. /archive/2026/LOT-2026-1285"
            />
          </Field>
          <div className="mt-2 flex flex-col gap-1">
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input
                type="checkbox"
                checked={draft.physicalLabelApplied}
                onChange={(e) => patch({ physicalLabelApplied: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              Physical label applied
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input
                type="checkbox"
                checked={draft.containerLabelApplied}
                onChange={(e) => patch({ containerLabelApplied: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              Container label applied
            </label>
          </div>
        </FormSection>
      ) : null}

      <FormSection legend="Return request (optional)">
        <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={draft.returnRequested}
            onChange={(e) => patch({ returnRequested: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Sender requested return of originals or a digital copy
        </label>
        {draft.returnRequested ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Return format">
              <RefSelect
                listKey="returnFormat"
                value={draft.returnFormat}
                onChange={(v) => patch({ returnFormat: v })}
                placeholder="Choose…"
                createLabel="return format"
              />
            </Field>
            <Field label="Return duration (days)">
              <TextInput
                value={draft.returnDuration}
                onChange={(e) => {
                  const days = e.target.value.replace(/D/g, '').slice(0, 4);
                  patch({ returnDuration: days, returnDueDate: dueDateFrom(draft.dateReceived, days) });
                }}
                placeholder="e.g. 30"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field label="Return by (date)" hint="Set automatically from the duration; change it to override.">
              <DatePicker
                value={draft.returnDueDate}
                onChange={(iso) => patch({ returnDueDate: iso })}
                aria-label="Return by date"
              />
            </Field>
          </div>
        ) : null}
      </FormSection>
    </StepBlocks>
  );
}

export function MediaStep({ ctx, footerNote }: { ctx: StepCtx; footerNote?: ReactNode }) {
  const { draft, patch, errors, clearPrefix, newRowId, initialFormat } = ctx;
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const seedLine: Omit<MediaLineForm, 'id'> = initialFormat
    ? { ...EMPTY_LINE, format: initialFormat }
    : EMPTY_LINE;
  const total = totalQuantity(draft.lines);

  const setLine = (id: string, p: Partial<MediaLineForm>) => {
    patch({ lines: (prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l)) });
    clearPrefix(`${id}.`);
  };

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
          disabled={Boolean(initialFormat)}
          onChange={(e) => setLine(rowId, { format: e.target.value, mediaSubtype: '' })}
        >
          {(formats.data?.items ?? [])
            .filter((f) => !initialFormat || f.value === initialFormat)
            .map((f) => (
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

  const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  return (
    <StepBlocks>
      <FormSection
        legend="Media lines"
        description={
          initialFormat
            ? `This intake was opened from the ${cap(initialFormat)} block — every line in this lot is ${cap(initialFormat)}.`
            : ctx.mode === 'project'
              ? 'One row per format / sub-type. One lot is created per format — rows of the same format share a lot. Quantities are required; assignees can correct them later.'
              : 'One row per format / sub-type combination — a mixed lot of prints and cassettes gets two rows. Selection for digitization happens at a later stage.'
        }
      >
        <EditableTable
          columns={lineColumns}
          rows={draft.lines}
          getRowId={(l) => l.id}
          onChange={(next) => patch({ lines: next })}
          errors={errors}
          createRow={() => ({ ...seedLine, id: newRowId() })}
          cloneRow={(l) => ({
            ...l,
            ...(initialFormat ? { format: initialFormat } : {}),
            id: newRowId(),
          })}
          minRows={1}
          maxRows={20}
          addLabel="Add row"
          rowName={(i) => `Line ${i + 1}`}
          minRowsHint="At least one media line is required"
          emptyMessage="No media lines yet."
          footer={
            <>
              {errors['lines.total'] ? (
                <span role="alert" className="text-[11.5px] font-medium text-danger">
                  {errors['lines.total']}
                </span>
              ) : null}
              <span className="text-[12.5px] text-ink-2 tabular-nums">
                Total: {total} items across {draft.lines.length}{' '}
                {draft.lines.length === 1 ? 'line' : 'lines'}
              </span>
            </>
          }
        />
        {footerNote}
      </FormSection>
    </StepBlocks>
  );
}

export function RightsSection({ ctx }: { ctx: StepCtx }) {
  const { draft, patch } = ctx;
  return (
    <FormSection legend="Rights (optional)">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Rights type">
          <RightsTypeField value={draft.rightsType} onChange={(v) => patch({ rightsType: v })} />
        </Field>
        <Field label="Deed reference">
          <TextInput
            value={draft.deedReference}
            onChange={(e) => patch({ deedReference: e.target.value })}
            placeholder="Optional"
          />
        </Field>
        <Field label="Rights notes">
          <TextInput
            value={draft.rightsNotes}
            onChange={(e) => patch({ rightsNotes: e.target.value })}
            placeholder="Optional"
          />
        </Field>
      </div>
    </FormSection>
  );
}

/* ------------------------------------------------------------------- review */

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
  children: ReactNode;
}) {
  return (
    <section className="border border-line-soft rounded-[6px] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-semibold text-accent bg-transparent border-0 p-0 cursor-pointer min-h-[32px]"
        >
          Edit
          <span className="sr-only"> {title} (step {stepIndex + 1})</span>
        </button>
      </div>
      {children}
    </section>
  );
}

/** Read-only recap of the whole draft. `steps` maps each section to its step index for the Edit links. */
export function ReviewSummary({
  mode,
  draft,
  steps,
  onJump,
}: {
  mode: IntakeMode;
  draft: IntakeDraft;
  steps: { origin: number; condition: number; media: number };
  onJump: (index: number) => void;
}) {
  const originSources = useReferenceList('originSource');
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const returnFormatList = useReferenceList('returnFormat');
  const labelFor = (
    list: { items: { value: string; label: string }[] } | undefined,
    value: string,
    fallback?: (v: string) => string,
  ): string => {
    if (!value) return '';
    const hit = list?.items.find((i) => i.value === value);
    return hit?.label ?? (fallback ? fallback(value) : value);
  };
  const contactLine = (c: LotContactInput) =>
    [c.name, c.phone, c.email, c.address].filter(Boolean).join(' · ');
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const lineSummary = (l: MediaLineForm): string => {
    const parts = [
      `${labelFor(formats.data, l.format, cap)} · ${labelFor(dataTypes.data, l.dataType, cap)} · ${l.mediaSubtype.trim() || '—'}`,
      `${l.quantity || '0'} items`,
    ];
    if (l.quantityRemarks.trim()) parts.push(l.quantityRemarks.trim());
    return parts.join(' — ');
  };
  const total = totalQuantity(draft.lines);
  const d = draft;

  return (
    <div className="flex flex-col gap-3">
      <SummarySection title="Origin & contacts" stepIndex={steps.origin} onEdit={() => onJump(steps.origin)}>
        <SummaryRow label="Date received" value={d.dateReceived ? date(d.dateReceived) : ''} />
        <SummaryRow label="Origin source" value={labelFor(originSources.data, d.originSource)} />
        <SummaryRow label="Owner" value={d.owner.name.trim() ? contactLine(d.owner) : ''} />
        <SummaryRow
          label="Points of contact"
          value={d.pocs.length ? d.pocs.map(contactLine).join(' | ') : 'None'}
        />
        <SummaryRow label="Facilitator" value={d.facilitator ? contactLine(d.facilitator) : 'None'} />
      </SummarySection>

      <SummarySection title="Condition & notes" stepIndex={steps.condition} onEdit={() => onJump(steps.condition)}>
        <SummaryRow label="Condition notes" value={d.conditionNotes} />
        <SummaryRow label="Condition photo" value={d.conditionPhotoUrl} />
        <SummaryRow label="Reason for sending" value={d.reasonForSending} />
        <SummaryRow label="Sender remarks" value={d.senderRemarks} />
        {hasPhotoLines(d) ? (
          <>
            <SummaryRow label="Photo date" value={d.photoDate} />
            <SummaryRow label="Photo location" value={d.photoLocation} />
            <SummaryRow label="Photo event" value={d.photoEvent} />
            <SummaryRow label="People in photo" value={d.peopleInPhoto} />
          </>
        ) : null}
        {mode === 'lot' ? (
          <>
            <SummaryRow label="Digital file path" value={d.digitalFilePath} />
            <SummaryRow label="Physical label" value={d.physicalLabelApplied ? 'Applied' : 'Not applied'} />
            <SummaryRow label="Container label" value={d.containerLabelApplied ? 'Applied' : 'Not applied'} />
          </>
        ) : null}
        <SummaryRow
          label="Return requested"
          value={
            d.returnRequested
              ? `Yes${d.returnFormat ? ` · ${labelFor(returnFormatList.data, d.returnFormat)}` : ''}${Number(d.returnDuration) > 0 ? ` · ${d.returnDuration} ${Number(d.returnDuration) === 1 ? 'day' : 'days'}` : ''}${d.returnDueDate ? ` · by ${date(d.returnDueDate)}` : ''}`
              : 'No'
          }
        />
      </SummarySection>

      <SummarySection title="Media & quantities" stepIndex={steps.media} onEdit={() => onJump(steps.media)}>
        {d.lines.map((l, i) => (
          <SummaryRow key={l.id} label={d.lines.length > 1 ? `Line ${i + 1}` : 'Media'} value={lineSummary(l)} />
        ))}
        {d.lines.length > 1 ? (
          <SummaryRow label="Total" value={`${total} items across ${d.lines.length} lines`} />
        ) : null}
      </SummarySection>
    </div>
  );
}

/* ---------------------------------------------------------- shared → draft */

/** Build an editable draft from a project's stored shared values (for the shared-details editor). */
export function draftFromShared(
  shared: {
    dateReceived?: string;
    originSource?: string;
    owner?: LotContactInput;
    pointsOfContact?: LotContactInput[];
    facilitator?: LotContactInput | null;
    conditionNotes?: string;
    conditionPhotoUrl?: string;
    reasonForSending?: string;
    senderRemarks?: string;
    photoDate?: string;
    photoLocation?: string;
    photoEvent?: string;
    peopleInPhoto?: string;
    returnRequested?: boolean;
    returnFormat?: string;
    returnDuration?: string;
    returnDueAt?: string;
    rights?: { type?: string; deedReference?: string; notes?: string };
  },
  formats: string[],
): IntakeDraft {
  const base = emptyDraft(EMPTY_LINE, '');
  const withId = (c: LotContactInput, id: string): ContactRow => ({ ...c, id });
  return {
    ...base,
    dateReceived: shared.dateReceived ? date(shared.dateReceived) : '',
    originSource: shared.originSource ?? '',
    owner: shared.owner ? withId(shared.owner, 'owner') : base.owner,
    pocs: (shared.pointsOfContact ?? []).map((c, i) => withId(c, `p${i}`)),
    facilitator: shared.facilitator ? withId(shared.facilitator, 'fac') : null,
    // Only the formats matter here (they decide whether photo metadata shows).
    lines: formats.map((f, i) => ({ ...EMPTY_LINE, format: f, id: `f${i}` })),
    conditionNotes: shared.conditionNotes ?? '',
    conditionPhotoUrl: shared.conditionPhotoUrl ?? '',
    reasonForSending: shared.reasonForSending ?? '',
    senderRemarks: shared.senderRemarks ?? '',
    photoDate: shared.photoDate ?? '',
    photoLocation: shared.photoLocation ?? '',
    photoEvent: shared.photoEvent ?? '',
    peopleInPhoto: shared.peopleInPhoto ?? '',
    returnRequested: shared.returnRequested ?? false,
    returnFormat: shared.returnFormat ?? '',
    returnDuration: /^d+/.exec(shared.returnDuration ?? '')?.[0] ?? '',
    returnDueDate: shared.returnDueAt ? shared.returnDueAt.slice(0, 10) : '',
    rightsType: shared.rights?.type ?? '',
    deedReference: shared.rights?.deedReference ?? '',
    rightsNotes: shared.rights?.notes ?? '',
  };
}
