'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { CUSTOM_COLUMN_TYPES, DEPARTMENTS, type CustomColumnType, type DeptId } from '@/lib/item-columns';

/** "+" above the grid: name the column, pick its type and which department it belongs to. */
export function AddColumnDialog({
  pending,
  error,
  onAdd,
  onClose,
}: {
  pending: boolean;
  error: string | null;
  onAdd: (col: { label: string; type: CustomColumnType; dept: DeptId }) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomColumnType>('text');
  const [dept, setDept] = useState<DeptId | ''>('');

  return (
    <Dialog title="Add a column" subtitle="Added for this lot's Excel only, for everyone." onClose={onClose}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && dept) onAdd({ label: label.trim(), type, dept });
        }}
      >
        <Field label="Column name" required>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus autoComplete="off" />
        </Field>
        <Field label="Which department?" required>
          <Select value={dept} onChange={(e) => setDept(e.target.value as DeptId)} aria-label="Department">
            <option value="">Choose…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as CustomColumnType)} aria-label="Column type">
            {CUSTOM_COLUMN_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={pending || !label.trim() || !dept}>
            {pending ? 'Adding…' : 'Add column'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
