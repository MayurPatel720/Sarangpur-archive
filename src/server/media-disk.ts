import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { HttpError } from '@/lib/api';
import { getStorageConfig } from '@/server/storage-config';

/**
 * "Own server" photo storage (driver `disk`). Bytes live in a folder on the server; MongoDB keeps only metadata. A photo is
 * addressed by its key (`<folder>/<name>.<ext>`, stored as `publicId`) and served by the login-checked route /api/media/<key>,
 * which also makes resized copies (thumb / medium / large) on first request and caches them under <root>/.cache.
 *
 * Which driver and which folder are chosen in Admin → Settings → Photo storage (see storage-config.ts) and can change while
 * the app runs. Earlier folders are kept as fallbacks, so photos saved before a folder change are still found.
 */

export const MEDIA_URL_PREFIX = '/api/media/';
const CACHE_DIR = '.cache';

/** The driver in force right now. */
export async function storageDriver(): Promise<'disk' | 'cloudinary'> {
  return (await getStorageConfig()).driver;
}

/** The folder new photos are written to; 503 when the disk driver has none. */
async function currentRoot(): Promise<string> {
  const { root } = await getStorageConfig();
  if (!root) throw new HttpError(503, "Photo storage isn't configured: choose the photo folder in Admin → Settings → Photo storage");
  return resolve(root);
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};
export const contentTypeOfKey = (key: string): string | null => CONTENT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? null;

/** A photo saved on our own server has a key that ends in an image extension; a Cloudinary id never does. */
export const isDiskKey = (publicId: string): boolean => /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(publicId);

/**
 * Turns a key from a URL into an absolute path INSIDE `root`, or null. Rejects anything that could leave the folder
 * (.., backslashes, drive letters, empty parts) and the cache folder, so a crafted URL can never read another file.
 */
export function resolveKey(key: string, root: string): string | null {
  if (!key || key.includes('\\') || key.includes('\0') || /^[a-zA-Z]:/.test(key)) return null;
  const parts = key.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p === CACHE_DIR)) return null;
  const base = resolve(root);
  const full = resolve(base, ...parts);
  return full.startsWith(base + sep) ? full : null;
}

const SIZES = {
  thumb: { width: 400, height: 400, fit: 'cover' },
  medium: { width: 340, height: 340, fit: 'cover' },
  large: { width: 1600, height: 1600, fit: 'inside' },
} as const;
export type MediaSize = keyof typeof SIZES;
export const isMediaSize = (s: string | null): s is MediaSize => s !== null && s in SIZES;

/** Saves one photo under `folder` and returns the same shape as the Cloudinary upload. */
export async function diskUpload(
  folder: string,
  file: File,
  fileName: string,
): Promise<{ url: string; publicId: string; contentType: string; fileName: string; width: number | null; height: number | null; bytes: number }> {
  const root = await currentRoot();
  const ext = fileName.split('.').pop() ?? 'jpg';
  const stem = fileName.replace(/\.[^.]+$/, '');
  const key = `${folder}/${stem}_${randomBytes(8).toString('hex')}.${ext}`;
  const target = resolveKey(key, root);
  if (!target) throw new HttpError(400, 'That photo folder is not allowed.');
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
  } catch (error) {
    console.error('[images] disk write failed:', error instanceof Error ? error.message : 'unknown error');
    throw new HttpError(502, 'Could not store the photo. Try again in a moment.');
  }
  let width: number | null = null;
  let height: number | null = null;
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    /* not decodable here (e.g. HEIC): the browser-measured size, if any, is used by the caller */
  }
  return { url: `${MEDIA_URL_PREFIX}${key}`, publicId: key, contentType: file.type, fileName, width, height, bytes: buffer.length };
}

/** Best-effort removal (logged, never thrown), like Cloudinary's destroy: from every known folder, plus cached resized copies. */
export async function diskDestroy(key: string): Promise<void> {
  try {
    const cfg = await getStorageConfig();
    const roots = [cfg.root, ...cfg.legacyRoots].filter(Boolean);
    for (const root of roots) {
      const original = resolveKey(key, root);
      if (original) await rm(original, { force: true });
      await Promise.all(
        (Object.keys(SIZES) as MediaSize[]).map((s) => rm(resolve(root, CACHE_DIR, s, `${key}.jpg`), { force: true })),
      );
    }
  } catch (error) {
    console.error('[images] disk delete failed (orphaned file):', key, error instanceof Error ? error.message : '');
  }
}

