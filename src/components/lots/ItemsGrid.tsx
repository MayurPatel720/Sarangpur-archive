'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GridApi } from 'ag-grid-community';
import { ApiRequestError, historyApi, itemsGridApi } from '@/lib/api-client';
import { colorOfActor, type HistView, type ShowChanges } from '@/lib/history-view';
import { dateTime12 } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceLists } from '@/hooks/useReferenceLists';
import { refLabel as refLabelOf } from '@/lib/ref-lists';
import { cellText } from '@/lib/item-cells';
import { ITEM_STATUSES, ITEM_STATUS_LABELS, itemStatus, type ItemStatus } from '@/lib/item-status';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { GhostButton } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconChevronDown, IconImportExport, IconPlus } from '@/components/ui/icons';
import { Menu, menuItem } from '@/components/master/MasterMenus';
import { useToast } from '@/components/ui/Toast';
import { allColumns, ALWAYS_VISIBLE, BUILTIN_COLUMNS, deptLabel, forFormat, shownOnSheet, PRASADI_FORMAT, DEPARTMENTS, type CustomColumn, type DeptId } from '@/lib/item-columns';
import type { ColumnsBody, GridItem, ItemsBulkSet, ItemsGridResponse } from '@/types/items';
import { AddItemDialog } from './AddItemDialog';
import { AddColumnDialog } from './AddColumnDialog';
import { DuplicateDialog } from './DuplicateDialog';
import { exportItemsToExcel, type ExportChangeLine, type ExportMarks } from './excel-io';
import { pathLabel } from '@/lib/item-history';
import { BulkEditBar } from './BulkEditBar';
import { ItemPhotosDialog } from './ItemPhotosDialog';
import { ItemStatusDialog } from './ItemStatusDialog';
import { ItemPhotoViewer } from './ItemPhotoViewer';
import { ImportDialog } from './ImportDialog';
import { SetPathDialog } from './SetPathDialog';
import { ItemCodeDialog } from './ItemCodeDialog';
import { LetterCodesDialog } from './LetterCodesDialog';
import { isPendingCode } from '@/lib/domain';
import { useSearchParams } from 'next/navigation';
import { ItemFamilyGrid, PHOTO_ROW_PX, type HistoryMarks } from './ItemFamilyGrid';
import { HistoryControls } from './HistoryControls';
import { useLotHistory } from '@/hooks/useLotHistory';
import { useServerLayout } from '@/hooks/useServerLayout';
import { ColumnsPicker, LayoutSection, MenuAction, MenuCheck, MenuDivider, MenuHeading, MenuRadio, MenuSub, SheetMenu, useSheetMenu } from '@/components/ui/SheetMenu';
import type { ColumnMenuInfo, SectionMenuInfo } from './GridHeader';
import { useMe } from '@/hooks/useCan';

/**
 * The lot's Items tab — the lot's Excel: one collapsible sheet per media type, columns in
 * four departments (Details · Decision · Digitalization & Storage · Logging; see
 * src/lib/item-columns.ts). Column headers hide a column on click, "⋯" brings hidden ones
 * back and "+" adds a column of the team's own — both shared by everyone on THIS lot.
 * Rows can be dragged to reorder. Excel export / import sit top right. Deciding the last item
 * decides the lot, and the lot's stage then follows capture / MLS / logging by itself.
 */

type Filter = 'all' | 'undecided' | 'archive' | 'discard' | 'returned';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'undecided', label: 'Undecided' },
  { id: 'archive', label: 'Digitize' },
  { id: 'discard', label: 'Discard' },
  { id: 'returned', label: 'Returned' },
];

const ROW_PX = 42;
/** Row heights of the Display menu. */
const DENSITY_PX = { compact: 32, normal: ROW_PX, roomy: 56 } as const;
type Density = keyof typeof DENSITY_PX;
interface SheetLayout {
  order: string[];
  pinned: string[];
  density: Density;
}
const DEFAULT_LAYOUT: SheetLayout = { order: [], pinned: [], density: 'normal' };
const matchesFilter = (r: GridItem, f: Filter) =>
  f === 'all' ? true : f === 'undecided' ? !r.result : f === 'returned' ? r.disposition === 'return' : r.result === f;

const SELECTION_CLEAR: Record<number, string[]> = {};

