'use client';

import type { LotContactInput } from '@/types/lot';
import { TextInput } from '@/components/ui/Form';
import type { EditableColumn } from '@/components/ui/EditableTable';
import { RefSelect, SubtypeCell } from '@/components/ui/RefSelect';

export const EMPTY_CONTACT: LotContactInput = { name: '' };

/**
 * A contact row for the shared `EditableTable`: the wire shape plus a
 * client-only stable id so add/delete never remounts sibling rows.
 */
export type ContactRow = LotContactInput & { id: string };

/* ------------------------------------------------- contact columns ----- */

/**
 * Contact columns for the shared `EditableTable` (intake + lot edit).
 * `update(rowId, patch)` applies a cell edit in the owning form's state.
 */
export function makeContactColumns(
  update: (id: string, patch: Partial<ContactRow>) => void,
): EditableColumn<ContactRow>[] {
  return [
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
