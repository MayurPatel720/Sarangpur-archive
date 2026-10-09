'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, tasksApi } from '@/lib/api-client';
import { buildPhotoForm, checkPhotoFile, preparePhoto } from '@/lib/project-photos';
import { MAX_COMMENT_IMAGES, type TaskAttachment } from '@/types/task';

export interface PendingImage {
  key: string;
  name: string;
  /** Local object URL for the thumbnail while / after uploading. */
  preview: string;
  status: 'uploading' | 'done' | 'failed';
  error?: string;
  attachment?: TaskAttachment;
}

/**
 * Images for one comment being written. Each picture is shrunk in the browser and
 * uploaded the moment it is chosen (one request per file, up to 2 at a time), so
 * "Post" only has to send the returned metadata. Removing a picture before posting
 * also deletes it from storage.
 */
export function useCommentImages(taskId: string) {
  const [items, setItems] = useState<PendingImage[]>([]);
  const itemsRef = useRef<PendingImage[]>([]);
  const seq = useRef(0);
  const commit = useCallback((next: PendingImage[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);
  const patch = useCallback(
    (key: string, p: Partial<PendingImage>) => commit(itemsRef.current.map((i) => (i.key === key ? { ...i, ...p } : i))),
    [commit],
  );

  const uploadOne = useCallback(
    async (key: string, file: File) => {
      try {
        const prepared = await preparePhoto(file);
        const attachment = await tasksApi.uploadImage(taskId, buildPhotoForm(prepared));
        patch(key, { status: 'done', attachment });
      } catch (e) {
        patch(key, {
          status: 'failed',
          error: e instanceof ApiRequestError || e instanceof Error ? e.message : 'Upload failed.',
        });
      }
    },
    [taskId, patch],
  );

  /** Adds files; returns a message when some were refused (not an image, too large, over the limit). */
  const add = useCallback(
    (files: File[]): string | null => {
      let problem: string | null = null;
      const room = MAX_COMMENT_IMAGES - itemsRef.current.length;
      const accepted: File[] = [];
      for (const f of files) {
        const bad = checkPhotoFile(f);
        if (bad) problem = bad;
        else if (accepted.length >= room) problem = `A comment can carry up to ${MAX_COMMENT_IMAGES} images.`;
        else accepted.push(f);
      }
      const entries = accepted.map((file): PendingImage & { file: File } => ({
        key: `i${seq.current++}`,
        name: file.name,
        preview: URL.createObjectURL(file),
        status: 'uploading',
        file,
      }));
      commit([...itemsRef.current, ...entries.map(({ file: _f, ...rest }) => rest)]);
      const queue = [...entries];
      const worker = async () => {
        for (let e = queue.shift(); e; e = queue.shift()) await uploadOne(e.key, e.file);
      };
      void Promise.all([worker(), worker()]);
      return problem;
    },
    [commit, uploadOne],
  );

  const remove = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      URL.revokeObjectURL(item.preview);
      commit(itemsRef.current.filter((i) => i.key !== key));
      if (item.attachment) void tasksApi.discardImage(taskId, item.attachment.publicId).catch(() => undefined);
    },
    [commit, taskId],
  );

  /** After a successful post: forget the pictures WITHOUT deleting them (the comment owns them now). */
  const reset = useCallback(() => {
    for (const i of itemsRef.current) URL.revokeObjectURL(i.preview);
    commit([]);
  }, [commit]);

  // Leaving the screen with unposted pictures: clean up their previews (storage keeps them; harmless).
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  return {
    items,
    add,
    remove,
    reset,
    uploading: items.some((i) => i.status === 'uploading'),
    attachments: items.flatMap((i) => (i.status === 'done' && i.attachment ? [i.attachment] : [])),
    hasFailed: items.some((i) => i.status === 'failed'),
  };
}
