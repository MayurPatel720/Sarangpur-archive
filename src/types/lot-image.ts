import { z } from 'zod';
import { projectImageSchema } from './project-image';

/**
 * Lot photo contracts — photos of a lot's physical items, in Cloudinary (metadata only in the
 * database). Same limits and shape as project photos (see ./project-image), without the format tag.
 */
export const lotImageSchema = projectImageSchema.omit({ format: true });
export type LotImage = z.infer<typeof lotImageSchema>;

export const lotImagesResponseSchema = z.object({
  images: z.array(lotImageSchema),
  can: z.object({ manage: z.boolean() }),
});
export type LotImagesResponse = z.infer<typeof lotImagesResponseSchema>;

export const lotImageResponseSchema = z.object({ image: lotImageSchema });
export type LotImageResponse = z.infer<typeof lotImageResponseSchema>;

export const lotImageDeleteResponseSchema = z.object({ ok: z.literal(true) });

/** Photos of ONE item (Prasadi): up to ITEM_PHOTO_MAX, the first is the cover. */
export const ITEM_PHOTO_MAX = 5;
export const itemImageSchema = lotImageSchema.extend({ isCover: z.boolean() });
export type ItemImage = z.infer<typeof itemImageSchema>;
export const itemImagesResponseSchema = z.object({
  images: z.array(itemImageSchema),
  can: z.object({ manage: z.boolean() }),
});
export type ItemImagesResponse = z.infer<typeof itemImagesResponseSchema>;
export const itemImageResponseSchema = z.object({ image: itemImageSchema });
export type ItemImageResponse = z.infer<typeof itemImageResponseSchema>;
/** PATCH …/images/[imageId] — make it the item's cover. */
export const itemImagePatchBodySchema = z.object({ cover: z.literal(true) });
