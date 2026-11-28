import { readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { HttpError } from '@/lib/api';
import { getStorageConfig } from '@/server/storage-config';
import type { FolderBrowseResponse } from '@/types/admin';

/**
 * Lists the FOLDERS (never files) of a path on this server, so an admin can pick the photo folder in Settings instead of typing it.
 * Names only: file contents are never read. Needs `settings:manage`. At the top level it lists the drives on Windows, or "/" elsewhere;
 * a network path (\\server\share) cannot be enumerated, so it is typed once and browsed from there.
 */

const MAX_FOLDERS = 500;
const SKIP = /^(\$recycle\.bin|system volume information|\.|\$)/i;
const isWindows = process.platform === 'win32';
const BACKSLASH = String.fromCharCode(92);

export async function browseFolders(path: string): Promise<FolderBrowseResponse> {
  const cfg = await getStorageConfig();
  const suggestions = [...new Set([cfg.root, ...cfg.legacyRoots, process.env.MEDIA_ROOT?.trim() ?? ''].filter(Boolean))];
  const wanted = path.trim();

  // Top level.
  if (!wanted && isWindows) {
    const found = await Promise.all(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (letter) => {
        const drive = `${letter}:${BACKSLASH}`;
        try {
          await stat(/* turbopackIgnore: true */ drive);
          return { name: `${letter}:`, path: drive };
        } catch {
          return null;
        }
      }),
    );
    return { path: '', parent: null, folders: found.filter((f): f is { name: string; path: string } => f !== null), truncated: false, suggestions };
  }

  const here = wanted || '/';
  if (!isAbsolute(here)) throw new HttpError(400, 'Use a full path, like D:' + BACKSLASH + 'photos or ' + BACKSLASH + BACKSLASH + 'server' + BACKSLASH + 'share' + BACKSLASH + 'photos.');
  let info;
  try {
    info = await stat(/* turbopackIgnore: true */ here);
  } catch {
    throw new HttpError(400, "That folder doesn't exist or this server can't reach it.");
  }
  if (!info.isDirectory()) throw new HttpError(400, 'That path is a file, not a folder.');

  let entries;
  try {
    entries = await readdir(/* turbopackIgnore: true */ here, { withFileTypes: true });
  } catch {
    throw new HttpError(403, "The app isn't allowed to open that folder.");
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !SKIP.test(e.name))
    .map((e) => ({ name: e.name, path: join(/* turbopackIgnore: true */ here, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  const up = dirname(here);
  return {
    path: here,
    // At a drive / share / filesystem root there is no folder above: go back to the top level.
    parent: up !== here ? up : isWindows ? '' : null,
    folders: folders.slice(0, MAX_FOLDERS),
    truncated: folders.length > MAX_FOLDERS,
    suggestions,
  };
}
