'use client';

import { useEffect } from 'react';
import { IconX } from '@/components/ui/icons';

export interface LightboxImage {
  src: string;
  alt: string;
  /** Full-size link for "Open original". */
  href?: string;
}

/**
 * Full-screen image viewer: arrows / swipe-free buttons for previous / next, Escape or
 * the scrim closes. Pure view — the caller owns which image is open.
 */
export function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const img = images[index];
  const many = images.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (many && e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (many && e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, many, onClose, onIndex]);

  if (!img) return null;
  const nav = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/55 text-white border-0 text-[22px] cursor-pointer';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Image viewer">
      <button type="button" aria-label="Close image" onClick={onClose} className="absolute inset-0 bg-black/80 border-0 cursor-default" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={img.alt} className="relative max-w-[96vw] max-h-[86dvh] object-contain rounded-[6px]" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/55 text-white border-0 cursor-pointer flex items-center justify-center"
      >
        <IconX size={18} />
      </button>
      {many ? (
        <>
          <button type="button" aria-label="Previous image" onClick={() => onIndex((index - 1 + images.length) % images.length)} className={`${nav} left-3`}>
            ‹
          </button>
          <button type="button" aria-label="Next image" onClick={() => onIndex((index + 1) % images.length)} className={`${nav} right-3`}>
            ›
          </button>
        </>
      ) : null}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3 text-[12px] text-white">
        <span className="px-2 py-1 rounded-[4px] bg-black/55">
          {index + 1} / {images.length}
        </span>
        {img.href ? (
          <a href={img.href} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-[4px] bg-black/55 text-white no-underline">
            Open original
          </a>
        ) : null}
      </div>
    </div>
  );
}
