'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IHeaderParams } from 'ag-grid-community';

/**
 * Column header of the lot's Excel. A left click opens a small menu — "Hide column", and
 * "Delete column" for columns the team added. (The ⋯ button above the grid brings hidden
 * columns back.) Replaces AG Grid's own header so there is no sort or filter chrome.
 */
export interface GridHeaderParams extends IHeaderParams {
  /** Offer "Hide column". False for the Archive code. */
  hideable: boolean;
  onHide: () => void;
  /** Set for a column the team added: offers "Delete column…". */
  onDelete?: () => void;
  hint?: string;
}

export function GridHeader(p: GridHeaderParams) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const interactive = p.hideable || Boolean(p.onDelete);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const item =
    'block w-full text-left bg-transparent border-0 px-3 py-1.5 text-[12.5px] text-ink cursor-pointer hover:bg-accent-soft';

  return (
    <div
      className={`flex h-full w-full items-center ${interactive ? 'cursor-pointer' : ''}`}
      title={p.hint}
      onClick={(e) => {
        if (!interactive) return;
        setMenu({ x: Math.min(e.clientX, window.innerWidth - 190), y: e.clientY + 6 });
      }}
    >
      <span className="truncate font-semibold text-ink-3">{p.displayName}</span>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              className="fixed z-[200] min-w-[170px] rounded-[8px] border border-line bg-surface py-1 shadow-panel"
            >
              {p.hideable ? (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setMenu(null);
                    p.onHide();
                  }}
                >
                  Hide column
                </button>
              ) : null}
              {p.onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-danger`}
                  onClick={() => {
                    setMenu(null);
                    p.onDelete?.();
                  }}
                >
                  Delete column…
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
