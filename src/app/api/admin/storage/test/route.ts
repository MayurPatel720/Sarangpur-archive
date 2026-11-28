import { handleMutation } from '@/lib/api';
import { checkPhotoFolder } from '@/server/media-disk';
import { folderTestBodySchema, folderTestResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

/** POST /api/admin/storage/test { path } — can the app save photos in this folder? (writes and removes a small test file) */
export async function POST(req: Request) {
  return handleMutation(req, folderTestBodySchema, folderTestResponseSchema, {
    permission: 'settings:manage',
    run: (body) => checkPhotoFolder(body.path),
  });
}
