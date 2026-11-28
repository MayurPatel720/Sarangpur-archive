import { handleQuery } from '@/lib/api';
import { browseFolders } from '@/server/admin/storage-browse';
import { folderBrowseResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

/** GET /api/admin/storage/browse?path= — the folders inside a path on this server (names only), `settings:manage`. */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get('path') ?? '';
  return handleQuery(folderBrowseResponseSchema, () => browseFolders(path), { permission: 'settings:manage' });
}
