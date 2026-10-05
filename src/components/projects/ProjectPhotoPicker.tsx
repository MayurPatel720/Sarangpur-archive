'use client';

import { useEffect, useRef, useState } from 'react';
import type { Format } from '@/lib/domain';
import { checkPhotoFile } from '@/lib/project-photos';
import { FormError, GhostButton, TextInput } from '@/components/ui/Form';
import { PHOTO_MAX_CAPTION } from '@/types/project-image';
import { PhotoFormatSelect } from './PhotoFormatSelect';

export interface PickedPhoto {
  id: string;
  file: File;
  caption: string;
  format: Format | null;
}

/** Thumbnail with an object-URL preview that is revoked on unmount / file change. */
function PickedTile({
  photo,
  disabled,
  onChange,
  onRemove,
}: {
  photo: PickedPhoto;
  disabled?: boolean;
  onChange: (patch: Partial<PickedPhoto>) => void;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(photo.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.file]);

  return (
    <li className="m-0 flex flex-col gap-2 rounded-[8px] border border-line-soft bg-surface p-2 list-none">
      <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-surface-sunken">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={photo.file.name}
            width={240}
            height={240}
            className="h-full w-full object-cover"
          />
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${photo.file.name}`}
          className="absolute right-1.5 top-1.5 h-7 w-7 cursor-pointer rounded-full border border-line-strong bg-surface text-[14px] leading-none text-ink-2 shadow-control disabled:opacity-60"
        >
          ×
        </button>
      </div>
      <TextInput
        value={photo.caption}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Caption (optional)"
        maxLength={PHOTO_MAX_CAPTION}
        disabled={disabled}
        aria-label={`Caption for ${photo.file.name}`}
      />
      <PhotoFormatSelect
        value={photo.format}
        onChange={(format) => onChange({ format })}
        disabled={disabled}
        label={`Format tag for ${photo.file.name}`}
      />
    </li>
  );
}

/**
 * New-project form section: choose photos of the physical items. Files stay in the
 * wizard's state and are uploaded after the project exists.
 */
export function ProjectPhotoPicker({
  photos,
  onChange,
  disabled,
}: {
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [problem, setProblem] = useState<string | null>(null);

  const onPick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const problems: string[] = [];
    const accepted: PickedPhoto[] = [];
    for (const file of files) {
      const p = checkPhotoFile(file);
      if (p) problems.push(p);
      else accepted.push({ id: `p${(seq.current += 1)}`, file, caption: '', format: null });
    }
    setProblem(problems.length > 0 ? problems.join(' ') : null);
    if (accepted.length > 0) onChange([...photos, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const patch = (id: string, p: Partial<PickedPhoto>) =>
    onChange(photos.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onPick(e.target.files)}
        />
        <GhostButton disabled={disabled} onClick={() => inputRef.current?.click()}>
          Add photos
        </GhostButton>
        <span className="text-[12px] text-ink-3">
          {photos.length === 0
            ? 'Photos are resized and uploaded after the project is created.'
            : `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} selected`}
        </span>
      </div>
      <FormError message={problem} />
      {photos.length > 0 ? (
        <ul className="m-0 grid grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <PickedTile
              key={p.id}
              photo={p}
              disabled={disabled}
              onChange={(patchValue) => patch(p.id, patchValue)}
              onRemove={() => onChange(photos.filter((x) => x.id !== p.id))}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
