'use client';

import type { LotContactInput } from '@/types/lot';
import { TextInput } from '@/components/ui/Form';
import { EditableTable, type EditableColumn } from '@/components/ui/EditableTable';
import { FormSection } from '@/components/ui/FormSection';
import { RefSelect, SubtypeCell } from '@/components/ui/RefSelect';

export const EMPTY_CONTACT: LotContactInput = { name: '' };

/**
 * A contact row for the shared `EditableTable`: the wire shape plus a
 * client-only stable id so add/delete never remounts sibling rows.
 */
export type ContactRow = LotContactInput & { id: string };

/* ------------------------------------------- reference people ("who knows") */

/** Info-only reference contact row: wire shape plus a client-only stable id. */
export type ReferencePersonRow = { id: string; name: string; phone: string };

export const MAX_REFERENCE_ROWS = 5;

/** Errors keyed `${rowId}.name|phone`. A completely empty row is not an error (it is dropped on submit). */
export function validateReferencePeople(rows: ReferencePersonRow[]): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const [i, r] of rows.entries()) {
    const name = r.name.trim();
    const phone = r.phone.trim();
    if (!name && !phone) continue;
    if (!name) errs[`${r.id}.name`] = `Person ${i + 1} needs a name.`;
    if (!phone) errs[`${r.id}.phone`] = `Person ${i + 1} needs a number.`;
  }
  return errs;
}

/** Wire shape: trimmed, empty rows dropped. */
export function cleanReferencePeople(rows: ReferencePersonRow[]): { name: string; phone: string }[] {
  return rows
    .map((r) => ({ name: r.name.trim(), phone: r.phone.trim() }))
    .filter((r) => r.name || r.phone);
}

/** "Name · Number" display line. */
export const referencePersonLine = (p: { name: string; phone: string }) => `${p.name} · ${p.phone}`;

/** The "People" table, shared by intake, project wizard and lot edit. */
export function ReferencePeopleSection({
  rows,
  onChange,
  newRowId,
  errors,
  onEdit,
}: {
  rows: ReferencePersonRow[];
  onChange: (next: ReferencePersonRow[]) => void;
  newRowId: () => string;
  errors?: Partial<Record<string, string>>;
  /** Called with the row id after a cell edit (to clear its error). */
  onEdit?: (id: string) => void;
}) {
  const update = (id: string, p: Partial<ReferencePersonRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
    onEdit?.(id);
  };
  const columns: EditableColumn<ReferencePersonRow>[] = [
    {
      key: 'name',
      header: 'Name',
      className: 'min-w-[160px]',
      required: true,
      render: ({ row, rowId, rowLabel, error, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, name`}
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
          value={row.name}
          onChange={(e) => update(rowId, { name: e.target.value })}
          placeholder="Full name"
          maxLength={120}
        />
      ),
    },
    {
      key: 'phone',
      header: 'Number',
      className: 'min-w-[128px]',
      required: true,
      render: ({ row, rowId, rowLabel, error, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, number`}
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
          inputMode="tel"
          value={row.phone}
          onChange={(e) => update(rowId, { phone: e.target.value })}
          placeholder="Phone number"
          maxLength={30}
        />
      ),
    },
  ];
  return (
    <FormSection
      legend={`People ${rows.length > 0 ? `(${rows.length})` : ''}`}
    >
      <EditableTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onChange={onChange}
        errors={errors}
        createRow={() => ({ id: newRowId(), name: '', phone: '' })}
        cloneRow={(r) => ({ ...r, id: newRowId() })}
        minRows={0}
        maxRows={MAX_REFERENCE_ROWS}
        addLabel="Add person"
        rowName={(i) => `Person ${i + 1}`}
        emptyMessage="No people added yet."
      />
    </FormSection>
  );
}

/* ------------------------------------------------- contact columns ----- */

/**
 * Contact columns for the shared `EditableTable` (intake + lot edit).
 * `update(rowId, patch)` applies a cell edit in the owning form's state.
 */
export function makeContactColumns(
  update: (id: string, patch: Partial<ContactRow>) => void,
  opts: { nameRequired?: boolean } = {},
): EditableColumn<ContactRow>[] {
  const nameRequired = opts.nameRequired ?? true;
  return [
    {
      key: 'name',
      header: 'Name',
      className: 'min-w-[160px]',
      required: nameRequired,
      render: ({ row, rowId, rowLabel, error, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, name`}
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
          value={row.name}
          onChange={(e) => update(rowId, { name: e.target.value })}
          placeholder="Full name"
        />
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'min-w-[128px]',
      render: ({ row, rowId, rowLabel, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, phone`}
          autoFocus={autoFocus}
          inputMode="tel"
          value={row.phone ?? ''}
          onChange={(e) => update(rowId, { phone: e.target.value })}
          placeholder="Optional"
        />
      ),
    },
    {
      key: 'email',
      header: 'Email',
      className: 'min-w-[180px]',
      render: ({ row, rowId, rowLabel, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, email`}
          autoFocus={autoFocus}
          inputMode="email"
          value={row.email ?? ''}
          onChange={(e) => update(rowId, { email: e.target.value })}
          placeholder="Optional"
        />
      ),
    },
    {
      key: 'address',
      header: 'Address',
      className: 'min-w-[180px]',
      render: ({ row, rowId, rowLabel, autoFocus }) => (
        <TextInput
          aria-label={`${rowLabel}, address`}
          autoFocus={autoFocus}
          value={row.address ?? ''}
          onChange={(e) => update(rowId, { address: e.target.value })}
          placeholder="Optional"
        />
      ),
    },
  ];
}

/**
 * Tier-2 vocabulary field. Reads the format list's `subtypeListKey` meta;
 * empty means free text (SPEC Q2). Thin wrapper over `SubtypeCell` — the
 * admin-only inline create button lives there.
 */
export function SubtypeField({
  format,
  value,
  onChange,
  id,
  ariaLabel,
  autoFocus,
}: {
  format: string;
  value: string;
  onChange: (v: string) => void;
  /** Passed through to the underlying control (table cells have no Field wrapper). */
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  return (
    <SubtypeCell
      format={format}
      value={value}
      onChange={onChange}
      id={id}
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
    />
  );
}

/* ------------------------------------------------------ rights type field */

export function RightsTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <RefSelect
      listKey="rightsType"
      value={value}
      onChange={onChange}
      placeholder="Select a rights type…"
      createLabel="rights type"
    />
  );
}
