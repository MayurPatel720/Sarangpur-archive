'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnSpec } from '@/lib/item-columns';

/**
 * How the Master Excel looks for one person: which columns are hidden, their order, the pinned
 * ones, widths, row height, wrapping, sort, and the department tick boxes. Kept in this browser
 * (per format) so the sheet opens the way it was left, and nameable as "views".
 */

export type Density = 'compact' | 'normal' | 'roomy';

export interface MasterView {
  hidden: string[];
  /** Full column order override (ids not listed keep their place after the listed ones). */
  order: string[];
  pinned: string[];
  widths: Record<string, number>;
  density: Density;
  wrap: boolean;
  filterRow: boolean;
  depts: string[] | null;
  sort: string;
  dir: 'asc' | 'desc';
}

export const DEFAULT_VIEW: MasterView = {
  hidden: [],
  order: [],
  pinned: [],
  widths: {},
  density: 'normal',
  wrap: false,
  filterRow: true,
  depts: null,
  sort: '',
  dir: 'asc',
};

export interface SavedView {
  name: string;
  view: MasterView;
  filters: Record<string, string>;
}

export const MIN_WIDTH = 70;
export const MAX_WIDTH = 700;
export const ROW_PADDING: Record<Density, string> = { compact: 'py-0.5', normal: 'py-1.5', roomy: 'py-3' };

const currentKey = (scope: string) => `archive-tracker.master-view.${scope}`;
const savedKey = (scope: string) => `archive-tracker.master-views.${scope}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the view is just not remembered */
  }
}

/** The columns as the view shows them: hidden ones out, pinned ones first, the rest in the saved order. */
export function applyView(base: ColumnSpec[], view: MasterView): ColumnSpec[] {
  const byId = new Map(base.map((c) => [c.id, c]));
  const ordered = [...view.order.filter((id) => byId.has(id)), ...base.map((c) => c.id).filter((id) => !view.order.includes(id))];
  const visible = ordered.filter((id) => !view.hidden.includes(id));
  const pinned = visible.filter((id) => view.pinned.includes(id));
  const loose = visible.filter((id) => !view.pinned.includes(id));
  const cols = [...pinned, ...loose].map((id) => byId.get(id)!);
  return cols.length > 0 ? cols : base.slice(0, 1);
}

/** The whole ordering (hidden columns included) after moving one column a step. */
export function moveColumn(base: ColumnSpec[], view: MasterView, id: string, step: -1 | 1): string[] {
  const ids = [...view.order.filter((x) => base.some((c) => c.id === x)), ...base.map((c) => c.id).filter((x) => !view.order.includes(x))];
  const visible = ids.filter((x) => !view.hidden.includes(x));
  const at = visible.indexOf(id);
  const swap = visible[at + step];
  if (at < 0 || !swap) return ids;
  const a = ids.indexOf(id);
  const b = ids.indexOf(swap);
  [ids[a], ids[b]] = [ids[b]!, ids[a]!];
  return ids;
}

export function useMasterView(scope: string) {
  const [view, setViewState] = useState<MasterView>(DEFAULT_VIEW);
  const [saved, setSavedState] = useState<SavedView[]>([]);
  const loaded = useRef<string | null>(null);

  // Load when the scope (the chosen format) changes; save every change after that.
  useEffect(() => {
    setViewState(read(currentKey(scope), DEFAULT_VIEW));
    try {
      const raw = window.localStorage.getItem(savedKey(scope));
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      setSavedState(Array.isArray(list) ? (list as SavedView[]).filter((s) => typeof s?.name === 'string' && s.view) : []);
    } catch {
      setSavedState([]);
    }
    loaded.current = scope;
  }, [scope]);

  const setView = useCallback(
    (patch: Partial<MasterView> | ((v: MasterView) => Partial<MasterView>)) => {
      setViewState((v) => {
        const next = { ...v, ...(typeof patch === 'function' ? patch(v) : patch) };
        if (loaded.current === scope) write(currentKey(scope), next);
        return next;
      });
    },
    [scope],
  );

  const saveView = useCallback(
    (name: string, filters: Record<string, string>) => {
      setSavedState((list) => {
        const next = [{ name, view, filters }, ...list.filter((s) => s.name !== name)].slice(0, 20);
        write(savedKey(scope), next);
        return next;
      });
    },
    [scope, view],
  );
  const deleteView = useCallback(
    (name: string) => {
      setSavedState((list) => {
        const next = list.filter((s) => s.name !== name);
        write(savedKey(scope), next);
        return next;
      });
    },
    [scope],
  );

  return { view, setView, saved, saveView, deleteView };
}