/** The bytes to send for a key: the original, or a resized JPEG (made once, then cached). Null when the photo does not exist. */
export async function readMedia(key: string, size: MediaSize | null): Promise<{ bytes: Buffer; contentType: string } | null> {
  const originalType = contentTypeOfKey(key);
  if (!originalType) return null;
  const cfg = await getStorageConfig();
  // Newest folder first, then the earlier ones, so photos saved before a folder change still show.
  let original: string | null = null;
  let foundIn = '';
  for (const root of [cfg.root, ...cfg.legacyRoots].filter(Boolean)) {
    const candidate = resolveKey(key, root);
    if (!candidate) continue;
    try {
      await stat(/* turbopackIgnore: true */ candidate);
      original = candidate;
      foundIn = root;
      break;
    } catch {
      /* not in this folder */
    }
  }
  if (!original) return null;
  if (!size) return { bytes: await readFile(/* turbopackIgnore: true */ original), contentType: originalType };

  const cached = resolve(foundIn, CACHE_DIR, size, `${key}.jpg`);
  try {
    return { bytes: await readFile(/* turbopackIgnore: true */ cached), contentType: 'image/jpeg' };
  } catch {
    /* not made yet */
  }
  try {
    const { default: sharp } = await import('sharp');
    const s = SIZES[size];
    const out = await sharp(await readFile(/* turbopackIgnore: true */ original))
      .rotate() // honour the camera's orientation
      .resize({ width: s.width, height: s.height, fit: s.fit, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    await mkdir(dirname(cached), { recursive: true }).catch(() => undefined);
    await writeFile(cached, out).catch(() => undefined); // a cache that cannot be written only costs speed
    return { bytes: out, contentType: 'image/jpeg' };
  } catch {
    // Cannot be resized (e.g. HEIC without a decoder): send the original rather than nothing.
    return { bytes: await readFile(/* turbopackIgnore: true */ original), contentType: originalType };
  }
}

/* ------------------------------------------------------------ folder check (Settings screen) */

export interface FolderCheck {
  ok: boolean;
  message: string;
  /** Free space on the folder's drive, in GB, when the system can tell. */
  freeGb: number | null;
}

/** Can the app save photos in this folder? Writes, reads back and deletes a small test file. Never throws. */
export async function checkPhotoFolder(path: string): Promise<FolderCheck> {
  const p = path.trim();
  if (!p) return { ok: false, message: 'Choose a folder first.', freeGb: null };
  if (!isAbsolute(p)) return { ok: false, message: 'Use a full path, like D:\\photos or \\\\server\\share\\photos.', freeGb: null };
  const root = resolve(p);
  try {
    const info = await stat(/* turbopackIgnore: true */ root);
    if (!info.isDirectory()) return { ok: false, message: 'That path is a file, not a folder.', freeGb: null };
  } catch {
    return { ok: false, message: "That folder doesn't exist or this server can't reach it.", freeGb: null };
  }
  const probe = resolve(root, `.write-test-${randomBytes(6).toString('hex')}`);
  try {
    await writeFile(/* turbopackIgnore: true */ probe, 'ok');
    const back = await readFile(/* turbopackIgnore: true */ probe, 'utf8');
    await rm(/* turbopackIgnore: true */ probe, { force: true });
    if (back !== 'ok') return { ok: false, message: 'The folder did not return what was written to it.', freeGb: null };
  } catch (error) {
    await rm(/* turbopackIgnore: true */ probe, { force: true }).catch(() => undefined);
    const code = (error as NodeJS.ErrnoException).code;
    return {
      ok: false,
      message: code === 'EACCES' || code === 'EPERM' ? 'The app has no permission to write in that folder.' : 'The app could not write a test file in that folder.',
      freeGb: null,
    };
  }
  let freeGb: number | null = null;
  try {
    const fs = await statfs(/* turbopackIgnore: true */ root);
    freeGb = Math.round((fs.bavail * fs.bsize) / 1024 ** 3);
  } catch {
    /* free space unknown on this system */
  }
  return { ok: true, message: freeGb === null ? 'The app can save photos in this folder.' : `The app can save photos in this folder. ${freeGb} GB free.`, freeGb };
}
