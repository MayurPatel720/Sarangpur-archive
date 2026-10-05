'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiRequestError, projectImagesApi } from '@/lib/api-client';
import { buildPhotoForm, preparePhoto } from '@/lib/project-photos';
import type { Format } from '@/lib/domain';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface UploadInput {
  file: File;
  caption: string;
  format: Format | null;
}

export interface UploadEntry extends UploadInput {
  key: string;
  projectId: string;
  status: UploadStatus;
  error?: string;
}

const CONCURRENCY = 2;

/**
 * Sequential-ish (2 at a time) photo uploads, one file per request, with per-photo
 * status and retry. Shared by the project page gallery and the new-project wizard.
 * `start` resolves once every given photo has finished (done or failed).
 */
export function usePhotoUploads(onUploaded?: () => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const entriesRef = useRef<UploadEntry[]>([]);
  const seq = useRef(0);

  const commit = useCallback((next: UploadEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const patch = useCallback(
    (key: string, p: Partial<UploadEntry>) => commit(entriesRef.current.map((e) => (e.key === key ? { ...e, ...p } : e))),
    [commit],
  );

  const runKeys = useCallback(
    async (keys: string[]) => {
      const pending = [...keys];
      const worker = async () => {
        for (let key = pending.shift(); key !== undefined; key = pending.shift()) {
          const entry = entriesRef.current.find((e) => e.key === key);
          if (!entry) continue;
          patch(key, { status: 'uploading', error: undefined });
          try {
            const prepared = await preparePhoto(entry.file);
            await projectImagesApi.upload(
              entry.projectId,
              buildPhotoForm(prepared, { caption: entry.caption.trim(), format: entry.format }),
            );
            patch(key, { status: 'done' });
            onUploaded?.();
          } catch (e) {
            patch(key, {
              status: 'failed',
              error: e instanceof ApiRequestError || e instanceof Error ? e.message : 'Upload failed.',
            });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
      return keys.filter((k) => entriesRef.current.find((e) => e.key === k)?.status === 'failed').length;
    },
    [patch, onUploaded],
  );

  /** Queue and upload photos to a project. Resolves to the number that failed. */
  const start = useCallback(
    (projectId: string, inputs: UploadInput[]) => {
      const added: UploadEntry[] = inputs.map((i) => ({
        ...i,
        key: `u${(seq.current += 1)}`,
        projectId,
        status: 'queued',
      }));
      commit([...entriesRef.current, ...added]);
      return runKeys(added.map((a) => a.key));
    },
    [commit, runKeys],
  );

  const retry = useCallback((key: string) => runKeys([key]), [runKeys]);
  const dismiss = useCallback(
    (key: string) => commit(entriesRef.current.filter((e) => e.key !== key)),
    [commit],
  );
  const clearFinished = useCallback(
    () => commit(entriesRef.current.filter((e) => e.status === 'queued' || e.status === 'uploading' || e.status === 'failed')),
    [commit],
  );

  const busy = entries.some((e) => e.status === 'queued' || e.status === 'uploading');
  return { entries, busy, start, retry, dismiss, clearFinished };
}
