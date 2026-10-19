'use client';

import { useMemo, useState } from 'react';
import { CLEAR, buildBulkSet, bulkFieldsFor, type BulkField } from '@/lib/bulk-fields';
import { DEPARTMENTS, type CustomColumn, type DeptId } from '@/lib/item-columns';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { MAX_RECHECK_WEEKS } from '@/lib/recheck';
import { refOptions, type RefLists } from '@/lib/ref-lists';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import type { GridItem, ItemsBulkSet } from '@/types/items';

const SEARCH_FROM = 12;

/**
 * "Set the same value on every ticked row". Every field comes from the column registry and the
 * lot's custom columns, for the media formats of the rows that are ticked — nothing is listed by
 * hand (src/lib/bulk-fields.ts). A field that fits only some of the ticked formats says so and is
 * applied only to those rows. Blank = leave as it is; "Clear" blanks a value.
 */
export function BulkEditBar({
  items,
  customColumns,
  lists,
  canDecide,
  pending,
  onApply,
  onClear,
}: {
  items: GridItem[];
  customColumns: CustomColumn[];
  /** The admin-managed lists behind the dropdown fields. */
  lists: RefLists;
  canDecide: boolean;
  pending: boolean;
  onApply: (set: ItemsBulkSet) => void;
  onClear: () => void;
}) {
  const count = items.length;
  const formats = useMemo(() => [...new Set(items.map((i) => i.format))], [items]);
  const fields = useMemo(
    () => bulkFieldsFor(formats, customColumns).filter((f) => canDecide || !f.decision),
    [formats, customColumns, canDecide],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<DeptId>>(() => new Set<DeptId>(['details']));

  const setValue = (id: string, v: string) => {
    setValues((p) => ({ ...p, [id]: v }));
    setErrors((p) => {
      if (!(id in p)) return p;
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  const q = query.trim().toLowerCase();
  const visible = q ? fields.filter((f) => f.label.toLowerCase().includes(q)) : fields;
  const groups = DEPARTMENTS.map((d) => ({ dept: d, fields: visible.filter((f) => f.dept === d.id) })).filter((g) => g.fields.length > 0);
  const filled = (list: BulkField[]) => list.filter((f) => (values[f.id] ?? '') !== '').length;

  const apply = () => {
    const { set, errors: errs } = buildBulkSet(fields, values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Open the sections that hold a problem.
      const bad = new Set(fields.filter((f) => errs[f.id]).map((f) => f.dept));
      setOpen((prev) => new Set([...prev, ...bad]));
      return;
    }
    if (Object.keys(set).length === 0) return;
    onApply(set);
  };

  const control = (f: BulkField) => {
    const v = values[f.id] ?? '';
    const label = `${f.label} for selected items`;
    switch (f.input) {
      case 'select': {
        // Subcategory offers the chosen Category's items; with no Category chosen here it offers all of them
        // (each as "Category › Subcategory") and the server checks every row's own Category.
        const parentValue = f.refParent ? values[f.refParent.column] : undefined;
        const narrowed = f.refParent && parentValue ? refOptions(f, lists, parentValue) : null;
        const options = narrowed ?? (lists[f.refList ?? ''] ?? []).map((o) => {
          const parentList = f.refParent ? lists['prasadiCategory'] : undefined;
          const cat = f.refParent ? parentList?.find((c) => c.value === o.meta?.[f.refParent!.metaKey])?.label : undefined;
          return { ...o, label: cat ? `${cat} › ${o.label}` : o.label };
        });
        return (
          <Select value={v === CLEAR ? '' : v} onChange={(e) => setValue(f.id, e.target.value)} aria-label={label}>
            <option value="">No change</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      }
      case 'yesno':
        return (
          <Select value={v} onChange={(e) => setValue(f.id, e.target.value)} aria-label={label}>
            <option value="">No change</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value={CLEAR}>Clear</option>
          </Select>
        );
      case 'flag':
        return (
          <Select value={v} onChange={(e) => setValue(f.id, e.target.value)} aria-label={label}>
            <option value="">No change</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </Select>
        );
      case 'disposition':
        return (
          <Select value={v} onChange={(e) => setValue(f.id, e.target.value)} aria-label={label}>
            <option value="">No change</option>
            <option value="return">Return</option>
            <option value="discard">Discard</option>
            <option value={CLEAR}>Clear</option>
          </Select>
        );
      case 'weeks':
        return (
          <span className="flex items-center gap-1.5">
            <TextInput
              type="number"
              min={1}
              max={MAX_RECHECK_WEEKS}
              value={v === CLEAR ? '' : v}
              onChange={(e) => setValue(f.id, e.target.value)}
              placeholder={v === CLEAR ? 'Will be cleared' : 'No change'}
              aria-label={label}
            />
            <span className="text-[12.5px] text-ink-2">weeks</span>
          </span>
        );
      case 'number':
        return (
          <TextInput
            type="number"
            value={v === CLEAR ? '' : v}
            onChange={(e) => setValue(f.id, e.target.value)}
            placeholder={v === CLEAR ? 'Will be cleared' : 'No change'}
            aria-label={label}
          />
        );
      default:
        return (
          <TextInput
            value={v === CLEAR ? '' : v}
            onChange={(e) => setValue(f.id, e.target.value)}
            placeholder={v === CLEAR ? 'Will be cleared' : f.input === 'date' ? 'No change — dd/mm/yyyy' : 'No change'}
            aria-label={label}
          />
        );
    }
  };

  const clearable = (f: BulkField) => f.input === 'text' || f.input === 'date' || f.input === 'number' || f.input === 'weeks' || f.input === 'select';

  return (
    <section aria-label="Bulk edit selected items" className="rounded-[8px] border border-accent bg-accent-soft p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">
          Set for {count} selected {count === 1 ? 'item' : 'items'}
        </span>
        <span className="text-[12px] text-ink-3">
          {formats.length > 1 ? `${formats.map((f) => FORMAT_LABELS[f as Format] ?? f).join(' + ')} — fields that fit only some of them apply to those rows. ` : ''}
          Blank fields are left as they are.
        </span>
        <GhostButton onClick={onClear} className="sm:ml-auto">
          Clear selection
        </GhostButton>
      </div>

      {fields.length >= SEARCH_FROM ? (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find a field (${fields.length})`}
          aria-label="Find a field to set"
          className="!h-9 sm:max-w-[320px]"
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const isOpen = Boolean(q) || open.has(g.dept.id);
          const n = filled(g.fields);
          return (
            <div key={g.dept.id} className="rounded-[6px] border border-line bg-surface">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.dept.id)) next.delete(g.dept.id);
                    else next.add(g.dept.id);
                    return next;
                  })
                }
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left"
              >
                <span aria-hidden className="w-3 text-[12px] text-ink-3">
                  {isOpen ? '▾' : '▸'}
                </span>
                <span className="text-[13px] font-semibold text-ink">{g.dept.label}</span>
                <span className="text-[12px] text-ink-3">
                  {g.fields.length} {g.fields.length === 1 ? 'field' : 'fields'}
                  {n > 0 ? ` · ${n} to change` : ''}
                </span>
              </button>
              {isOpen ? (
                <div className="grid grid-cols-1 gap-3 border-t border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-4">
                  {g.fields.map((f) => (
                    <Field
                      key={f.id}
                      label={f.label}
                      error={errors[f.id]}
                      hint={f.onlyFor ? `${f.onlyFor.map((x) => FORMAT_LABELS[x as Format] ?? x).join(' / ')} rows only` : undefined}
                    >
                      <div className="flex flex-col gap-1">
                        {control(f)}
                        {clearable(f) ? (
                          <button
                            type="button"
                            onClick={() => setValue(f.id, values[f.id] === CLEAR ? '' : CLEAR)}
                            className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[11.5px] font-medium text-accent hover:underline"
                          >
                            {values[f.id] === CLEAR ? 'Undo clear' : 'Clear this field'}
                          </button>
                        ) : null}
                      </div>
                    </Field>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {groups.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No field matches “{query}”.</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton disabled={pending} onClick={apply}>
          {pending ? 'Saving…' : `Apply to ${count}`}
        </PrimaryButton>
        {Object.keys(errors).length > 0 ? (
          <span role="alert" className="text-[12.5px] font-medium text-danger">
            Fix the highlighted {Object.keys(errors).length === 1 ? 'field' : 'fields'} first.
          </span>
        ) : null}
      </div>
    </section>
  );
}
