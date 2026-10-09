import { HttpError } from '@/lib/api';

/**
 * Cloudinary access shared by project photos and task-comment images. Bytes live in
 * Cloudinary (public delivery URLs); MongoDB holds metadata only. Lazy: the client is
 * configured on first use, never at import time, and a missing env answers 503.
 */

const MISSING_CONFIG_MESSAGE =
  "Photo storage isn't configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET";

/** Configures and returns the Cloudinary v2 client; 503 when env is absent. Lazy: never at import time. */
export async function cloudinaryClient() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) throw new HttpError(503, MISSING_CONFIG_MESSAGE);
  const { v2 } = await import('cloudinary');
  v2.config({ cloud_name, api_key, api_secret, secure: true });
  return v2;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Strips any path, keeps `[A-Za-z0-9_-]` in the stem, caps the length and fixes the extension. */
export function safeFileName(name: string, contentType: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').normalize('NFKD');
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const ext = EXT_BY_TYPE[contentType] ?? 'jpg';
  return `${(stem || 'photo').slice(0, 60)}.${ext}`;
}

export async function uploadImage(
  folder: string,
  file: File,
): Promise<{
  url: string;
  publicId: string;
  contentType: string;
  fileName: string;
  width: number | null;
  height: number | null;
  bytes: number;
}> {
  const cloudinary = await cloudinaryClient();
  const fileName = safeFileName(file.name, file.type);
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const res = await new Promise<{
      secure_url: string;
      public_id: string;
      width?: number;
      height?: number;
      bytes?: number;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          unique_filename: true,
          overwrite: false,
          use_filename: true,
          filename_override: fileName.replace(/\.[^.]+$/, ''),
        },
        (error, result) => (error || !result ? reject(error ?? new Error('Empty response')) : resolve(result)),
      );
      stream.end(buffer);
    });
    return {
      url: res.secure_url,
      publicId: res.public_id,
      contentType: file.type,
      fileName,
      width: res.width ?? null,
      height: res.height ?? null,
      bytes: res.bytes ?? file.size,
    };
  } catch (error) {
    console.error('[images] cloud upload failed:', error instanceof Error ? error.message : 'unknown error');
    throw new HttpError(502, 'Could not store the photo. Try again in a moment.');
  }
}

/** Best-effort asset removal: logged, never thrown (the document state is already settled). */
export async function destroyImage(publicId: string): Promise<void> {
  try {
    const cloudinary = await cloudinaryClient();
    await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' });
  } catch (error) {
    console.error('[images] cloud delete failed (orphaned asset):', publicId, error instanceof Error ? error.message : '');
  }
}
