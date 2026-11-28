'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Dialog } from '@/components/ui/Dialog';
import { GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';

/**
 * Browse the folders of THIS server and pick one (used for the photo folder). Starts where the field already points, lists
 * the folders inside (names only), lets the admin go up, type a path (e.g. a network path) or use a quick pick, and
 * returns the chosen path with "Use this folder". Nothing is created or changed here.
 */
export function FolderPicker({ start, onPick, onClose }: { start: string; onPick: (path: string) => void; onClose: () => void }) {
  const [path, setPath] = useState(start.trim());
  const [typed, setTyped] = useState(start.trim());

  const listing = useQuery({
    queryKey: queryKeys.admin.browse(path),
    queryFn: () => adminApi.browseFolder(path),
    retry: false,
  });
  const go = (next: string) => {
    setPath(next);
    setTyped(next);
  };
  const data = listing.data;

  return (
    <Dialog title="Choose the photo folder" subtitle="Folders on this server. Open a folder, then press “Use this folder”." onClose={onClose}>
      <div className="flex flex-col gap-3">
        {/* Not a <form>: this dialog opens from inside the Settings form, and a nested form is invalid HTML (and Enter would save the settings). */}
        <div className="flex gap-2">
          <TextInput
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                go(typed.trim());
              }
            }}
            placeholder="Type or paste a path…"
            aria-label="Folder path"
            name="folderPath"
            className="!h-11 font-mono !text-[12.5px]"
            autoComplete="off"
            spellCheck={false}
          />
          <GhostButton type="button" className="!h-11" onClick={() => go(typed.trim())}>
            Open
          </GhostButton>
        </div>
        <p className="m-0 -mt-1.5 text-[12px] text-ink-3">
          Example: <span className="font-mono">D:\photos</span> or <span className="font-mono">\\server\share\photos</span>
        </p>

        {data ? (
          <p
            role="note"
            className={`m-0 rounded-[6px] border px-3 py-2 text-[12.5px] leading-relaxed ${data.server.hosted ? 'border-danger-line bg-danger-bg text-danger' : 'border-line bg-accent-soft text-ink'}`}
          >
            {data.server.hosted
              ? 'This app is running on a cloud host, so these are the cloud host’s folders, not your PC or your file server. A photo folder can’t be used here: choose Cloud storage, or run the app on your own server.'
              : `These are the folders of the server this app runs on: ${data.server.name} (${data.server.os}). A website cannot open folders on your own PC. Run the app on the Windows server that holds the photos to browse its drives.`}
          </p>
        ) : null}

        {data && data.suggestions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-ink-3">Quick picks:</span>
            {data.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                className="max-w-full cursor-pointer truncate rounded-full border border-line bg-surface px-2.5 py-0.5 text-ink-2 hover:bg-surface-sunken"
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <GhostButton type="button" disabled={!data || data.parent === null} onClick={() => data && data.parent !== null && go(data.parent)}>
            <span className="inline-flex items-center gap-1">
              <IconChevronLeft size={14} aria-hidden="true" />
              Up
            </span>
          </GhostButton>
          <span className="min-w-0 truncate font-mono" title={data?.path}>
            {data ? data.path || 'This computer' : '…'}
          </span>
        </div>

        <div className="max-h-[320px] min-h-[160px] overflow-y-auto overscroll-contain rounded-[8px] border border-line-soft bg-surface-subtle">
          {listing.isPending ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : listing.isError ? (
            <ErrorState
              message={listing.error instanceof ApiRequestError ? listing.error.message : "Couldn't open that folder."}
              hint="Check the path, or go up and choose another folder."
              onRetry={() => void listing.refetch()}
            />
          ) : data && data.folders.length === 0 ? (
            <p className="m-0 p-4 text-[12.5px] text-ink-3">No folders inside. You can use this folder, or go up.</p>
          ) : (
            <ul className="m-0 list-none p-1">
              {data?.folders.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => go(f.path)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[6px] border-0 bg-transparent px-2.5 py-2.5 text-left text-[13px] text-ink hover:bg-surface-sunken focus-visible:bg-surface-sunken"
                  >
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <IconChevronRight size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {data?.truncated ? <li className="px-2.5 py-1.5 text-[12px] text-ink-3">Only the first 500 folders are shown. Type the path to go deeper.</li> : null}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton
            type="button"
            disabled={!data || !data.path}
            onClick={() => {
              if (data?.path) onPick(data.path);
            }}
          >
            Use this folder
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
