'use client';

import { TextInput, GhostButton } from '@/components/ui/Form';
import { IconButton } from '@/components/ui/IconButton';
import { IconPlus } from '@/components/ui/icons';
import { MAX_REFERENCE_ROWS, type ReferencePersonRow } from '@/components/lots/lot-form-fields';

const newId = () => Math.random().toString(36).slice(2);

/**
 * Compact editor for the people involved in a project: one line per person (name, phone, remove).
 * Errors are keyed `${rowId}.name` / `${rowId}.phone`, the same as the lot form's People table.
 */
export function ProjectPeopleEditor({
  rows,
  onChange,
  errors = {},
  onEdit,
  hint,
}: {
  rows: ReferencePersonRow[];
  onChange: (next: ReferencePersonRow[]) => void;
  errors?: Partial<Record<string, string>>;
  onEdit?: (id: string) => void;
  hint?: string;
}) {
  const update = (id: string, p: Partial<ReferencePersonRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
    onEdit?.(id);
  };
  const full = rows.length >= MAX_REFERENCE_ROWS;

  return (
    <section aria-label="People involved in this project" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold text-ink">People involved in this project</h3>
        <span className="text-[12px] text-ink-3 tnum">
          {rows.length} of {MAX_REFERENCE_ROWS}
        </span>
      </div>
      {hint ? <p className="m-0 text-[12.5px] leading-relaxed text-ink-3">{hint}</p> : null}

      {rows.length === 0 ? (
        <p className="m-0 rounded-[8px] bg-surface-sunken px-3.5 py-3 text-[12.5px] text-ink-3">
          Nobody added yet.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((r, i) => {
            const nameErr = errors[`${r.id}.name`];
            const phoneErr = errors[`${r.id}.phone`];
            return (
              <li key={r.id} className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                  <TextInput
                    aria-label={`Person ${i + 1}, name`}
                    aria-invalid={Boolean(nameErr)}
                    value={r.name}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    placeholder="Full name"
                    maxLength={120}
                    className="col-span-1"
                  />
                  <TextInput
                    aria-label={`Person ${i + 1}, phone number`}
                    aria-invalid={Boolean(phoneErr)}
                    inputMode="tel"
                    value={r.phone}
                    onChange={(e) => update(r.id, { phone: e.target.value })}
                    placeholder="Phone number"
                    maxLength={30}
                    className="order-3 col-span-1 sm:order-none"
                  />
                  <IconButton
                    label={`Remove person ${i + 1}`}
                    icon="trash"
                    variant="danger"
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    className="sm:row-auto"
                  />
                </div>
                {nameErr || phoneErr ? (
                  <span role="alert" className="text-[12px] text-danger">
                    {nameErr ?? phoneErr}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <GhostButton
          onClick={() => onChange([...rows, { id: newId(), name: '', phone: '' }])}
          disabled={full}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconPlus size={14} />
            Add person
          </span>
        </GhostButton>
        {full ? <span className="ml-3 text-[12px] text-ink-3">Limit reached.</span> : null}
      </div>
    </section>
  );
}
