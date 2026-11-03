'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  activeRules,
  EMPTY_ADVANCED,
  FILTER_FIELDS,
  MAX_FILTER_RULES,
  opsFor,
  parseAdvanced,
  serializeAdvanced,
  type AdvancedFilter,
  type FilterEntity,
  type FilterField,
  type FilterRule,
} from '@/lib/advanced-filters';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';

/**
 * The "Filters" button of the lot and project lists. It opens a builder with one row per condition
 * (field · condition · value), joined by ALL or ANY, and keeps named filters in this browser so a
 * favourite search is one click away. The page holds only the resulting JSON string (`adv`).
 */

const storageKey = (entity: FilterEntity) => `archive-tracker.saved-filters.${entity}`;

interface Saved {
  name: string;
  filter: AdvancedFilter;
}

function readSaved(entity: FilterEntity): Saved[] {
  try {
    const raw = window.localStorage.getItem(storageKey(entity));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as Saved[]).filter((s) => typeof s?.name === 'string' && Array.isArray(s?.filter?.rules)) : [];
  } catch {
    return [];
  }
}

function writeSaved(entity: FilterEntity, list: Saved[]) {
  try {
    window.localStorage.setItem(storageKey(entity), JSON.stringify(list.slice(0, 30)));
  } catch {
    /* storage unavailable: the filter just is not remembered */
  }
}

const blankRule = (field: FilterField): FilterRule => ({ field: field.id, op: opsFor(field)[0]!.id, value: '', value2: '' });

