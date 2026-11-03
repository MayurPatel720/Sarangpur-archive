'use client';

import { useMemo, useState } from 'react';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Select } from '@/components/ui/Form';
import { Skeleton } from '@/components/ui/primitives';
import { AdvancedFilterButton } from '@/components/ui/AdvancedFilters';
import {
  AddFilterMenu,
  DateRangePanel,
  daysAgo,
  FilterChip,
  monthStart,
  OptionList,
  QuickViews,
  SearchBox,
  type FilterOption,
} from '@/components/ui/FilterBar';
import { isoToDmy } from '@/lib/format';

export interface LotFilters {
  q: string;
  stage: string;
  decision: string;
  format: string;
  dataType: string;
  receiver: string;
  /** User id, or 'me' for the signed-in user. */
  assignee: string;
  returnStatus: string;
  sort: string;
  receivedFrom: string;
  receivedTo: string;
  /** Advanced filter rows as JSON ('' = none). */
  adv: string;
}

export const EMPTY_FILTERS: LotFilters = {
  q: '',
  stage: '',
  decision: '',
  format: '',
  dataType: '',
  receiver: '',
  assignee: '',
  returnStatus: '',
  sort: '-dateReceived',
  receivedFrom: '',
  receivedTo: '',
  adv: '',
};

/** The filters that can sit on the bar as chips. "Received" is one chip over the two date keys. */
type DefId = 'stage' | 'decision' | 'format' | 'dataType' | 'receiver' | 'assignee' | 'returnStatus' | 'received';

const DEFS: { id: DefId; label: string; keys: (keyof LotFilters)[] }[] = [
  { id: 'stage', label: 'Stage', keys: ['stage'] },
  { id: 'decision', label: 'Decision', keys: ['decision'] },
  { id: 'format', label: 'Format', keys: ['format'] },
  { id: 'dataType', label: 'Data type', keys: ['dataType'] },
  { id: 'receiver', label: 'Receiver', keys: ['receiver'] },
  { id: 'assignee', label: 'Assignee', keys: ['assignee'] },
  { id: 'returnStatus', label: 'Return status', keys: ['returnStatus'] },
  { id: 'received', label: 'Received', keys: ['receivedFrom', 'receivedTo'] },
];

const SORTS = [
  { value: '-dateReceived', label: 'Newest first' },
  { value: 'dateReceived', label: 'Oldest first' },
  { value: '-quantity', label: 'Largest first' },
  { value: 'quantity', label: 'Smallest first' },
  { value: 'stage', label: 'By stage' },
  { value: '-stage', label: 'By stage (desc)' },
];

