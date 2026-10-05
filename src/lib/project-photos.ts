import {
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_ORIGINAL_BYTES,
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_TARGET_BYTES,
} from '@/types/project-image';

/**
 * Browser-side photo preparation. Phone photos are 4-12 MB; Vercel functions accept a
 * 4.5 MB request body, so every photo is shrunk to <= 1600 px on its long side and
 * re-encoded as JPEG before it is uploaded. Pure helpers are exported for checks.
 */

/** Scale (w, h) down so the longer side is at most `max`; never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Returns a user-facing problem with the chosen file, or null when it is acceptable. */
export function checkPhotoFile(file: File): string | null {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    return `${file.name} is not an image.`;
  }
  if (file.size > PHOTO_MAX_ORIGINAL_BYTES) {
    return `${file.name} is larger than 15 MB.`;
  }
  return null;
}

export interface PreparedPhoto {
  file: File;
  width: number | null;
  height: number | null;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Resize + re-encode. Falls back to the original file when it cannot be decoded
 * (e.g. HEIC outside Safari) and is already small enough to upload as-is.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const problem = checkPhotoFile(file);
  if (problem) throw new Error(problem);

  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    if (file.size <= PHOTO_MAX_UPLOAD_BYTES && file.type.startsWith('image/')) {
      return { file, width: null, height: null };
    }
    throw new Error(`${file.name} could not be read. Try a JPEG or PNG version.`);
  }

  try {
    let { width, height } = fitWithin(decoded.width, decoded.height, PHOTO_MAX_DIMENSION);
    let quality = 0.82;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext('2d');
      if (!g) break;
      g.fillStyle = 'white'; // flatten transparency (PNG / WebP) before JPEG
      g.fillRect(0, 0, width, height);
      g.drawImage(decoded.source, 0, 0, width, height);
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= PHOTO_TARGET_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
        return { file: new File([blob], `${name}.jpg`, { type: 'image/jpeg' }), width, height };
      }
      quality = Math.max(0.5, quality - 0.12);
      width = Math.max(1, Math.round(width * 0.85));
      height = Math.max(1, Math.round(height * 0.85));
    }
  } finally {
    decoded.release();
  }

  if (file.size <= PHOTO_TARGET_BYTES && file.type.startsWith('image/')) {
    return { file, width: null, height: null };
  }
  throw new Error(`${file.name} could not be shrunk enough to upload.`);
}

/** Builds the multipart body for upload / replace. */
export function buildPhotoForm(
  prepared: PreparedPhoto,
  opts: { caption?: string; format?: string | null } = {},
): FormData {
  const form = new FormData();
  form.set('file', prepared.file);
  if (opts.caption) form.set('caption', opts.caption);
  if (opts.format) form.set('format', opts.format);
  if (prepared.width) form.set('width', String(prepared.width));
  if (prepared.height) form.set('height', String(prepared.height));
  return form;
}

/**
 * Cloudinary delivery transform: inserts `transform` after `/upload/` of a secure_url.
 * Non-Cloudinary URLs are returned untouched.
 */
export function withTransform(url: string, transform: string): string {
  return url.includes('/upload/') ? url.replace('/upload/', `/upload/${transform}/`) : url;
}
export const photoThumbUrl = (url: string) => withTransform(url, 'c_fill,w_400,h_400,q_auto,f_auto');
export const photoLargeUrl = (url: string) => withTransform(url, 'c_limit,w_1600,q_auto,f_auto');
