import { z } from 'zod';
import { FORMATS } from '@/lib/domain';

/**
 * Project photo contracts. Photos of the physical items belong to a PROJECT (not a
 * lot) and live in Cloudinary; the database holds metadata only.
 */

/** Client-side cap on the original file before it is resized. */
export const PHOTO_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
/** Server-side cap on the uploaded (already resized) file — keeps the POST under Vercel's 4.5 MB body limit. */
export const PHOTO_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** The resize step aims for this ceiling. */
export const PHOTO_TARGET_BYTES = 3.5 * 1024 * 1024;
export const PHOTO_MAX_DIMENSION = 1600;
export const PHOTO_MAX_CAPTION = 300;

export const projectImageFormatSchema = z.enum(FORMATS);

export const projectImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  caption: z.string(),
  format: projectImageFormatSchema.nullable(),
  uploadedById: z.string(),
  uploadedByName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectImage = z.infer<typeof projectImageSchema>;

export const projectImagesResponseSchema = z.object({
  images: z.array(projectImageSchema),
  can: z.object({ manage: z.boolean() }),
});
export type ProjectImagesResponse = z.infer<typeof projectImagesResponseSchema>;

export const projectImageResponseSchema = z.object({ image: projectImageSchema });
export type ProjectImageResponse = z.infer<typeof projectImageResponseSchema>;

export const projectImagePatchBodySchema = z
  .object({
    caption: z.string().trim().max(PHOTO_MAX_CAPTION).optional(),
    format: projectImageFormatSchema.nullable().optional(),
  })
  .refine((b) => b.caption !== undefined || b.format !== undefined, {
    message: 'Nothing to update.',
  });
export type ProjectImagePatchBody = z.infer<typeof projectImagePatchBodySchema>;

export const projectImageDeleteResponseSchema = z.object({ ok: z.literal(true) });