export function RegisterFilters({
  filters,
  onChange,
  lockedFormat,
}: {
  filters: LotFilters;
  onChange: (next: LotFilters) => void;
  /** Format block the list was opened from: the format filter is fixed and has no chip. */
  lockedFormat?: string;
}) {
  const stages = useReferenceList('stage');
  const decisions = useReferenceList('decision');
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const returnStatuses = useReferenceList('returnStatus');
  const people = useUserPicker();

  /** `openId`: the panel that is open ('add' for the + Filter menu). `drafts`: chips added but still without a value. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DefId[]>([]);

  const hasValue = (id: DefId) => DEFS.find((d) => d.id === id)!.keys.some((k) => filters[k] !== '');
  const isActive =
    filters.q !== '' || filters.adv !== '' || DEFS.some((d) => d.id !== 'format' && hasValue(d.id)) || (!lockedFormat && filters.format !== '');

  const clearAll = () => {
    onChange({
      ...EMPTY_FILTERS,
      // Clearing filters must never drop the block's format lock, or the chosen sort.
      ...(lockedFormat ? { format: lockedFormat } : {}),
      sort: filters.sort,
    });
    setDrafts([]);
    setOpenId(null);
  };

  const options: Record<Exclude<DefId, 'received'>, FilterOption[]> = useMemo(
    () => ({
      stage: (stages.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
      decision: (decisions.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
      format: (formats.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
      dataType: (dataTypes.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
      receiver: (people.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
      assignee: [{ value: 'me', label: 'Assigned to me' }, ...(people.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))],
      returnStatus: (returnStatuses.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
    }),
    [stages.data, decisions.data, formats.data, dataTypes.data, people.data, returnStatuses.data],
  );

  const valueText = (id: DefId): string => {
    if (id === 'received') {
      const a = filters.receivedFrom ? isoToDmy(filters.receivedFrom) : '';
      const b = filters.receivedTo ? isoToDmy(filters.receivedTo) : '';
      return a && b ? `${a} – ${b}` : a ? `From ${a}` : b ? `Until ${b}` : '';
    }
    const v = filters[id];
    if (!v) return '';
    return options[id].find((o) => o.value === v)?.label ?? v;
  };

  const remove = (id: DefId) => {
    const next = { ...filters };
    for (const k of DEFS.find((d) => d.id === id)!.keys) next[k] = '' as never;
    onChange(next);
    setDrafts((d) => d.filter((x) => x !== id));
    setOpenId(null);
  };

  const closeChip = (id: DefId) => {
    setOpenId((cur) => (cur === id ? null : cur));
    if (!hasValue(id)) setDrafts((d) => d.filter((x) => x !== id));
  };

  const pick = (id: Exclude<DefId, 'received'>, v: string) => {
    onChange({ ...filters, [id]: v });
    setDrafts((d) => d.filter((x) => x !== id));
    setOpenId(null);
  };

  // Chips: every filter with a value, plus the ones just added from "+ Filter". The locked format has no chip.
  const chipDefs = DEFS.filter((d) => (d.id !== 'format' || !lockedFormat) && (hasValue(d.id) || drafts.includes(d.id)));
  const chipCount = chipDefs.filter((d) => hasValue(d.id)).length;

  const views = [
    { id: 'all', label: 'All lots', active: !isActive, onApply: clearAll },
    {
      id: 'mine',
      label: 'My lots',
      active: filters.assignee === 'me',
      onApply: () => onChange({ ...filters, assignee: filters.assignee === 'me' ? '' : 'me' }),
    },
    {
      id: 'decision',
      label: 'At decision',
      active: filters.stage === 'decision',
      onApply: () => onChange({ ...filters, stage: filters.stage === 'decision' ? '' : 'decision' }),
    },
    {
      id: 'scanning',
      label: 'In scanning',
      active: filters.stage === 'scanning',
      onApply: () => onChange({ ...filters, stage: filters.stage === 'scanning' ? '' : 'scanning' }),
    },
    {
      id: 'week',
      label: 'Last 7 days',
      active: filters.receivedFrom === daysAgo(7) && filters.receivedTo === '',
      onApply: () =>
        onChange(
          filters.receivedFrom === daysAgo(7) && filters.receivedTo === ''
            ? { ...filters, receivedFrom: '', receivedTo: '' }
            : { ...filters, receivedFrom: daysAgo(7), receivedTo: '' },
        ),
    },
    {
      id: 'month',
      label: 'This month',
      active: filters.receivedFrom === monthStart() && filters.receivedTo === '',
      onApply: () =>
        onChange(
          filters.receivedFrom === monthStart() && filters.receivedTo === ''
            ? { ...filters, receivedFrom: '', receivedTo: '' }
            : { ...filters, receivedFrom: monthStart(), receivedTo: '' },
        ),
    },
  ];

  const panelFor = (id: DefId) => {
    if (id === 'received') {
      return <DateRangePanel from={filters.receivedFrom} to={filters.receivedTo} onChange={(from, to) => onChange({ ...filters, receivedFrom: from, receivedTo: to })} />;
    }
    if (id === 'receiver' && people.isLoading) {
      return (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      );
    }
    return (
      <OptionList
        options={options[id]}
        value={filters[id]}
        onPick={(v) => pick(id, v)}
        placeholder={`Find ${DEFS.find((d) => d.id === id)!.label.toLowerCase()}…`}
        empty="Nothing to choose from yet."
      />
    );
  };

  return (
    <section aria-label="Filter lots" className="flex flex-col gap-3 rounded-[8px] border border-line bg-surface p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 basis-[320px]">
          <SearchBox
            value={filters.q}
            onChange={(q) => onChange({ ...filters, q })}
            placeholder="Search owner, phone, lot ref, place, remarks…"
            label="Search lots"
          />
        </div>
        <div className="w-[148px] shrink-0">
          <Select value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value })} aria-label="Sort lots" className="h-10 text-[13px]">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <AdvancedFilterButton entity="lots" value={filters.adv} onChange={(adv) => onChange({ ...filters, adv })} label="Advanced" />
      </div>

      <QuickViews views={views} />

      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3" aria-label="Active filters">
        {chipDefs.map((d) => (
          <FilterChip
            key={d.id}
            name={d.label}
            valueText={valueText(d.id)}
            open={openId === d.id}
            onOpenChange={(o) => (o ? setOpenId(d.id) : closeChip(d.id))}
            onRemove={() => remove(d.id)}
            panelWidth={d.id === 'received' ? 320 : 280}
          >
            {panelFor(d.id)}
          </FilterChip>
        ))}
        <AddFilterMenu
          filters={DEFS.filter((d) => d.id !== 'format' || !lockedFormat).map((d) => ({
            id: d.id,
            label: d.label,
            used: hasValue(d.id) || drafts.includes(d.id),
          }))}
          open={openId === 'add'}
          onOpenChange={(o) => setOpenId(o ? 'add' : null)}
          onAdd={(id) => {
            setDrafts((d) => [...d, id as DefId]);
            setOpenId(id);
          }}
        />
        {lockedFormat ? <span className="text-[12px] text-ink-3">Format is fixed to this block.</span> : null}
        {isActive ? (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto min-h-[32px] cursor-pointer touch-manipulation border-0 bg-transparent px-1 text-[12.5px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {chipCount > 1 || filters.q || filters.adv ? 'Clear all' : 'Clear filter'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
