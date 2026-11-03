/**
 * File and folder paths typed, pasted or dropped into a "File path" cell.
 *
 * A browser never tells a web page where a dropped file or folder lives, only its name. So a drop
 * gives a full path only when it carries one as text (a path, a `file://` link); otherwise the name is
 * added to a base folder the person set once ("Set path for all" remembers it on this device).
 *
 * Inside the Archive Tracker desktop app (the `desktop` folder) this limit does not exist: its preload
 * exposes `window.archiveDesktop.pathForFile`, which returns the real full path of a dropped file or folder.
 */

declare global {
  interface Window {
    /** Present only inside the desktop app. */
    archiveDesktop?: { isDesktop: true; pathForFile: (file: File) => string };
  }
}

/** True inside the Archive Tracker desktop app, where a dropped file or folder gives its full path. */
export const isDesktopApp = () => typeof window !== 'undefined' && Boolean(window.archiveDesktop?.isDesktop);

const BASE_KEY = 'archive-tracker.path-base-folder';

/** `file:///E:/Scans/2026` → `E:\Scans\2026`; `"E:\Scans\x"` (Windows "Copy as path") → `E:\Scans\x`. */
export function cleanPath(raw: string): string {
  let s = raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (/^file:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const p = decodeURIComponent(url.pathname);
      s = url.host ? `\\\\${url.host}${p.replace(/\//g, '\\')}` : /^\/[A-Za-z]:/.test(p) ? p.slice(1).replace(/\//g, '\\') : p;
    } catch {
      /* keep what was typed */
    }
  }
  // No trailing slash, except on a bare drive (E:\).
  const trimmed = s.replace(/[\\/]+$/, '');
  return /^[A-Za-z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed || s;
}

/** Windows-style paths use backslashes, anything else slashes. */
const separatorOf = (p: string) => (/^[A-Za-z]:|^\\\\|\\/.test(p) ? '\\' : '/');

export function joinPath(parent: string, child: string): string {
  const base = cleanPath(parent);
  if (!base) return child;
  if (!child) return base;
  const sep = separatorOf(base);
  return `${base.replace(/[\\/]+$/, '')}${sep}${child.replace(/^[\\/]+/, '')}`;
}

export function loadBaseFolder(): string {
  try {
    return window.localStorage.getItem(BASE_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveBaseFolder(path: string): void {
  try {
    if (path) window.localStorage.setItem(BASE_KEY, path);
    else window.localStorage.removeItem(BASE_KEY);
  } catch {
    /* storage unavailable: the folder is just not remembered */
  }
}

/** The folder a path sits in: `E:\Scans\2026` → `E:\Scans`; '' for a bare drive or a single name. */
export function parentOf(path: string): string {
  const p = cleanPath(path);
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (i <= 0) return '';
  const parent = p.slice(0, i);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/**
 * What a person typed after a drop that only gave a name. A path ending in that name is the item itself
 * (its parent becomes the base folder); anything else is taken as the folder it sits in.
 */
export function resolveDropped(name: string, typed: string): { path: string; base: string } | null {
  const p = cleanPath(typed);
  if (!p) return null;
  const last = p.split(/[\\/]/).filter(Boolean).pop() ?? '';
  if (last.toLowerCase() === name.toLowerCase() && p.length > name.length) return { path: p, base: parentOf(p) };
  return { path: joinPath(p, name), base: p };
}

export interface DroppedPath {
  /** A full path, when the drop carried one (text, a link) or a base folder was available. */
  path: string | null;
  /** The file or folder name the browser gave. */
  name: string | null;
}

/** Reads what was dropped: text first (it may be a full path), then the dropped file / folder name. */
export function readDrop(dt: DataTransfer, baseFolder = ''): DroppedPath {
  // Desktop app: the real location of the first dropped file or folder, no questions asked.
  const file = dt.files?.[0];
  const real = file && typeof window !== 'undefined' ? window.archiveDesktop?.pathForFile(file) : '';
  if (real) return { path: cleanPath(real), name: file!.name };
  const text = dt.getData('text/uri-list') || dt.getData('text/plain');
  const fromText = cleanPath(text);
  if (fromText) return { path: fromText, name: null };
  const first = dt.items?.[0];
  const entry = first && 'webkitGetAsEntry' in first ? first.webkitGetAsEntry() : null;
  const name = entry?.name ?? dt.files?.[0]?.name ?? null;
  if (!name) return { path: null, name: null };
  return { path: baseFolder ? joinPath(baseFolder, name) : null, name };
}
