'use client';

import { useCallback, useRef, useState } from 'react';
import type { DragEvent, HTMLAttributes } from 'react';

export type LotSection = 'new' | 'accepted';

/**
 * Native HTML5 drag-and-drop between the two My lots sections. Rows are drag
 * sources tagged with their section; each section wrapper is a drop target that
 * accepts rows from the OTHER section only. `onMove` does the actual work.
 */
export function useLotDnd<T extends { id: string }>(
  onMove: (row: T, to: LotSection) => void,
) {
  const dragged = useRef<{ row: T; from: LotSection } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<LotSection | null>(null);

  const end = useCallback(() => {
    dragged.current = null;
    setDraggingId(null);
    setOver(null);
  }, []);

  const rowProps = useCallback(
    (section: LotSection) =>
      (row: T): HTMLAttributes<HTMLElement> => ({
        draggable: true,
        style: draggingId === row.id ? { opacity: 0.5 } : undefined,
        onDragStart: (e: DragEvent<HTMLElement>) => {
          dragged.current = { row, from: section };
          e.dataTransfer.effectAllowed = 'move';
          // Firefox needs data to be set for a drag to start.
          e.dataTransfer.setData('text/plain', row.id);
          setDraggingId(row.id);
        },
        onDragEnd: end,
      }),
    [draggingId, end],
  );

  const zoneProps = useCallback(
    (section: LotSection) => {
      const accepts = () => dragged.current !== null && dragged.current.from !== section;
      return {
        onDragOver: (e: DragEvent<HTMLElement>) => {
          if (!accepts()) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(section);
        },
        onDragLeave: (e: DragEvent<HTMLElement>) => {
          // Ignore leaves into a child of the same zone.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setOver((cur) => (cur === section ? null : cur));
        },
        onDrop: (e: DragEvent<HTMLElement>) => {
          if (!accepts()) return;
          e.preventDefault();
          const row = dragged.current!.row;
          end();
          onMove(row, section);
        },
      };
    },
    [end, onMove],
  );

  /** True while a row from the other section is being dragged over this one. */
  const isOver = (section: LotSection) => over === section;
  /** True while any drag is in flight that this section could receive. */
  const canReceive = (section: LotSection) =>
    draggingId !== null && dragged.current !== null && dragged.current.from !== section;

  return { rowProps, zoneProps, isOver, canReceive };
}
