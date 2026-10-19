'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, itemImagesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { buildPhotoForm, checkPhotoFile, photoLargeUrl, photoThumbUrl, preparePhoto } from '@/lib/project-photos';
import { Badge, ErrorState, Skeleton } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { ITEM_PHOTO_MAX, type ItemImage } from '@/types/lot-image';
import type { GridItem } from '@/types/items';

/**
 * The photos of one Prasadi item: see them, take or add up to 5 (the first is the cover), make
 * another the cover, delete one. "Take photo" opens the camera on a phone or tablet; "Choose" opens
 * the gallery / files. Only people who may edit the lot see the add / delete controls.
 */
export function ItemPhotosDialog({
  lotId,
  item,
  onClose,
  onChanged,
}: {
  lotId: string;
  item: GridItem;
  onClose: () => void;
  /** Called after any change, so the Excel refreshes its thumbnail. */
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [removing, setRemoving] = useState<ItemImage | null>(null);
  const [viewing, setViewing] = useState<ItemImage | null>(null);

  const key = queryKeys.lots.itemImages(lotId, item.id);
  const query = useQuery({ queryKey: key, queryFn: () => itemImagesApi.list(lotId, item.id) });
  const images = query.data?.images ?? [];
  const canManage = query.data?.can.manage ?? false;
  const room = ITEM_PHOTO_MAX - images.length;

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    onChanged();
  };

  const upload = async (files: File[]) => {
    setProblem(null);
    setFailed([]);
    const ok: File[] = [];
    const problems: string[] = [];
    for (const f of files) {
      const p = checkPhotoFile(f);
      if (p) problems.push(p);
      else ok.push(f);
    }
    if (ok.length > room) problems.push(`Only ${room} more ${room === 1 ? 'photo fits' : 'photos fit'} (max ${ITEM_PHOTO_MAX} per item).`);
    if (problems.length > 0) setProblem(problems.join(' '));
    const bad: string[] = [];
    for (const file of ok.slice(0, Math.max(room, 0))) {
      setUploading(file.name);
      try {
        const prepared = await preparePhoto(file);
        await itemImagesApi.upload(lotId, item.id, buildPhotoForm(prepared));
        changed();
      } catch (e) {
        bad.push(`${file.name}: ${e instanceof ApiRequestError || e instanceof Error ? e.message : 'Upload failed.'}`);
      }
    }
    setUploading(null);
    setFailed(bad);
  };

  const cover = useMutation({
    mutationFn: (img: ItemImage) => itemImagesApi.makeCover(lotId, item.id, img.id),
    onSuccess: changed,
    onError: (e) => toast.error('Could not set the cover', e instanceof ApiRequestError ? e.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (img: ItemImage) => itemImagesApi.remove(lotId, item.id, img.id),
    onSuccess: () => {
      setRemoving(null);
      setViewing(null);
      changed();
      toast.success('Photo deleted');
    },
    onError: (e) => {
      setRemoving(null);
      toast.error('Could not delete the photo', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  return (
    <Dialog wide title={`Photos — ${item.itemName || item.code}`} subtitle={`${item.code} · ${images.length} of ${ITEM_PHOTO_MAX}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* capture opens the camera on phones / tablets; desktops fall back to the file picker */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            <PrimaryButton disabled={room <= 0 || uploading !== null} onClick={() => cameraRef.current?.click()}>
              Take photo
            </PrimaryButton>
            <GhostButton disabled={room <= 0 || uploading !== null} onClick={() => galleryRef.current?.click()}>
              Choose from gallery
            </GhostButton>
            <span className="text-[12px] text-ink-3">
              {room <= 0 ? `The limit of ${ITEM_PHOTO_MAX} photos is reached.` : uploading ? `Uploading ${uploading}…` : `${room} more can be added. The first photo is the cover.`}
            </span>
          </div>
        ) : null}

        <FormError message={problem} />
        {failed.length > 0 ? <FormError message={failed.join(' ')} /> : null}

        {query.isError ? (
          <ErrorState message={query.error instanceof ApiRequestError ? query.error.message : 'Could not load the photos.'} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="m-0 py-8 text-center text-[13px] font-medium text-ink-3">No photos of this item yet.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((img) => (
              <li key={img.id} className="m-0 min-w-0">
                <button
                  type="button"
                  onClick={() => setViewing(img)}
                  aria-label={`Open photo ${img.fileName}`}
                  className="relative block w-full cursor-pointer overflow-hidden rounded-[8px] border border-line-soft bg-surface-sunken p-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoThumbUrl(img.url)} alt={img.fileName} width={400} height={400} loading="lazy" className="aspect-square w-full object-cover" />
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {img.isCover ? (
                    <Badge severity="good">Cover</Badge>
                  ) : canManage ? (
                    <button
                      type="button"
                      disabled={cover.isPending}
                      onClick={() => cover.mutate(img)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-accent hover:underline"
                    >
                      Make cover
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing ? (
        <Dialog wide title={viewing.fileName} subtitle={`Added by ${viewing.uploadedByName}${viewing.isCover ? ' · cover photo' : ''}`} onClose={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoLargeUrl(viewing.url)} alt={viewing.fileName} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-[6px]" />
          {canManage ? (
            <div className="mt-3 flex justify-end">
              <GhostButton onClick={() => setRemoving(viewing)}>Delete photo</GhostButton>
            </div>
          ) : null}
        </Dialog>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title="Delete this photo?"
          body="The photo is removed from this item and from storage. This cannot be undone."
          confirmLabel="Delete photo"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </Dialog>
  );
}
