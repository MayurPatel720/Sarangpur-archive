'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, projectImagesApi } from '@/lib/api-client';
import type { Format } from '@/lib/domain';
import { buildPhotoForm, checkPhotoFile, photoLargeUrl, preparePhoto } from '@/lib/project-photos';
import { date } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { PHOTO_MAX_CAPTION, type ProjectImage } from '@/types/project-image';
import { PhotoFormatSelect } from './PhotoFormatSelect';

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof ApiRequestError || e instanceof Error ? e.message : fallback;

/** Caption / tag editor for one photo. Keyed by image id + updatedAt so it resets after a save. */
function PhotoEditor({
  projectId,
  image,
  onChanged,
}: {
  projectId: string;
  image: ProjectImage;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [caption, setCaption] = useState(image.caption);
  const [format, setFormat] = useState<Format | null>(image.format);
  const dirty = caption.trim() !== image.caption || format !== image.format;

  const save = useMutation({
    mutationFn: (body: { caption?: string; format?: Format | null }) =>
      projectImagesApi.update(projectId, image.id, body),
    onSuccess: onChanged,
    onError: (e) => toast.error('Could not save the photo', errorMessage(e, 'Try again.')),
  });

  const submit = () => {
    if (!dirty || save.isPending) return;
    save.mutate({
      ...(caption.trim() !== image.caption ? { caption: caption.trim() } : {}),
      ...(format !== image.format ? { format } : {}),
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Caption">
        <TextInput
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={submit}
          maxLength={PHOTO_MAX_CAPTION}
          placeholder="Describe what the photo shows"
          disabled={save.isPending}
        />
      </Field>
      <Field label="Format tag">
        <PhotoFormatSelect
          value={format}
          onChange={(next) => {
            setFormat(next);
            save.mutate({ format: next });
          }}
          disabled={save.isPending}
        />
      </Field>
      <div className="flex justify-end">
        <PrimaryButton disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</PrimaryButton>
      </div>
    </form>
  );
}

/**
 * Large view of one project photo with prev/next (buttons and Left/Right arrow keys),
 * caption + tag editing, replace and delete. Edit controls only render for `canManage`.
 */
export function ProjectPhotoLightbox({
  projectId,
  images,
  openId,
  canManage,
  onNavigate,
  onClose,
  onChanged,
}: {
  projectId: string;
  images: ProjectImage[];
  openId: string;
  canManage: boolean;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const replaceRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const index = images.findIndex((i) => i.id === openId);
  const image = images[index];

  // The photo vanished (deleted here or elsewhere): leave the lightbox.
  useEffect(() => {
    if (!image) onClose();
  }, [image, onClose]);

  const go = (delta: number) => {
    const next = images[index + delta];
    if (next) {
      setError(null);
      onNavigate(next.id);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const remove = useMutation({
    mutationFn: () => projectImagesApi.remove(projectId, openId),
    onSuccess: () => {
      const neighbour = images[index + 1] ?? images[index - 1];
      setConfirming(false);
      toast.success('Photo deleted');
      onChanged();
      if (neighbour) onNavigate(neighbour.id);
      else onClose();
    },
  });

  if (!image) return null;

  const onReplace = async (file: File | undefined) => {
    if (replaceRef.current) replaceRef.current.value = '';
    if (!file) return;
    const problem = checkPhotoFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setReplacing(true);
    try {
      const prepared = await preparePhoto(file);
      await projectImagesApi.replace(projectId, image.id, buildPhotoForm(prepared));
      toast.success('Photo replaced');
      onChanged();
    } catch (e) {
      setError(errorMessage(e, 'Could not replace the photo.'));
    } finally {
      setReplacing(false);
    }
  };

  const title = image.caption || image.fileName;

  return (
    <>
      <Dialog
        wide
        title={title}
        subtitle={`Photo ${index + 1} of ${images.length} · ${image.uploadedByName} · ${date(image.createdAt)}`}
        onClose={() => (confirming ? undefined : onClose())}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <GhostButton aria-label="Previous photo" disabled={index <= 0} onClick={() => go(-1)} className="!px-3">
              ‹
            </GhostButton>
            <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-[8px] bg-surface-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoLargeUrl(image.url)}
                alt={title}
                width={image.width ?? 1200}
                height={image.height ?? 800}
                className="max-h-[60dvh] w-auto max-w-full object-contain"
              />
            </div>
            <GhostButton
              aria-label="Next photo"
              disabled={index >= images.length - 1}
              onClick={() => go(1)}
              className="!px-3"
            >
              ›
            </GhostButton>
          </div>

          <FormError message={error} />

          {canManage ? (
            <>
              <PhotoEditor
                key={`${image.id}:${image.updatedAt}`}
                projectId={projectId}
                image={image}
                onChanged={onChanged}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
                <input
                  ref={replaceRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void onReplace(e.target.files?.[0])}
                />
                <GhostButton disabled={replacing} onClick={() => replaceRef.current?.click()}>
                  {replacing ? 'Replacing…' : 'Replace image'}
                </GhostButton>
                <button
                  type="button"
                  disabled={replacing}
                  onClick={() => setConfirming(true)}
                  className="h-10 cursor-pointer rounded-[6px] border border-danger-line bg-surface px-4 text-[13px] font-semibold text-danger shadow-control disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>

      {confirming ? (
        <ConfirmDialog
          title="Delete this photo?"
          body="The photo is removed from the project and its file is deleted. This cannot be undone."
          confirmLabel="Delete photo"
          pending={remove.isPending}
          error={remove.isError ? errorMessage(remove.error, 'Could not delete the photo.') : null}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}
