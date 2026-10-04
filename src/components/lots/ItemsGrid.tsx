'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GridApi } from 'ag-grid-community';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Field, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem, ItemsBulkSet } from '@/types/items';
import { ItemEditDialog } from './ItemEditDialog';
import { AddItemDialog } from './AddItemDialog';
import { ItemFamilyGrid, type ColumnGroup } from './ItemFamilyGrid';
import { useMe } from '@/hooks/useCan';

/**
 * The lot's Items tab: items grouped into one collapsible AG Grid per media-subtype
 * family (see src/lib/item-columns.ts). The assignee fills in the item details and
 * answers the decision questions (Yes / No / blank); the server computes each item's
 * result. Tick rows to set the same values on many items at once. Deciding the last
 * item decides the lot ("split by item").
 */

type Filter = 'all' | 'unnamed' | 'undecided' | 'archive' | 'return' | 'discard';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unnamed', label: 'No name' },
  { id: 'undecided', label: 'Undecided' },
  { id: 'archive', label: 'Archive' },
  { id: 'return', label: 'Return' },
  { id: 'discard', label: 'Discard' },
];

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

const ROW_PX = 42;
const matchesFilter = (r: GridItem, f: Filter) =>
  f === 'unnamed' ? !r.name : f === 'undecided' ? !r.result : f === 'all' ? true : r.result === f;

