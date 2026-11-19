'use client';

import type { IHeaderGroupParams, IHeaderParams } from 'ag-grid-community';

/** What the sheet menu needs to know about one column heading. */
export interface ColumnMenuInfo {
  id: string;
  label: string;
  /** Offer "Hide column". False for the Archive code. */
  hideable: boolean;
  onHide: () => void;
  /** Set for a column the team added: offers "Delete column…". */
  onDelete?: () => void;
  /** Move the column one place left (-1) or right (1) inside its department; pin / unpin it. */
  onMove?: (step: -1 | 1) => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  pinned?: boolean;
  onPin?: () => void;
}

/**
 * Column header of the lot's Excel. A click on it, or a right-click, opens the sheet's one menu (this column's
 * actions first, then columns / display / layout) — see ItemsGrid. Replaces AG Grid's own header so there is no
 * sort or filter chrome.
 */
export interface GridHeaderParams extends IHeaderParams {
  info: ColumnMenuInfo;
  onOpenMenu: (pos: { x: number; y: number }, info: ColumnMenuInfo) => void;
  hint?: string;
}

export function GridHeader(p: GridHeaderParams) {
  const open = (x: number, y: number) => p.onOpenMenu({ x, y }, p.info);
  return (
    <div
      className="flex h-full w-full cursor-pointer items-center"
      title={p.hint}
      onClick={(e) => open(e.clientX, e.clientY + 6)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(e.clientX, e.clientY);
      }}
    >
      {p.info.onMove ? (
        <span aria-hidden title="Drag the heading to move this column" className="mr-1 shrink-0 cursor-grab select-none text-[12px] leading-none text-ink-4 hover:text-accent">
          ⠿
        </span>
      ) : null}
      <span className="truncate font-semibold text-ink-3">{p.displayName}</span>
    </div>
  );
}

/** What the sheet menu needs to know about a department band. */
export interface SectionMenuInfo {
  label: string;
  /** This department is the only one showing. */
  active: boolean;
  onShowOnly: () => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

/**
 * Department band above the columns. A click or right-click opens the sheet's one menu with this section's actions
 * (show only it, show every section, hide it) first.
 */
export interface DeptHeaderParams extends IHeaderGroupParams {
  info: SectionMenuInfo;
  onOpenSectionMenu: (pos: { x: number; y: number }, info: SectionMenuInfo) => void;
}

export function DeptHeader(p: DeptHeaderParams) {
  const open = (x: number, y: number) => p.onOpenSectionMenu({ x, y }, p.info);
  return (
    <div
      className="flex h-full w-full cursor-pointer items-center gap-1.5"
      onClick={(e) => open(e.clientX, e.clientY + 6)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(e.clientX, e.clientY);
      }}
    >
      <span className="truncate font-semibold text-ink-2">{p.displayName}</span>
      {p.info.active ? <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">only</span> : null}
    </div>
  );
}