export function AdvancedFilterButton({
  entity,
  value,
  onChange,
  label = 'Filters',
}: {
  entity: FilterEntity;
  value: string;
  onChange: (value: string) => void;
  /** The button's text (the lot list calls it "Advanced" because its filter bar already has "+ Filter"). */
  label?: string;
}) {
  const fields = FILTER_FIELDS[entity];
  const [open, setOpen] = useState(false);
  const count = activeRules(parseAdvanced(value), fields).length;
  return (
    <>
      <GhostButton
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2"
        aria-haspopup="dialog"
      >
        {label}
        {count > 0 ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-white">{count}</span>
        ) : null}
      </GhostButton>
      {open ? (
        <FilterDialog
          entity={entity}
          initial={parseAdvanced(value)}
          onApply={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function FilterDialog({
  entity,
  initial,
  onApply,
  onClose,
}: {
  entity: FilterEntity;
  initial: AdvancedFilter | null;
  onApply: (value: string) => void;
  onClose: () => void;
}) {
  const fields = FILTER_FIELDS[entity];
  const [draft, setDraft] = useState<AdvancedFilter>(() =>
    initial && initial.rules.length > 0 ? initial : { ...EMPTY_ADVANCED, rules: [blankRule(fields[0]!)] },
  );
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState('');
  useEffect(() => setSaved(readSaved(entity)), [entity]);

  const stages = useReferenceList('stage');
  const decisions = useReferenceList('decision');
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const returnStatuses = useReferenceList('returnStatus');
  const origins = useReferenceList('originSource');
  const users = useUserPicker();
  const optionLists = useMemo(
    () => ({
      stage: stages.data?.items ?? [],
      decision: decisions.data?.items ?? [],
      format: formats.data?.items ?? [],
      dataType: dataTypes.data?.items ?? [],
      returnStatus: returnStatuses.data?.items ?? [],
      originSource: origins.data?.items ?? [],
    }),
    [stages.data, decisions.data, formats.data, dataTypes.data, returnStatuses.data, origins.data],
  );

  const setRule = (i: number, patch: Partial<FilterRule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const removeRule = (i: number) => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }));
  const addRule = () => setDraft((d) => (d.rules.length >= MAX_FILTER_RULES ? d : { ...d, rules: [...d.rules, blankRule(fields[0]!)] }));
  const complete = activeRules(draft, fields).length;

  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name || complete === 0) return;
    const next = [{ name, filter: { match: draft.match, rules: activeRules(draft, fields) } }, ...saved.filter((s) => s.name !== name)];
    setSaved(next);
    writeSaved(entity, next);
    setSaveName('');
  };
  const deleteSaved = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    writeSaved(entity, next);
  };

  return (
    <Dialog wide title="Filters" subtitle={entity === 'lots' ? 'Show lots that match these conditions.' : 'Show projects that match these conditions.'} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(serializeAdvanced(draft, fields));
        }}
      >
        {saved.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-2">Saved filters</span>
            <div className="flex flex-wrap gap-2">
              {saved.map((s) => (
                <span key={s.name} className="inline-flex items-center overflow-hidden rounded-[6px] border border-line-strong bg-surface text-[12.5px] font-medium text-ink-2">
                  <button type="button" onClick={() => setDraft({ match: s.filter.match ?? 'all', rules: s.filter.rules })} className="h-8 cursor-pointer border-0 bg-transparent px-2.5 text-ink-2 hover:text-ink">
                    {s.name}
                  </button>
                  <button type="button" aria-label={`Delete saved filter ${s.name}`} onClick={() => deleteSaved(s.name)} className="h-8 cursor-pointer border-0 border-l border-line bg-transparent px-2 text-ink-3 hover:text-danger">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          Show items that match
          <Select value={draft.match} onChange={(e) => setDraft((d) => ({ ...d, match: e.target.value as 'all' | 'any' }))} aria-label="Match all or any condition" className="!h-9 !w-auto">
            <option value="all">all</option>
            <option value="any">any</option>
          </Select>
          of these conditions
        </div>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {draft.rules.map((rule, i) => {
            const field = fields.find((f) => f.id === rule.field) ?? fields[0]!;
            const ops = opsFor(field);
            const needsValue = rule.op !== 'empty' && rule.op !== 'not_empty';
            return (
              <li key={i} className="m-0 grid grid-cols-1 gap-2 rounded-[8px] border border-line bg-surface-subtle p-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
                <Select
                  value={field.id}
                  aria-label={`Condition ${i + 1}, field`}
                  onChange={(e) => {
                    const next = fields.find((f) => f.id === e.target.value)!;
                    setRule(i, { field: next.id, op: opsFor(next)[0]!.id, value: '', value2: '' });
                  }}
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select value={rule.op} aria-label={`Condition ${i + 1}, comparison`} onChange={(e) => setRule(i, { op: e.target.value, value2: '' })}>
                  {ops.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <div className="flex min-w-0 items-center gap-2">
                  {needsValue ? (
                    <>
                      <ValueInput field={field} value={rule.value ?? ''} onChange={(v) => setRule(i, { value: v })} label={`Condition ${i + 1}, value`} lists={optionLists} users={users.data?.users ?? []} />
                      {rule.op === 'between' ? (
                        <>
                          <span className="text-[12px] text-ink-3">and</span>
                          <ValueInput field={field} value={rule.value2 ?? ''} onChange={(v) => setRule(i, { value2: v })} label={`Condition ${i + 1}, second value`} lists={optionLists} users={users.data?.users ?? []} />
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[12px] text-ink-4">No value needed</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove condition ${i + 1}`}
                  onClick={() => removeRule(i)}
                  className="h-9 w-9 cursor-pointer justify-self-end rounded-[6px] border border-line-strong bg-surface text-[16px] text-ink-3 hover:text-danger"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <GhostButton type="button" onClick={addRule} disabled={draft.rules.length >= MAX_FILTER_RULES}>
            + Add condition
          </GhostButton>
          <span className="text-[12px] text-ink-3">{complete} of {draft.rules.length} ready to apply</span>
          <span className="ml-auto flex items-center gap-2">
            <TextInput value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={40} name="filterName" autoComplete="off" placeholder="Name to save this filter…" aria-label="Name to save this filter" className="!h-9 !w-[200px]" />
            <GhostButton type="button" onClick={saveCurrent} disabled={!saveName.trim() || complete === 0}>
              Save
            </GhostButton>
          </span>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={() => setDraft({ ...EMPTY_ADVANCED, rules: [blankRule(fields[0]!)] })}>
            Clear all
          </GhostButton>
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit">Apply filters</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

type Lists = Record<string, { value: string; label: string }[]>;

function ValueInput({
  field,
  value,
  onChange,
  label,
  lists,
  users,
}: {
  field: FilterField;
  value: string;
  onChange: (v: string) => void;
  label: string;
  lists: Lists;
  users: { id: string; name: string }[];
}) {
  if (field.type === 'date') return <DatePicker value={value} onChange={onChange} aria-label={label} />;
  if (field.type === 'select') {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">Choose…</option>
        {(lists[field.options ?? ''] ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.type === 'user') {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">Choose…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <TextInput
      value={value}
      onChange={(e) => onChange(field.type === 'number' ? e.target.value.replace(/[^\d.-]/g, '') : e.target.value)}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      maxLength={200}
      name="filterValue"
      autoComplete="off"
      placeholder={field.type === 'number' ? 'Number…' : 'Type a value…'}
      aria-label={label}
    />
  );
}