export function ItemsGrid({ lotId }: { lotId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const narrow = useNarrow();
  const gridApis = useRef<Map<string, GridApi<GridItem>>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [hidden, setHidden] = useState<Record<ColumnGroup, boolean>>({
    details: false,
    decision: false,
    digitization: true,
  });
  /** Explicit open/closed per family; null until the user touches it (then: first family open). */
  const [expanded, setExpanded] = useState<Record<string, boolean> | null>(null);
  const [selectedBy, setSelectedBy] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<GridItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const me = useMe();
  const canAdd = Boolean(me.data?.grants.includes('item:create'));

  const grid = useQuery({
    queryKey: queryKeys.lots.itemsGrid(lotId),
    queryFn: () => itemsGridApi.get(lotId),
  });
  const physical = useReferenceList('physicalSource');
  const conditions = useReferenceList('itemCondition');
  const reasons = useReferenceList('notDigitizedReason');
  const physicalItems = useMemo(() => physical.data?.items ?? [], [physical.data]);
  const conditionItems = useMemo(() => conditions.data?.items ?? [], [conditions.data]);
  const reasonItems = useMemo(() => reasons.data?.items ?? [], [reasons.data]);

  const save = useMutation({
    mutationFn: (v: { itemIds: string[]; set: ItemsBulkSet }) => itemsGridApi.update(lotId, v),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
      if (res.finalized) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
        toast.success(
          'Lot decided from its items',
          res.finalized.decision === 'archive'
            ? `Archive — moved to ${res.finalized.stage}. Returns/discards are queued item by item.`
            : `All items ${res.finalized.decision} — the lot moved to ${res.finalized.stage}.`,
        );
      } else if (res.blockedBy.length) {
        toast.info('Every item is decided', res.blockedBy.join(' '));
      }
    },
    onError: (e) => {
      toast.error('Could not save', e instanceof ApiRequestError ? e.message : undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
    },
  });

  const data = grid.data;
  const canDetails = data?.editable.details ?? false;
  const canDecide = data?.editable.decision ?? false;

  /** One group per exact media subtype, in order of first appearance, with all items (for progress) and filtered rows. */
  const families = useMemo(() => {
    const map = new Map<string, { all: GridItem[]; rows: GridItem[] }>();
    for (const it of data?.items ?? []) {
      const fam = it.subtypeLabel.trim() || 'Other';
      let g = map.get(fam);
      if (!g) map.set(fam, (g = { all: [], rows: [] }));
      g.all.push(it);
      if (matchesFilter(it, filter)) g.rows.push(it);
    }
    return [...map.entries()].map(([name, g]) => ({ name, ...g }));
  }, [data, filter]);

  const isOpen = (name: string, index: number) => (expanded ? (expanded[name] ?? false) : index === 0);
  const setAll = (open: boolean) => setExpanded(Object.fromEntries(families.map((f) => [f.name, open])));
  const toggle = (name: string) =>
    setExpanded(Object.fromEntries(families.map((f, i) => [f.name, f.name === name ? !isOpen(f.name, i) : isOpen(f.name, i)])));

  const selected = useMemo(() => Object.values(selectedBy).flat(), [selectedBy]);
  const onSelectionChange = useCallback(
    (family: string, ids: string[]) =>
      setSelectedBy((prev) => {
        const cur = prev[family] ?? [];
        if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return prev;
        if (ids.length === 0 && !(family in prev)) return prev;
        return { ...prev, [family]: ids };
      }),
    [],
  );
  const onApi = useCallback((family: string, api: GridApi<GridItem> | null) => {
    if (api) gridApis.current.set(family, api);
    else gridApis.current.delete(family);
  }, []);
  const deselectAll = () => gridApis.current.forEach((api) => api.deselectAll());
  const onSave = useCallback((itemIds: string[], set: ItemsBulkSet) => save.mutate({ itemIds, set }), [save]);

  // Full screen: lock page scroll; Escape exits (unless a dialog or a cell editor/popup is using it).
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || editing || showAdd) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('.ag-cell-inline-editing, .ag-popup, .ag-cell-editing-error')) return;
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, editing, showAdd]);

  if (grid.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Items" />
        <div className="p-4 flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Panel>
    );
  }
  if (grid.isError || !data) {
    return (
      <Panel>
        <ErrorState message="Couldn't load the items." onRetry={() => grid.refetch()} />
      </Panel>
    );
  }

  const s = data.summary;
  const single = families.length <= 1;

  const gridHeight = (rowCount: number) => {
    if (single) return fullscreen ? '100%' : 'max(420px, calc(100dvh - 320px))';
    const natural = 100 + rowCount * ROW_PX;
    return fullscreen ? `min(${natural}px, calc(100dvh - 200px))` : `${Math.min(natural, 560)}px`;
  };

  return (
    <Panel>
      <PanelHeader title={`Items (${s.total})`}>
        <span className="ml-auto flex items-center gap-2">
          <GhostButton onClick={() => setFullscreen(true)}>Full screen</GhostButton>
          {canAdd && canDetails ? <GhostButton onClick={() => setShowAdd(true)}>Add item</GhostButton> : null}
        </span>
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
          <span>
            <span className="font-semibold text-ink tabular-nums">{s.decided}</span> of {s.total} decided
          </span>
          <span>
            <span className="font-semibold text-ink tabular-nums">{s.named}</span> named
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Badge severity="good">Archive {s.archive}</Badge>
            <Badge severity="info">Return {s.return}</Badge>
            <Badge severity="critical">Discard {s.discard}</Badge>
          </span>
        </div>

        {!canDetails ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Read only — only the lot&apos;s assignee and admins can fill in items.
          </p>
        ) : !canDecide ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Decisions are locked — this lot has been decided. Item details stay editable.
          </p>
        ) : (
          <p className="m-0 text-[12px] text-ink-3 max-w-[90ch]">
            Give each item a name, then answer the questions. The result is worked out for you; for “Return or discard?”
            pick which and a reason. When every item is decided, the lot moves on by itself.
          </p>
        )}
        {data.blockedBy.length ? (
          <div role="note" className="rounded-[6px] border border-line bg-surface-sunken px-3 py-2 text-[12.5px] text-ink-2">
            {data.blockedBy.join(' ')}
          </div>
        ) : null}

        {/* The spreadsheet part. Same element in both modes (class swap, no portal) so grids never remount. */}
        <div
          className={
            fullscreen
              ? 'fixed inset-0 z-[90] bg-surface text-ink flex flex-col gap-3 p-3 md:p-4'
              : 'flex flex-col gap-3'
          }
        >
          {fullscreen ? (
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold text-ink">Items ({s.total})</h2>
              <GhostButton onClick={() => setFullscreen(false)} className="ml-auto">
                Exit full screen
              </GhostButton>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show items" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`min-h-[32px] px-2.5 rounded-[6px] border text-[12px] font-semibold cursor-pointer ${
                    filter === f.id ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {!single ? (
              <div role="group" aria-label="Sections" className="flex gap-1.5">
                <GhostButton onClick={() => setAll(true)}>Expand all</GhostButton>
                <GhostButton onClick={() => setAll(false)}>Collapse all</GhostButton>
              </div>
            ) : null}
            <div role="group" aria-label="Column groups" className="flex flex-wrap gap-3 sm:ml-auto text-[12px] text-ink-2">
              {(['details', 'decision', 'digitization'] as ColumnGroup[]).map((g) => (
                <label key={g} className="flex items-center gap-1.5 min-h-[32px] cursor-pointer capitalize">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={!hidden[g]}
                    onChange={(e) => setHidden((prev) => ({ ...prev, [g]: !e.target.checked }))}
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>

          {selected.length > 0 && canDetails ? (
            <BulkBar
              count={selected.length}
              canDecide={canDecide}
              physical={physicalItems}
              conditions={conditionItems}
              reasons={reasonItems}
              pending={save.isPending}
              onApply={(set) =>
                save.mutate(
                  { itemIds: selected, set },
                  {
                    onSuccess: (res) => {
                      toast.success(`Updated ${res.updated} ${res.updated === 1 ? 'item' : 'items'}`);
                      deselectAll();
                    },
                  },
                )
              }
              onClear={deselectAll}
            />
          ) : null}

          <div className={fullscreen ? 'flex-1 min-h-0 overflow-y-auto flex flex-col gap-3' : 'flex flex-col gap-3'}>
            {families.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No items yet.</p> : null}
            {families.map((f, i) => {
              const open = isOpen(f.name, i);
              const gridBox = (
                <ItemFamilyGrid
                  family={f.name}
                  rows={f.rows}
                  hidden={hidden}
                  canDetails={canDetails}
                  canDecide={canDecide}
                  narrow={narrow}
                  physical={physicalItems}
                  conditions={conditionItems}
                  reasons={reasonItems}
                  height={gridHeight(f.rows.length)}
                  onEdit={setEditing}
                  onSave={onSave}
                  onSelectionChange={onSelectionChange}
                  onApi={onApi}
                />
              );
              if (single) {
                return (
                  <div key={f.name} className={fullscreen ? 'flex-1 min-h-0' : undefined}>
                    {gridBox}
                  </div>
                );
              }
              const decided = f.all.filter((r) => r.result).length;
              const scanned = f.all.filter((r) => r.captureStatus === 'captured').length;
              const tagged = f.all.filter((r) => r.taggedInMls).length;
              const empty = f.rows.length === 0;
              return (
                <section key={f.name} aria-label={`${f.name} items`} className="rounded-[8px] border border-line overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open && !empty}
                    disabled={empty}
                    onClick={() => toggle(f.name)}
                    className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-surface-sunken border-0 text-left ${
                      empty ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span aria-hidden className="text-ink-3 text-[12px] w-3">
                      {open && !empty ? '▾' : '▸'}
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{f.name}</span>
                    <span className="text-[12px] text-ink-2 tabular-nums">
                      {empty ? `0 match (of ${f.all.length})` : `${f.rows.length}${f.rows.length === f.all.length ? '' : ` of ${f.all.length}`} ${f.all.length === 1 ? 'item' : 'items'}`}
                    </span>
                    <span className="text-[12px] text-ink-3 tabular-nums sm:ml-auto">
                      {decided}/{f.all.length} decided · {scanned} scanned · {tagged} tagged
                    </span>
                  </button>
                  {open && !empty ? <div className="border-t border-line">{gridBox}</div> : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {showAdd ? (
        <AddItemDialog
          lotId={lotId}
          onClose={() => {
            setShowAdd(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.lots.itemsGrid(lotId) });
          }}
        />
      ) : null}
      {editing ? (
        <ItemEditDialog
          item={editing}
          canDetails={canDetails}
          canDecide={canDecide}
          physical={physicalItems}
          conditions={conditionItems}
          reasons={reasonItems}
          pending={save.isPending}
          onSave={(set) => save.mutate({ itemIds: [editing.id], set }, { onSuccess: () => setEditing(null) })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Panel>
  );
}

type Opt = { value: string; label: string };

/** Set the same values on every ticked row. Blank = leave as is. */
function BulkBar({
  count,
  canDecide,
  physical,
  conditions,
  reasons,
  pending,
  onApply,
  onClear,
}: {
  count: number;
  canDecide: boolean;
  physical: Opt[];
  conditions: Opt[];
  reasons: Opt[];
  pending: boolean;
  onApply: (set: ItemsBulkSet) => void;
  onClear: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const triSel = (k: string, label: string) => (
    <Field label={label}>
      <Select value={v[k] ?? ''} onChange={set(k)} aria-label={`${label} for selected items`}>
        <option value="">No change</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
        <option value="__clear">Clear</option>
      </Select>
    </Field>
  );
  const refSel = (k: string, label: string, opts: Opt[]) => (
    <Field label={label}>
      <Select value={v[k] ?? ''} onChange={set(k)} aria-label={`${label} for selected items`}>
        <option value="">No change</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  const apply = () => {
    const out: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(v)) {
      if (raw === '') continue;
      if (['existsInMls', 'newCopyIsBetter', 'conditionUsable', 'significant'].includes(k)) {
        out[k] = raw === '__clear' ? null : raw === 'Yes';
      } else if (k === 'year') {
        out[k] = Number(raw);
      } else {
        out[k] = raw;
      }
    }
    if (Object.keys(out).length === 0) return;
    onApply(out as ItemsBulkSet);
  };

  return (
    <section
      aria-label="Bulk edit selected items"
      className="rounded-[8px] border border-accent bg-accent-soft p-3 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">
          Set for {count} selected {count === 1 ? 'item' : 'items'}
        </span>
        <span className="text-[12px] text-ink-3">Blank fields are left as they are.</span>
        <GhostButton onClick={onClear} className="sm:ml-auto">
          Clear selection
        </GhostButton>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {canDecide ? (
          <>
            {triSel('existsInMls', 'In MLS?')}
            {triSel('newCopyIsBetter', 'New copy better?')}
            {triSel('conditionUsable', 'Usable?')}
            {triSel('significant', 'Significant?')}
            <Field label="Return / discard">
              <Select value={v.disposition ?? ''} onChange={set('disposition')} aria-label="Return or discard for selected items">
                <option value="">No change</option>
                <option value="return">Return</option>
                <option value="discard">Discard</option>
              </Select>
            </Field>
            {refSel('reason', 'Reason', reasons)}
          </>
        ) : null}
        {refSel('physicalSource', 'Physical source', physical)}
        {refSel('itemCondition', 'Condition', conditions)}
        <Field label="Place">
          <TextInput value={v.place ?? ''} onChange={set('place')} placeholder="No change" />
        </Field>
        <Field label="Event">
          <TextInput value={v.event ?? ''} onChange={set('event')} placeholder="No change" />
        </Field>
        <Field label="Year">
          <TextInput value={v.year ?? ''} onChange={set('year')} placeholder="No change" inputMode="numeric" />
        </Field>
        <Field label="Month">
          <TextInput value={v.month ?? ''} onChange={set('month')} placeholder="No change" />
        </Field>
      </div>
      <div>
        <PrimaryButton disabled={pending} onClick={apply}>
          {pending ? 'Saving…' : `Apply to ${count}`}
        </PrimaryButton>
      </div>
    </section>
  );
}