/** The groups of one sheet with how many items each holds (for the Add items dialog). */
const groupCounts = (items: GridItem[]) => {
  const counts = new Map<number, number>();
  for (const i of items) counts.set(i.groupNo, (counts.get(i.groupNo) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([groupNo, count]) => ({ groupNo, count }));
};

export function ItemsGrid({ lotId, lotReference }: { lotId: string; lotReference: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const gridApis = useRef<Map<number, GridApi<GridItem>>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  /** Explicit open/closed per sheet; null until the user touches it (then: first sheet open). */
  const [expanded, setExpanded] = useState<Record<number, boolean> | null>(null);
  const [selectedBy, setSelectedBy] = useState<Record<number, string[]>>(SELECTION_CLEAR);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  /** The "N selected" dialog (bulk edit of the ticked rows). */
  const [showBulk, setShowBulk] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [columnError, setColumnError] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<GridItem | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<{ item: GridItem; code: string } | null>(null);
  const [deleteColumn, setDeleteColumn] = useState<CustomColumn | null>(null);
  /** The row whose Discard was set to "Yes and clear code", waiting for the OK. */
  const [clearCodeFor, setClearCodeFor] = useState<GridItem | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** The item whose photos are open (Prasadi). */
  const [photosFor, setPhotosFor] = useState<GridItem | null>(null);
  /** The item whose photos are open full screen. */
  const [viewing, setViewing] = useState<GridItem | null>(null);
  /** The item whose status dialog is open (Prasadi). */
  const [statusFor, setStatusFor] = useState<GridItem | null>(null);
  /** Prasadi lots: which status to show. */
  const [statusFilter, setStatusFilter] = useState<'all' | ItemStatus>('all');
  /** View only: which departments' columns are showing (not saved). */
  const [shownDepts, setShownDepts] = useState<DeptId[]>(() => DEPARTMENTS.map((d) => d.id));
  const onlyDept: DeptId | null = shownDepts.length === 1 ? shownDepts[0]! : null;
  const setOnlyDept = useCallback((d: DeptId | null) => setShownDepts(d ? [d] : DEPARTMENTS.map((x) => x.id)), []);
  const me = useMe();
  const canAdd = Boolean(me.data?.grants.includes('item:create'));

  const gridKey = queryKeys.lots.itemsGrid(lotId);
  const grid = useQuery({ queryKey: gridKey, queryFn: () => itemsGridApi.get(lotId) });
  const { lists: refLists } = useReferenceLists();
  const refLabel = useCallback((list: string, v: string | null) => refLabelOf(refLists, list, v), [refLists]);

  const [showPath, setShowPath] = useState(false);
  // Version history: Undo / Redo / History, and the "Undo" link on bigger saves.
  const history = useLotHistory(lotId);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: gridKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lots.history(lotId) });
  };
  const undoLink = { label: 'Undo', onClick: () => void history.undo() };
  // The History view: the sheet as it was (a session / a saved version), or "Show changes" on the current sheet.
  const [histView, setHistView] = useState<HistView | null>(null);
  const [showChanges, setShowChanges] = useState<ShowChanges | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const viewQ = useQuery({
    queryKey: ['lots', 'history-view', lotId, histView],
    queryFn: () => historyApi.view(lotId, histView!.mode === 'session' ? { mode: 'session', sessionId: histView!.sessionId } : { mode: 'version', versionId: histView!.versionId }),
    enabled: histView !== null,
    placeholderData: (prev) => prev,
  });
  const sinceQ = useQuery({
    queryKey: ['lots', 'history-since', lotId, showChanges, history.data?.headSeq ?? 0],
    queryFn: () => historyApi.view(lotId, { mode: 'since', ref: showChanges! }),
    enabled: showChanges !== null && histView === null,
  });

  const save = useMutation({
    mutationFn: (v: { itemIds: string[]; set: ItemsBulkSet }) => itemsGridApi.update(lotId, v),
    onSuccess: (res) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      if (res.finalized) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
        toast.success('Lot decided from its items', `Moved to ${res.finalized.stage}.`);
      } else if (res.blockedBy.length) {
        toast.info('Every item is decided', res.blockedBy.join(' '));
      } else if (res.updated > 1) {
        toast.success(`${res.updated} rows updated`, undefined, undoLink);
      }
    },
    onError: (e) => {
      toast.error('Could not save', e instanceof ApiRequestError ? e.message : undefined);
      refresh();
    },
  });

  const letters = useMutation({
    mutationFn: (v: { itemIds: string[]; kind: string }) => itemsGridApi.setLetters(lotId, v),
    onSuccess: refresh,
    onError: (e) => toast.error('Could not change the code letter', e instanceof ApiRequestError ? e.message : undefined),
  });

  const reorder = useMutation({
    mutationFn: (v: { lineIndex: number; orderedIds: string[] }) => itemsGridApi.reorder(lotId, v),
    onSuccess: refresh,
    onError: (e) => {
      toast.error('Could not move the row', e instanceof ApiRequestError ? e.message : undefined);
      refresh();
    },
  });

  /** Hide / unhide / add / remove a column. Hiding is applied at once and rolled back on failure. */
  const columns = useMutation({
    mutationFn: (b: ColumnsBody) => itemsGridApi.columns(lotId, b),
    onMutate: async (b) => {
      if (!b.hidden) return undefined;
      await queryClient.cancelQueries({ queryKey: gridKey });
      const prev = queryClient.getQueryData<ItemsGridResponse>(gridKey);
      if (prev) queryClient.setQueryData<ItemsGridResponse>(gridKey, { ...prev, hiddenColumns: b.hidden });
      return { prev };
    },
    onSuccess: (_r, b) => {
      refresh();
      if (b.add) {
        setShowAddColumn(false);
        toast.success('Column added', b.add.label);
      }
      if (b.removeKey) {
        setDeleteColumn(null);
        toast.success('Column deleted');
      }
    },
    onError: (e, b, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(gridKey, ctx.prev);
      const message = e instanceof ApiRequestError ? e.message : 'Could not change the columns.';
      if (b.add) setColumnError(message);
      else toast.error('Could not change the columns', message);
    },
  });

  // While a past state is shown, the sheet is that (read only); otherwise the current one.
  const data = histView ? (viewQ.data?.grid ?? grid.data) : grid.data;
  const viewLoading = histView !== null && !viewQ.data;
  const activeView = histView ? viewQ.data : showChanges !== null ? sinceQ.data : undefined;
  const marks = useMemo<HistoryMarks | undefined>(() => {
    if (!activeView) return undefined;
    const cells = new Map<string, Map<string, { from: string; to: string; by: string; at: string; color: string }>>();
    const rows = new Map<string, 'added' | 'removed'>();
    for (const c of activeView.changes) {
      if (c.added) rows.set(c.itemId, 'added');
      else if (c.removed) rows.set(c.itemId, 'removed');
      for (const x of c.cells) {
        if (!x.column) continue;
        const m = cells.get(c.itemId) ?? new Map();
        m.set(x.column, { from: x.from, to: x.to, by: x.by, at: dateTime12(x.at), color: colorOfActor(activeView.actors, x.byId) });
        cells.set(c.itemId, m);
      }
    }
    return { cells, rows };
  }, [activeView]);
  const canDetails = data?.editable.details ?? false;
  const canDecide = data?.editable.decision ?? false;

  const specs = useMemo(() => allColumns(data?.customColumns ?? []), [data?.customColumns]);
  const hiddenIds = useMemo(() => new Set(data?.hiddenColumns ?? []), [data?.hiddenColumns]);
  const visibleSpecs = useMemo(
    () => specs.filter((s) => !hiddenIds.has(s.id) && (s.dept === 'lot' || s.dept === 'custom' || shownDepts.includes(s.dept) || s.kind === 'code')),
    [specs, hiddenIds, shownDepts],
  );
  /** Media formats present in this lot — a column that fits none of them is not offered at all. */
  const lotFormats = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.format))], [data?.items]);
  /** Prasadi is kept physically and never digitized: a lot of only Prasadi has nothing to decide. */
  const prasadiOnly = lotFormats.length > 0 && lotFormats.every((f) => f === PRASADI_FORMAT);
  /** A lot of only letters: nothing to decide, no Digitize / Discard counts; each letter just needs its code. */
  const lettersOnly = lotFormats.length > 0 && lotFormats.every((f) => f === 'documents');
  const lettersWithoutCode = data ? data.items.filter((i) => i.format === 'documents' && isPendingCode(i.code)).length : 0;
  /** Departments that have a column on at least one of this lot's sheets (Removal exists only for Prasadi). */
  const lotDepts = useMemo(
    () => DEPARTMENTS.filter((d) => specs.some((s) => s.dept === d.id && (lotFormats.length === 0 || lotFormats.some((f) => shownOnSheet(s, f))))),
    [specs, lotFormats],
  );
  const hiddenSpecs = useMemo(
    () => specs.filter((s) => hiddenIds.has(s.id) && (lotFormats.length === 0 || lotFormats.some((f) => shownOnSheet(s, f)))),
    [specs, hiddenIds, lotFormats],
  );
  /** Visible columns per media format: a Prasadi sheet gets Prasadi columns, a video sheet its tape / case columns. */
  /** This person's layout of the sheets (column order, pinned columns, row height), kept in this browser. */
  const [layout, setLayoutState] = useState<SheetLayout>(DEFAULT_LAYOUT);
  const setLayout = useCallback((patch: Partial<SheetLayout>) => setLayoutState((prev) => ({ ...prev, ...patch })), []);
  /** Drafts stay on screen until "Save layout"; the saved layout (kept on the person's account) opens with the sheet. */
  const savedLayout = useServerLayout('items', layout, setLayoutState);
  /** The sheet's one menu: this column / section first, then columns, display and layout. */
  type MenuTarget = { kind: 'column'; info: ColumnMenuInfo } | { kind: 'section'; info: SectionMenuInfo };
  const sheetMenu = useSheetMenu<MenuTarget>();
  const onOpenMenu = useCallback((pos: { x: number; y: number }, info: ColumnMenuInfo) => sheetMenu.openAt(pos, { kind: 'column', info }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onOpenSectionMenu = useCallback((pos: { x: number; y: number }, info: SectionMenuInfo) => sheetMenu.openAt(pos, { kind: 'section', info }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onPin = useCallback((id: string) => setLayout({ pinned: layout.pinned.includes(id) ? layout.pinned.filter((x) => x !== id) : [...layout.pinned, id] }), [layout.pinned, setLayout]);
  const onOrder = useCallback((order: string[]) => setLayout({ order }), [setLayout]);
  const rowPx = DENSITY_PX[layout.density];
  const columnsByFormat = useMemo(
    () =>
      new Map(
        lotFormats.map((f) => {
          const cols = forFormat(visibleSpecs, f);
          const rank = new Map(layout.order.map((id, i) => [id, i]));
          // Listed columns keep the saved order (each stays in its own department band); the rest keep the registry order.
          const ordered = cols.some((c) => rank.has(c.id)) ? [...cols].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999)) : cols;
          return [f, ordered] as const;
        }),
      ),
    [lotFormats, visibleSpecs, layout.order],
  );

  /** One sheet per media line, in intake order, with every item (for progress) and the filtered rows. */
  const sheets = useMemo(() => {
    const map = new Map<number, { name: string; format: string; all: GridItem[]; rows: GridItem[] }>();
    for (const it of data?.items ?? []) {
      let g = map.get(it.lineIndex);
      if (!g) map.set(it.lineIndex, (g = { name: it.subtypeLabel.trim() || 'Other', format: it.format, all: [], rows: [] }));
      g.all.push(it);
      const st = itemStatus(it);
      if (matchesFilter(it, filter) && (statusFilter === 'all' || st === null || st === statusFilter)) g.rows.push(it);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([lineIndex, g]) => ({ lineIndex, ...g }));
  }, [data, filter, statusFilter]);

  const isOpen = (line: number, index: number) => (expanded ? (expanded[line] ?? false) : index === 0);
  const setAll = (open: boolean) => setExpanded(Object.fromEntries(sheets.map((s) => [s.lineIndex, open])));
  const toggle = (line: number) =>
    setExpanded(Object.fromEntries(sheets.map((s, i) => [s.lineIndex, s.lineIndex === line ? !isOpen(s.lineIndex, i) : isOpen(s.lineIndex, i)])));

  const selected = useMemo(() => Object.values(selectedBy).flat(), [selectedBy]);
  /** The ticked rows — the bulk bar offers the fields that fit their media formats. */
  const selectedItems = useMemo(() => {
    const ids = new Set(selected);
    return (data?.items ?? []).filter((i) => ids.has(i.id));
  }, [selected, data?.items]);
  const onSelectionChange = useCallback(
    (sheet: number, ids: string[]) =>
      setSelectedBy((prev) => {
        const cur = prev[sheet] ?? [];
        if (cur.length === ids.length && cur.every((v, i) => v === ids[i])) return prev;
        if (ids.length === 0 && !(sheet in prev)) return prev;
        return { ...prev, [sheet]: ids };
      }),
    [],
  );
  const onApi = useCallback((sheet: number, api: GridApi<GridItem> | null) => {
    if (api) gridApis.current.set(sheet, api);
    else gridApis.current.delete(sheet);
  }, []);
  const deselectAll = () => gridApis.current.forEach((api) => api.deselectAll());
  const onSave = useCallback((itemIds: string[], set: ItemsBulkSet) => save.mutate({ itemIds, set }), [save]);
  /** Rows that have a File path column (Prasadi's sheet has none). */
  const pathSpec = BUILTIN_COLUMNS.find((c) => c.id === 'fileName')!;
  const pathItems = useMemo(() => (data?.items ?? []).filter((i) => shownOnSheet(pathSpec, i.format)), [data?.items, pathSpec]);
  const onReorder = useCallback((lineIndex: number, orderedIds: string[]) => reorder.mutate({ lineIndex, orderedIds }), [reorder]);

  const hideColumn = useCallback(
    (id: string) => columns.mutate({ hidden: [...(data?.hiddenColumns ?? []), id] }),
    [columns, data?.hiddenColumns],
  );
  const hideDept = useCallback(
    (dept: DeptId) => {
      const ids = specs.filter((c) => c.dept === dept && c.kind !== 'code').map((c) => c.id);
      columns.mutate({ hidden: [...new Set([...(data?.hiddenColumns ?? []), ...ids])] });
      setOnlyDept(null);
    },
    [columns, specs, data?.hiddenColumns],
  );
  const showColumn = (id: string) => columns.mutate({ hidden: (data?.hiddenColumns ?? []).filter((h) => h !== id) });
  /** The Columns button's dropdown: whole sections (departments), then every column grouped by department. */
  const columnsPanel = (close: () => void) => {
    const pickerColumns = specs
      .filter((c) => c.kind !== 'code' && (lotFormats.length === 0 || lotFormats.some((f) => shownOnSheet(c, f))))
      .map((c) => ({ id: c.id, label: c.label, group: deptLabel(c.dept), checked: !hiddenIds.has(c.id) }));
    return (
      <>
        {canDetails ? (
          <div className="px-3 pb-1 text-[12px]">
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-accent" onClick={() => { close(); setColumnError(null); setShowAddColumn(true); }}>
              + Add a column
            </button>
          </div>
        ) : null}
        {lotDepts.length > 1 ? (
          <>
            <div className="px-3 pt-1 text-[11px] font-semibold text-ink-3">Whole sections</div>
            {lotDepts.map((d) => (
              <MenuCheck
                key={d.id}
                checked={shownDepts.includes(d.id)}
                onChange={(on) => setShownDepts((prev) => (on ? DEPARTMENTS.map((x) => x.id).filter((x) => x === d.id || prev.includes(x)) : prev.filter((x) => x !== d.id)))}
              >
                {d.label}
              </MenuCheck>
            ))}
          </>
        ) : null}
        <ColumnsPicker
          columns={pickerColumns}
          onToggle={(id, on) => (on ? showColumn(id) : hideColumn(id))}
          onShowAll={() => columns.mutate({ hidden: [] })}
          onHideAll={() => columns.mutate({ hidden: specs.filter((c) => c.kind !== 'code' && !ALWAYS_VISIBLE.has(c.id)).map((c) => c.id) })}
        />
      </>
    );
  };

  const onInvalid = useCallback((message: string) => toast.error('Not saved', message), [toast]);
  // Letters take their code from a scanned file: their code cell opens that window instead of the code dialog.
  const [showLetterCodes, setShowLetterCodes] = useState(false);
  const onOpenCode = useCallback((item: GridItem) => (item.format === 'documents' ? setShowLetterCodes(true) : setCodeFor(item)), []);
  // Right after an intake of letters the lot opens with ?codes=1: show the window once.
  const askedCodes = useSearchParams().get('codes') === '1';
  const openedCodes = useRef(false);
  useEffect(() => {
    if (!askedCodes || openedCodes.current || !data) return;
    openedCodes.current = true;
    if (data.items.some((i) => i.format === 'documents' && isPendingCode(i.code))) setShowLetterCodes(true);
  }, [askedCodes, data]);
  const onDuplicate = useCallback((item: GridItem, code: string) => setDuplicateFor({ item, code }), []);

  /** Copies the rows (the ticked ones, else every row on the sheets) as tab-separated text, ready to paste into Excel. */
  const copyRows = async () => {
    const ids = new Set(selected);
    const picked = (data?.items ?? []).filter((i) => ids.size === 0 || ids.has(i.id));
    if (picked.length === 0) return;
    const cols = (columnsByFormat.get(picked[0]!.format) ?? visibleSpecs).filter((c) => c.kind !== 'photo');
    const label = (list: string, v: string | null) => refLabelOf(refLists, list, v);
    const TAB = String.fromCharCode(9);
    const NL = String.fromCharCode(10);
    const clean = (t: string) => t.split(NL).join(' ').split(TAB).join(' ').split(String.fromCharCode(13)).join(' ');
    const text = [cols.map((c) => clean(c.label)).join(TAB), ...picked.map((r) => cols.map((c) => clean(cellText(r, c, label))).join(TAB))].join(NL);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied', `${picked.length} ${picked.length === 1 ? 'row' : 'rows'}: paste into Excel or Sheets.`);
    } catch {
      toast.error('Could not copy', 'Your browser did not allow clipboard access.');
    }
  };

  const exportExcel = async (history?: { fileSuffix: string }) => {
    if (!data) return;
    try {
      // A History export: the sheet as shown (session / version / current), changed cells marked, plus a Changes sheet.
      let extra: { marks?: ExportMarks; changeLines?: ExportChangeLine[] } = {};
      if (history && activeView) {
        const label = (id: string | null, path: string) => specs.find((c) => c.id === id)?.label ?? pathLabel(path);
        const m: ExportMarks = { cells: new Map(), rows: new Map() };
        const lines: ExportChangeLine[] = [];
        for (const c of activeView.changes) {
          const code = c.code ?? '';
          if (c.added || c.removed) {
            m.rows.set(c.itemId, c.added ? 'added' : 'removed');
            lines.push({ item: code, column: '', from: '', to: '', by: c.cells[0]?.by ?? '', at: c.cells[0] ? dateTime12(c.cells[0].at) : '', kind: c.added ? 'added' : 'removed' });
          }
          for (const x of c.cells) {
            if (x.column) {
              const cm = m.cells.get(c.itemId) ?? new Map();
              cm.set(x.column, { from: x.from, to: x.to, by: x.by, at: dateTime12(x.at) });
              m.cells.set(c.itemId, cm);
            }
            if (!c.added && !c.removed) lines.push({ item: code, column: label(x.column, x.path), from: x.from, to: x.to, by: x.by, at: dateTime12(x.at), kind: 'edited' });
          }
        }
        extra = { marks: m, changeLines: lines };
      }
      await exportItemsToExcel({
        fileName: history ? lotReference + '-' + history.fileSuffix : lotReference + '-items',
        sheets: sheets.map((s) => ({ name: s.name, rows: s.all, columns: columnsByFormat.get(s.format) ?? visibleSpecs })),
        columns: visibleSpecs,
        refLabel,
        ...extra,
      });
    } catch {
      toast.error('Could not export', 'Try again, or reload the page.');
    }
  };

  // Full screen: lock page scroll; Escape exits (unless a dialog or a cell editor/popup is using it).
  useEffect(() => {
    if (selected.length === 0) setShowBulk(false);
  }, [selected.length]);
  const dialogOpen = showLetterCodes || showAdd || showImport || showBulk || Boolean(clearCodeFor) || showAddColumn || Boolean(codeFor) || Boolean(duplicateFor) || Boolean(deleteColumn);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || dialogOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('.ag-cell-inline-editing, .ag-popup, .ag-cell-editing-error')) return;
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, dialogOpen]);

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
  const single = sheets.length <= 1;
  const canReorder = canDetails && filter === 'all';

  const gridHeight = (rowCount: number, px: number = rowPx) => {
    if (single) return fullscreen ? '100%' : 'max(420px, calc(100dvh - 320px))';
    const natural = 100 + rowCount * px;
    return fullscreen ? `min(${natural}px, calc(100dvh - 200px))` : `${Math.min(natural, px > 56 ? 780 : 560)}px`;
  };

  /** Look of a GhostButton, for the buttons that open a menu. */
  const ghostMenu =
    'inline-flex h-10 items-center gap-1.5 px-4 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] font-semibold text-ink-2 cursor-pointer disabled:opacity-60';

  /** Full screen as one split button; its arrow lists Full screen, Expand all and Collapse all as three separate choices. */
  const viewControls = (
    <span className="inline-flex">
      <GhostButton onClick={() => setFullscreen(!fullscreen)} className="!rounded-r-none">
        {fullscreen ? 'Exit full screen' : 'Full screen'}
      </GhostButton>
      <Menu
        label="View options"
        width={200}
        align="right"
        className={`${ghostMenu} !rounded-l-none border-l-0 !px-2.5`}
        trigger={<IconChevronDown size={14} />}
      >
        {(close) => (
          <>
            <button type="button" role="menuitem" className={menuItem} onClick={() => { setFullscreen(!fullscreen); close(); }}>
              {fullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
            <button type="button" role="menuitem" className={menuItem} disabled={single} onClick={() => { setAll(true); close(); }}>
              Expand all
            </button>
            <button type="button" role="menuitem" className={menuItem} disabled={single} onClick={() => { setAll(false); close(); }}>
              Collapse all
            </button>
          </>
        )}
      </Menu>
    </span>
  );

  const iconBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-2 cursor-pointer hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';
  /** A tool button with a text label: same height as the icon buttons. */
  const toolBtn =
    'inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2.5 text-[12px] font-semibold text-ink-2 cursor-pointer hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

  return (
    <div className="transition-[padding] duration-150" style={{ paddingRight: panelOpen && !fullscreen ? 392 : 0 }}>
    <Panel>
      <PanelHeader title={`Items (${s.total})`}>
        <span className="ml-auto flex items-center gap-2">
          {viewControls}
          {canAdd && canDetails ? <GhostButton onClick={() => setShowAdd(true)}>Add items</GhostButton> : null}
        </span>
      </PanelHeader>
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
          {prasadiOnly ? (
            <>
              <span>
                <span className="font-semibold text-ink tabular-nums">{s.total}</span> {s.total === 1 ? 'item' : 'items'}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge severity="good">Sticker on {data.items.filter((i) => i.attrs.stickerApplied === true).length}</Badge>
                <Badge severity="info">Check planned {data.items.filter((i) => i.recheckWeeks).length}</Badge>
              </span>
            </>
          ) : lettersOnly ? (
            <>
              <span>
                <span className="font-semibold text-ink tabular-nums">{s.total}</span> {s.total === 1 ? 'letter' : 'letters'}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge severity={lettersWithoutCode > 0 ? 'warning' : 'good'}>{lettersWithoutCode > 0 ? `${lettersWithoutCode} without a code` : 'All have a code'}</Badge>
              </span>
            </>
          ) : (
            <>
              <span>
                <span className="font-semibold text-ink tabular-nums">{s.decided}</span> of {s.total} decided
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge severity="good">Digitize {s.archive}</Badge>
                <Badge severity="critical">Discard {s.discard}</Badge>
              </span>
            </>
          )}
        </div>

        {histView ? null : !canDetails ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Read only — only the lot&apos;s assignee and admins can fill in items.
          </p>
        ) : !canDecide ? (
          <p role="note" className="m-0 text-[12px] text-ink-3">
            Decisions are locked — this lot has been decided. The other columns stay editable.
          </p>
        ) : null}
        {data.blockedBy.length ? (
          <div role="note" className="rounded-[6px] border border-line bg-surface-sunken px-3 py-2 text-[12.5px] text-ink-2">
            {data.blockedBy.join(' ')}
          </div>
        ) : null}

        {viewLoading ? (
          <div role="status" className="rounded-[8px] border border-accent bg-accent-soft px-3 py-2 text-[12.5px] font-semibold text-ink">
            Loading the sheet as it was…
          </div>
        ) : null}
        {activeView ? (
          <div role="status" className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[8px] border px-3 py-2 text-[12.5px] ${histView ? 'border-accent bg-accent-soft' : 'border-line bg-surface-sunken'}`}>
            <span className="font-semibold text-ink">
              {histView ? (histView.mode === 'session' ? 'Viewing the sheet right after this session' : 'Viewing the saved version') : 'Showing changes'}
              {': '}
              {activeView.title}
              {activeView.at ? ` · ${dateTime12(activeView.at)}` : ''}
            </span>
            <span className="text-ink-3">
              {activeView.rowCount} {activeView.rowCount === 1 ? 'row' : 'rows'} · {activeView.cellCount} {activeView.cellCount === 1 ? 'cell' : 'cells'} highlighted
              {histView?.mode === 'version' ? ' (changed since this version)' : ''}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              {activeView.actors.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 text-ink-2">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: colorOfActor(activeView.actors, a.id) }} />
                  {a.name}
                </span>
              ))}
              {activeView.changes.some((c) => c.added) ? (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px] bg-good-mark" /> added row
                </span>
              ) : null}
              {activeView.changes.some((c) => c.removed) ? (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px] bg-danger-mark" /> removed row
                </span>
              ) : null}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <GhostButton
                className="!h-8 !px-3 !text-[12px]"
                title="Download this sheet as Excel, with the changed cells marked and a Changes sheet"
                onClick={() => {
                  const stamp = activeView.at ? new Date(activeView.at).toISOString().slice(0, 16).replace('T', '-').replace(':', '') : 'now';
                  const kind = histView ? (histView.mode === 'session' ? 'session' : 'version') : 'changes';
                  void exportExcel({ fileSuffix: kind + '-' + stamp });
                }}
              >
                Export to Excel
              </GhostButton>
              {histView && me.data?.grants.includes('lot:edit') ? (
                <GhostButton className="!h-8 !px-3 !text-[12px]" onClick={() => setRestoring(true)}>
                  Restore this
                </GhostButton>
              ) : null}
              <GhostButton className="!h-8 !px-3 !text-[12px]" onClick={() => (histView ? setHistView(null) : setShowChanges(null))}>
                {histView ? 'Back to current' : 'Hide'}
              </GhostButton>
            </span>
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
              <span className="ml-auto">{viewControls}</span>
            </div>
          ) : null}

          {/* Sticky toolbar: stays at the top of the page while the sheets scroll (-top cancels the page's top padding). */}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${fullscreen ? '' : 'sticky -top-4 md:-top-[22px] z-30 -mx-3 border-b border-line-soft bg-surface px-3 py-2 md:-mx-4 md:px-4'}`}>
            <div className="contents">
            <div role="group" aria-label="Show items" className={prasadiOnly || lettersOnly ? 'hidden' : 'flex flex-wrap gap-1.5'}>
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
            {lotFormats.includes(PRASADI_FORMAT) ? (
              <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
                {(['all', ...ITEM_STATUSES] as const).map((st) => {
                  const n = st === 'all' ? null : data.items.filter((i) => itemStatus(i) === st).length;
                  return (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={statusFilter === st}
                      onClick={() => setStatusFilter(st)}
                      className={`min-h-[32px] px-2.5 rounded-[6px] border text-[12px] font-semibold cursor-pointer ${
                        statusFilter === st ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'
                      }`}
                    >
                      {st === 'all' ? 'Any status' : ITEM_STATUS_LABELS[st]}
                      {n !== null ? ` ${n}` : ''}
                    </button>
                  );
                })}
              </div>
            ) : null}
            </div>
            <Menu
              label="Choose columns"
              width={310}
              className={toolBtn}
              trigger={
                <>
                  Columns
                  {hiddenSpecs.length > 0 ? (
                    <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-white">{hiddenSpecs.length} hidden</span>
                  ) : null}
                  <span aria-hidden>▾</span>
                </>
              }
            >
              {(close) => columnsPanel(close)}
            </Menu>
            <div role="toolbar" aria-label="Excel tools" className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
              {selected.length > 0 && canDetails ? (
                <button
                  type="button"
                  onClick={() => setShowBulk(true)}
                  title="Set the same values on the ticked rows"
                  className="inline-flex h-8 cursor-pointer items-center rounded-[6px] border border-accent bg-accent-soft px-3 text-[12px] font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Bulk edit
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] font-bold leading-[18px] text-white tabular-nums">{selected.length}</span>
                </button>
              ) : null}
              {canDetails && lotFormats.includes('documents') ? (
                <button type="button" className={toolBtn} onClick={() => setShowLetterCodes(true)} title="Choose the scanned files; each file name becomes a letter's code">
                  Set codes from files{lettersWithoutCode > 0 ? ` (${lettersWithoutCode})` : ''}
                </button>
              ) : null}
              {canDetails && pathItems.length > 0 ? (
                <button type="button" className={toolBtn} onClick={() => setShowPath(true)} title="Fill the File path column from one parent folder">Set path</button>
              ) : null}
              <Menu label="Import / Export" width={200} className={toolBtn} trigger={<><IconImportExport size={15} aria-hidden /> Import / Export</>}>
                {(close) => (
                  <>
                    {canDetails ? (
                      <button type="button" role="menuitem" className={menuItem} onClick={() => { setShowImport(true); close(); }}>
                        Import from Excel
                      </button>
                    ) : null}
                    <button type="button" role="menuitem" className={menuItem} disabled={s.total === 0} onClick={() => { void copyRows(); close(); }}>
                      {selected.length > 0 ? `Copy ${selected.length} selected` : 'Copy all rows'}
                    </button>
                    <button type="button" role="menuitem" className={menuItem} disabled={s.total === 0} onClick={() => { void exportExcel(); close(); }}>
                      Export to Excel
                    </button>
                  </>
                )}
              </Menu>
              {canDetails ? (
                <button
                  type="button"
                  className={toolBtn}
                  title="Add a column to this sheet (for everyone on this lot)"
                  onClick={() => {
                    setColumnError(null);
                    setShowAddColumn(true);
                  }}
                >
                  <IconPlus size={14} aria-hidden /> Column
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-1.5">
              <HistoryControls history={history} canEdit={canDetails} lotId={lotId} view={histView} onView={setHistView} showChanges={showChanges} onShowChanges={setShowChanges} onPanelChange={setPanelOpen} />
              </div>
            </div>
          </div>

          {sheetMenu.state ? (() => {
            const close = sheetMenu.close;
            const target = sheetMenu.state.column;
            return (
              <SheetMenu pos={sheetMenu.state.pos} onClose={close} label="Sheet options">
                {target?.kind === 'column' ? (
                  <>
                    <MenuHeading>{target.info.label}</MenuHeading>
                    {target.info.onPin ? <MenuAction onClose={close} onClick={() => target.info.onPin?.()}>{target.info.pinned ? 'Unpin column' : 'Pin column'}</MenuAction> : null}
                    {target.info.hideable ? <MenuAction onClose={close} onClick={target.info.onHide}>Hide column</MenuAction> : null}
                    {target.info.onDelete ? <MenuAction danger onClose={close} onClick={() => target.info.onDelete?.()}>Delete column…</MenuAction> : null}
                    <MenuDivider />
                  </>
                ) : null}
                {target?.kind === 'section' ? (
                  <>
                    <MenuHeading>{target.info.label}</MenuHeading>
                    <MenuAction onClose={close} onClick={target.info.onShowOnly} disabled={target.info.active}>Show only this section</MenuAction>
                    <MenuAction onClose={close} onClick={target.info.onShowAll}>Show every section</MenuAction>
                    <MenuAction onClose={close} onClick={target.info.onHideAll}>Hide this section</MenuAction>
                    <MenuDivider />
                  </>
                ) : null}
                <MenuHeading>Display</MenuHeading>
                {(['compact', 'normal', 'roomy'] as const).map((d) => (
                  <MenuRadio key={d} name="density" checked={layout.density === d} onChange={() => setLayout({ density: d })}>{d === 'compact' ? 'Compact' : d === 'normal' ? 'Normal' : 'Roomy'} rows</MenuRadio>
                ))}
                <MenuDivider />
                <LayoutSection layout={savedLayout} onClose={close}>
                  <MenuAction onClose={close} disabled={layout.order.length === 0 && layout.pinned.length === 0} onClick={() => setLayout({ order: [], pinned: [] })}>
                    Reset column order and pins
                  </MenuAction>
                </LayoutSection>
              </SheetMenu>
            );
          })() : null}

          {showBulk && selected.length > 0 && canDetails ? (
            <BulkEditBar
              onClose={() => setShowBulk(false)}
              items={selectedItems}
              customColumns={data.customColumns}
              lists={refLists}
              canDecide={canDecide}
              pending={save.isPending}
              onApply={(set, codeLetter) => {
                const finish = (msg: string) => {
                  toast.success(msg, undefined, undoLink);
                  deselectAll();
                  setShowBulk(false);
                };
                const saveFields = (note: string) =>
                  Object.keys(set).length === 0
                    ? finish(note)
                    : save.mutate({ itemIds: selected, set }, { onSuccess: (res) => finish(`${note}Updated ${res.updated} ${res.updated === 1 ? 'item' : 'items'}`) });
                if (!codeLetter) return saveFields('');
                letters.mutate(
                  { itemIds: selected, kind: codeLetter },
                  {
                    onSuccess: (r) => {
                      if (r.skipped.length > 0) toast.error(`${r.skipped.length} not changed`, `${r.skipped[0]!.code}: ${r.skipped[0]!.reason}`);
                      saveFields(`Code letter ${codeLetter} on ${r.changed} ${r.changed === 1 ? 'item' : 'items'}. `);
                    },
                  },
                );
              }}
              onClear={deselectAll}
            />
          ) : null}

          <div onContextMenu={(e) => sheetMenu.onContextMenu(e)} className={fullscreen ? 'flex-1 min-h-0 overflow-y-auto flex flex-col gap-3' : 'flex flex-col gap-3'}>
            {sheets.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No items yet.</p> : null}
            {sheets.map((sh, i) => {
              const open = isOpen(sh.lineIndex, i);
              const gridBox = (
                <ItemFamilyGrid
                  lineIndex={sh.lineIndex}
                  rows={sh.rows}
                  columns={columnsByFormat.get(sh.format) ?? visibleSpecs}
                  canDetails={canDetails}
                  canDecide={canDecide}
                  canReorder={canReorder}
                  refLists={refLists}
                  onOpenPhotos={setPhotosFor}
                  onViewPhotos={setViewing}
                  onOpenMenu={onOpenMenu}
                  onOpenSectionMenu={onOpenSectionMenu}
                  pinnedIds={layout.pinned}
                  onOrder={onOrder}
                  onPin={onPin}
                  rowPx={rowPx}
                  onOpenStatus={setStatusFor}
                  height={gridHeight(sh.rows.length, (columnsByFormat.get(sh.format) ?? visibleSpecs).some((c) => c.kind === 'photo') ? PHOTO_ROW_PX : rowPx)}
                  onOpenCode={onOpenCode}
                  onClearCode={setClearCodeFor}
                  marks={marks}
                  onDuplicate={onDuplicate}
                  onHide={hideColumn}
                  onDeleteColumn={setDeleteColumn}
                  onShowOnly={setOnlyDept}
                  onHideDept={hideDept}
                  onlyDept={onlyDept}
                  onInvalid={onInvalid}
                  onSave={onSave}
                  onReorder={onReorder}
                  onSelectionChange={onSelectionChange}
                  onApi={onApi}
                />
              );
              if (single) {
                return (
                  <div key={sh.lineIndex} className={fullscreen ? 'flex-1 min-h-0' : undefined}>
                    {gridBox}
                  </div>
                );
              }
              const decided = sh.all.filter((r) => r.result).length;
              const captured = sh.all.filter((r) => r.captured).length;
              const tagged = sh.all.filter((r) => r.taggedInMls).length;
              const empty = sh.rows.length === 0;
              return (
                <section key={sh.lineIndex} aria-label={`${sh.name} items`} className="rounded-[8px] border border-line overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open && !empty}
                    disabled={empty}
                    onClick={() => toggle(sh.lineIndex)}
                    className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-surface-sunken border-0 text-left ${
                      empty ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span aria-hidden className="text-ink-3 text-[12px] w-3">
                      {open && !empty ? '▾' : '▸'}
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{sh.name}</span>
                    <span className="text-[12px] text-ink-2 tabular-nums">
                      {empty ? `0 match (of ${sh.all.length})` : `${sh.rows.length}${sh.rows.length === sh.all.length ? '' : ` of ${sh.all.length}`} ${sh.all.length === 1 ? 'item' : 'items'}`}
                    </span>
                    <span className="text-[12px] text-ink-3 tabular-nums sm:ml-auto">
                      {sh.format === PRASADI_FORMAT
                        ? `${sh.all.filter((r) => r.attrs.stickerApplied === true).length} stickered · ${sh.all.filter((r) => r.recheckWeeks).length} check planned`
                        : `${decided}/${sh.all.length} decided · ${captured} digitalized · ${tagged} tagged`}
                    </span>
                  </button>
                  {open && !empty ? <div className="border-t border-line">{gridBox}</div> : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {statusFor ? (
        <ItemStatusDialog
          lotId={lotId}
          // read the live row, so the dialog follows a refetch
          item={data.items.find((i) => i.id === statusFor.id) ?? statusFor}
          canManage={canDetails}
          onClose={() => setStatusFor(null)}
          onChanged={refresh}
        />
      ) : null}
      {viewing ? (
        <ItemPhotoViewer
          lotId={lotId}
          item={viewing}
          onClose={() => setViewing(null)}
          onManage={() => {
            setPhotosFor(viewing);
            setViewing(null);
          }}
        />
      ) : null}
      {photosFor ? (
        <ItemPhotosDialog
          lotId={lotId}
          item={photosFor}
          onClose={() => setPhotosFor(null)}
          onChanged={refresh}
        />
      ) : null}
      {showAdd ? (
        <AddItemDialog
          lotId={lotId}
          sheets={sheets.map((sh) => ({ lineIndex: sh.lineIndex, name: sh.name, groups: groupCounts(sh.all) }))}
          onClose={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      ) : null}
      {showLetterCodes && data ? <LetterCodesDialog lotId={lotId} lotReference={lotReference} items={data.items.filter((i) => i.format === 'documents')} onClose={() => setShowLetterCodes(false)} /> : null}
      {showImport ? <ImportDialog lotId={lotId} onClose={() => setShowImport(false)} onDone={refresh} /> : null}
      {showPath ? <SetPathDialog lotId={lotId} items={pathItems} selectedIds={selected} onClose={() => setShowPath(false)} onDone={refresh} /> : null}
      {showAddColumn ? (
        <AddColumnDialog
          pending={columns.isPending}
          error={columnError}
          onAdd={(add) => columns.mutate({ add })}
          onClose={() => setShowAddColumn(false)}
        />
      ) : null}
      {codeFor ? (
        <ItemCodeDialog
          lotId={lotId}
          item={codeFor}
          sheetName={sheets.find((x) => x.lineIndex === codeFor.lineIndex)?.name ?? 'Sheet'}
          sheetItems={sheets.find((x) => x.lineIndex === codeFor.lineIndex)?.all ?? []}
          onClose={() => setCodeFor(null)}
          onDuplicate={(item, code) => setDuplicateFor({ item, code })}
          onDone={refresh}
        />
      ) : null}
      {duplicateFor ? (
        <DuplicateDialog
          lotId={lotId}
          item={duplicateFor.item}
          otherCode={duplicateFor.code}
          onClose={() => setDuplicateFor(null)}
          onDone={() => {
            refresh();
            void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
          }}
        />
      ) : null}
      {restoring && histView && viewQ.data ? (
        <ConfirmDialog
          title="Restore the sheet to this point?"
          body={`The sheet goes back to how it looked ${histView.mode === 'session' ? 'right after this session' : `at "${viewQ.data.title}"`}. It is saved as a new change, so you can undo it afterwards.`}
          confirmLabel="Restore"
          tone="default"
          pending={history.pending}
          onConfirm={async () => {
            const res = await history.run(histView.mode === 'version' ? { action: 'restore', versionId: histView.versionId } : { action: 'restore', seq: viewQ.data!.seq });
            setRestoring(false);
            if (res) setHistView(null);
          }}
          onClose={() => setRestoring(false)}
        />
      ) : null}
      {clearCodeFor ? (
        <ConfirmDialog
          title="Discard and clear this code?"
          body={`${clearCodeFor.code} will be cleared. The row is decided Discard, renamed with DISCARD_ and the next number for its code prefix (for example NEG-MUM-R-DISCARD_1) and moved to the end of its sheet. The old code is retired for good and cannot be brought back.`}
          confirmLabel="Yes and clear code"
          pending={save.isPending}
          onConfirm={() =>
            save.mutate(
              { itemIds: [clearCodeFor.id], set: { discardClearCode: true } },
              {
                onSuccess: () => {
                  toast.success("Code cleared", "The row is now a discard and sits at the end of its sheet.", undoLink);
                  setClearCodeFor(null);
                },
                onError: () => setClearCodeFor(null),
              },
            )
          }
          onClose={() => setClearCodeFor(null)}
        />
      ) : null}
      {deleteColumn ? (
        <ConfirmDialog
          title="Delete this column?"
          body={`“${deleteColumn.label}” and everything typed in it will be removed from this lot's Excel.`}
          confirmLabel="Delete column"
          pending={columns.isPending}
          onConfirm={() => columns.mutate({ removeKey: deleteColumn.key })}
          onClose={() => setDeleteColumn(null)}
        />
      ) : null}
    </Panel>
    </div>
  );
}
