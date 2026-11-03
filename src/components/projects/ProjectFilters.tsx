'use client';

import { useMemo, useState } from 'react';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useUserPicker } from '@/hooks/useUserPicker';
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

export interface ProjectFilterValues {
  coordinator: string;
  /** Has a lot of this format. */
  format: string;
  /** Has a lot at this stage. */
  stage: string;
  createdFrom: string;
  createdTo: string;
  /** Advanced filter rows as JSON ('' = none). */
  adv: string;
}

type DefId = 'coordinator' | 'format' | 'stage' | 'created';

const DEFS: { id: DefId; label: string; keys: (keyof ProjectFilterValues)[] }[] = [
  { id: 'coordinator', label: 'Coordinator', keys: ['coordinator'] },
  { id: 'format', label: 'Has lot of format', keys: ['format'] },
  { id: 'stage', label: 'Has lot at stage', keys: ['stage'] },
  { id: 'created', label: 'Created', keys: ['createdFrom', 'createdTo'] },
];

const EMPTY: ProjectFilterValues = { coordinator: '', format: '', stage: '', createdFrom: '', createdTo: '', adv: '' };

/** The project list's filter bar: the same chips, "+ Filter" menu and quick views as the lot list. */
export function ProjectFilters({
  search,
  onSearch,
  filters,
  onFilters,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: ProjectFilterValues;
  onFilters: (next: ProjectFilterValues) => void;
}) {
  const people = useUserPicker();
  const formats = useReferenceList('format');
  const stages = useReferenceList('stage');
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DefId[]>([]);

  const hasValue = (id: DefId) => DEFS.find((d) => d.id === id)!.keys.some((k) => filters[k] !== '');
  const isActive = search !== '' || filters.adv !== '' || DEFS.some((d) => hasValue(d.id));

  const clearAll = () => {
    onFilters({ ...EMPTY });
    onSearch('');
    setDrafts([]);
    setOpenId(null);
  };

  const options: Record<Exclude<DefId, 'created'>, FilterOption[]> = useMemo(
    () => ({
      coordinator: (people.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
      format: (formats.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
      stage: (stages.data?.items ?? []).map((i) => ({ value: i.value, label: i.label })),
    }),
    [people.data, formats.data, stages.data],
  );

  const valueText = (id: DefId): string => {
    if (id === 'created') {
      const a = filters.createdFrom ? isoToDmy(filters.createdFrom) : '';
      const b = filters.createdTo ? isoToDmy(filters.createdTo) : '';
      return a && b ? `${a} – ${b}` : a ? `From ${a}` : b ? `Until ${b}` : '';
    }
    const v = filters[id];
    return v ? (options[id].find((o) => o.value === v)?.label ?? v) : '';
  };

  const remove = (id: DefId) => {
    const next = { ...filters };
    for (const k of DEFS.find((d) => d.id === id)!.keys) next[k] = '';
    onFilters(next);
    setDrafts((d) => d.filter((x) => x !== id));
    setOpenId(null);
  };
  const closeChip = (id: DefId) => {
    setOpenId((cur) => (cur === id ? null : cur));
    if (!hasValue(id)) setDrafts((d) => d.filter((x) => x !== id));
  };
  const pick = (id: Exclude<DefId, 'created'>, v: string) => {
    onFilters({ ...filters, [id]: v });
    setDrafts((d) => d.filter((x) => x !== id));
    setOpenId(null);
  };

  const chipDefs = DEFS.filter((d) => hasValue(d.id) || drafts.includes(d.id));
  const chipCount = chipDefs.filter((d) => hasValue(d.id)).length;

  const createdSince = (from: string) => filters.createdFrom === from && filters.createdTo === '';
  const toggleSince = (from: string) =>
    onFilters(createdSince(from) ? { ...filters, createdFrom: '', createdTo: '' } : { ...filters, createdFrom: from, createdTo: '' });
  const views = [
    { id: 'all', label: 'All projects', active: !isActive, onApply: clearAll },
    { id: 'week', label: 'Last 7 days', active: createdSince(daysAgo(7)), onApply: () => toggleSince(daysAgo(7)) },
    { id: 'month', label: 'This month', active: createdSince(monthStart()), onApply: () => toggleSince(monthStart()) },
  ];

  const panelFor = (id: DefId) => {
    if (id === 'created') {
      return <DateRangePanel from={filters.createdFrom} to={filters.createdTo} onChange={(from, to) => onFilters({ ...filters, createdFrom: from, createdTo: to })} />;
    }
    if (id === 'coordinator' && people.isLoading) {
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
    <section aria-label="Filter projects" className="flex flex-col gap-3 rounded-[8px] border border-line bg-surface p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 basis-[320px]">
          <SearchBox value={search} onChange={onSearch} placeholder="Search by project code or name…" label="Search projects" />
        </div>
        <AdvancedFilterButton entity="projects" value={filters.adv} onChange={(adv) => onFilters({ ...filters, adv })} label="Advanced" />
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
            panelWidth={d.id === 'created' ? 320 : 280}
          >
            {panelFor(d.id)}
          </FilterChip>
        ))}
        <AddFilterMenu
          filters={DEFS.map((d) => ({ id: d.id, label: d.label, used: hasValue(d.id) || drafts.includes(d.id) }))}
          open={openId === 'add'}
          onOpenChange={(o) => setOpenId(o ? 'add' : null)}
          onAdd={(id) => {
            setDrafts((d) => [...d, id as DefId]);
            setOpenId(id);
          }}
        />
        {isActive ? (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto min-h-[32px] cursor-pointer touch-manipulation border-0 bg-transparent px-1 text-[12.5px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {chipCount > 1 || search || filters.adv ? 'Clear all' : 'Clear filter'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
