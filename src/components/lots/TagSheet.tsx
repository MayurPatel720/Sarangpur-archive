'use client';

import { useEffect } from 'react';
import { refLabel, type RefLists } from '@/lib/ref-lists';
import { photoThumbUrl } from '@/lib/project-photos';
import { GhostButton, PrimaryButton } from '@/components/ui/Form';
import type { GridItem } from '@/types/items';

/**
 * A print-ready sheet of item tags for the ticked rows: each label shows the archive code as text
 * (big, so it can be read or copied onto a sticker), the title and, for Prasadi, the Guru and
 * category, plus the cover photo when there is one. Print uses the browser's print dialog; only
 * the sheet is printed (see \`.tag-print\` in globals.css).
 */
export function TagSheet({ items, lots, onClose }: { items: GridItem[]; lots: RefLists; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="tag-overlay fixed inset-0 z-[120] flex flex-col bg-surface text-ink" role="dialog" aria-modal="true" aria-label="Print tags">
      <div className="tag-noprint flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="m-0 text-[15px] font-semibold">Tags — {items.length} {items.length === 1 ? 'item' : 'items'}</h2>
        <span className="text-[12px] text-ink-3">Each tag shows the archive code as text. Cut along the dashed lines.</span>
        <span className="ml-auto flex gap-2">
          <PrimaryButton onClick={() => window.print()}>Print</PrimaryButton>
          <GhostButton onClick={onClose}>Close</GhostButton>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="tag-print grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const guru = it.format === 'prasadi' && it.attrs.blessedBy ? refLabel(lots, 'guru', String(it.attrs.blessedBy)) : '';
            const cat =
              it.format === 'prasadi'
                ? [it.attrs.category ? refLabel(lots, 'prasadiCategory', String(it.attrs.category)) : '', it.attrs.subcategory ? refLabel(lots, 'prasadiSubcategory', String(it.attrs.subcategory)) : '']
                    .filter(Boolean)
                    .join(' › ')
                : '';
            const title = it.itemName || it.subtypeLabel;
            return (
              <div key={it.id} className="tag-card flex min-h-[110px] items-stretch gap-3 rounded-[6px] border border-dashed border-line-strong p-3">
                {it.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumbUrl(it.coverUrl)} alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 rounded-[4px] object-cover" />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span className="break-all font-mono text-[18px] font-bold leading-tight">{it.code}</span>
                  <span className="text-[13px] font-semibold leading-snug">{title}</span>
                  {guru ? <span className="text-[12px] leading-snug">{guru}</span> : null}
                  {cat ? <span className="text-[11.5px] leading-snug">{cat}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
