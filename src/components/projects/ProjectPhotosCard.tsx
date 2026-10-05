'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectImagesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { FORMAT_LABELS } from '@/lib/domain';
import { checkPhotoFile, photoThumbUrl } from '@/lib/project-photos';
import { num } from '@/lib/format';
import { usePhotoUploads } from '@/hooks/usePhotoUploads';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { FormError, GhostButton } from '@/components/ui/Form';
import { ProjectPhotoLightbox } from './ProjectPhotoLightbox';

const STATUS_LABEL = { queued: 'Waiting', uploading: 'Uploading…', done: 'Uploaded', failed: 'Failed' } as const;

/**
 * Gallery of photos of the project's physical items. Everyone with project:view sees
 * it; the server decides `can.manage` (project:edit or an assignee of one of the
 * project's lots), which gates Add / Edit / Replace / Delete.
 */
export function ProjectPhotosCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.projects.images(projectId),
    queryFn: () => projectImagesApi.list(projectId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.images(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
  };
  const uploads = usePhotoUploads(refresh);

  const images = query.data?.images ?? [];
  const canManage = query.data?.can.manage ?? false;

  const onPick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const problems: string[] = [];
    const ok = files.filter((f) => {
      const p = checkPhotoFile(f);
      if (p) problems.push(p);
      return !p;
    });
    setProblem(problems.length > 0 ? problems.join(' ') : null);
    if (ok.length > 0) {
      void uploads.start(projectId, ok.map((file) => ({ file, caption: '', format: null }))).then(refresh);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const visibleUploads = uploads.entries.filter((e) => e.status !== 'done');

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Photos">
        {query.data ? <span className="text-[12px] text-ink-3">{num(images.length)}</span> : null}
        {canManage ? (
          <span className="ml-auto">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onPick(e.target.files)}
            />
            <GhostButton className="!h-8 !px-3 text-[12px]" onClick={() => inputRef.current?.click()}>
              Add photos
            </GhostButton>
          </span>
        ) : null}
      </PanelHeader>

      {problem ? (
        <div className="px-4 pt-3">
          <FormError message={problem} />
        </div>
      ) : null}

      {visibleUploads.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 px-4 pt-3" aria-label="Photo uploads">
          {visibleUploads.map((e) => (
            <li key={e.key} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="min-w-0 max-w-[40ch] truncate text-ink-2">{e.file.name}</span>
              <Badge severity={e.status === 'failed' ? 'critical' : 'info'}>{STATUS_LABEL[e.status]}</Badge>
              {e.status === 'failed' ? (
                <>
                  <span className="text-danger">{e.error}</span>
                  <button
                    type="button"
                    onClick={() => void uploads.retry(e.key).then(refresh)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent hover:underline"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => uploads.dismiss(e.key)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-ink-3 hover:underline"
                  >
                    Dismiss
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {query.isError ? (
        <ErrorState
          message={query.error instanceof ApiRequestError ? query.error.message : 'Could not load photos.'}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="Loading photos">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-[13px] font-medium text-ink-3">No photos yet.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((img) => (
            <li key={img.id} className="m-0 min-w-0">
              <button
                type="button"
                onClick={() => setOpenId(img.id)}
                aria-label={`Open photo: ${img.caption || img.fileName}`}
                className="block w-full cursor-pointer overflow-hidden rounded-[8px] border border-line-soft bg-surface-sunken p-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoThumbUrl(img.url)}
                  alt={img.caption || img.fileName}
                  width={400}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              </button>
              <div className="mt-1.5 flex min-w-0 flex-col items-start gap-1">
                {img.caption ? (
                  <span className="line-clamp-2 break-words text-[12px] leading-snug text-ink-2">{img.caption}</span>
                ) : null}
                {img.format ? <Badge severity="neutral">{FORMAT_LABELS[img.format]}</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {openId ? (
        <ProjectPhotoLightbox
          projectId={projectId}
          images={images}
          openId={openId}
          canManage={canManage}
          onNavigate={setOpenId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      ) : null}
    </Panel>
  );
}
