import { handleMutation, handleQuery } from '@/lib/api';
import { listReferenceLists } from '@/server/admin/queries';
import { createReferenceList } from '@/server/admin/mutations';
import {
  listCreateBodySchema,
  listResponseSchema,
  listsResponseSchema,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleQuery(listsResponseSchema, async () => ({ lists: await listReferenceLists() }), {
    permission: 'lists:manage',
  });
}

export async function POST(req: Request) {
  return handleMutation(req, listCreateBodySchema, listResponseSchema, {
    permission: 'lists:manage',
    // handleMutation types the body as the schema INPUT (defaults optional);
    // normalize here so createReferenceList receives the resolved output shape.
    run: async (body, ctx) => ({
      list: await createReferenceList(
        { key: body.key, label: body.label, group: body.group ?? 'Custom', metaSchema: body.metaSchema ?? [] },
        ctx,
      ),
    }),
  });
}
