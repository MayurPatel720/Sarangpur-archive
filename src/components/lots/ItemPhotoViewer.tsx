'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { itemImagesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { photoLargeUrl } from '@/lib/project-photos';
import { GhostButton } from '@/components/ui/Form';
import type { GridItem } from '@/types/items';

/**
 * Full-screen view of an item's photos: the picture fills the screen, ← / → (or the arrows) move
 * between the item's photos, Esc or a click on the dark area closes it. "Manage photos" opens the
 * add / delete dialog.
 */
export function ItemPhotoViewer({
  lotId,
  item,
  onClose,
  onManage,
}: {
  lotId: string;
  item: GridItem;
  onClose: () => void;
  onManage: () => void;
}) {
  const query = useQuery({ queryKey: queryKeys.lots.itemImages(lotId, item.id), queryFn: () => itemImagesApi.list(lotId, item.id) });
  const images = query.data?.images ?? [];
  const [index, setIndex] = useState(0);
  const last = Math.max(images.length - 1, 0);
  const current = images[Math.min(index, last)];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, last));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, last]);

  const nav = 'absolute top-1/2 -translate-y-1/2 h-12 w-12 cursor-pointer rounded-full border border-line-strong bg-surface text-[22px] text-ink shadow-control disabled:opacity-40 disabled:cursor-default';

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={`Photos of ${item.itemName || item.code}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-white">
        <span className="min-w-0 truncate text-[14px] font-semibold">{item.itemName || item.code}</span>
        <span className="font-mono text-[12px] opacity-80">{item.code}</span>
        {images.length > 0 ? <span className="text-[12px] tabular-nums opacity-80">{Math.min(index, last) + 1} / {images.length}</span> : null}
        <span className="ml-auto flex gap-2">
          <GhostButton onClick={onManage}>Manage photos</GhostButton>
          <GhostButton onClick={onClose}>Close</GhostButton>
        </span>
      </div>
      <div className="relative min-h-0 flex-1" onClick={onClose}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoLargeUrl(current.url)}
            alt={current.fileName}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="m-0 flex h-full items-center justify-center text-[14px] text-white">{query.isLoading ? 'Loading…' : 'No photos yet.'}</p>
        )}
        {images.length > 1 ? (
          <>
            <button type="button" aria-label="Previous photo" disabled={index <= 0} className={`${nav} left-4`} onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(i - 1, 0)); }}>
              ‹
            </button>
            <button type="button" aria-label="Next photo" disabled={index >= last} className={`${nav} right-4`} onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(i + 1, last)); }}>
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
