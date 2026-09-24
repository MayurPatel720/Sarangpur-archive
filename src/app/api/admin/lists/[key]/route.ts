import { z } from 'zod';
import { handleMutation } from '@/lib/api';
import { deleteReferenceList, patchReferenceList } from '@/server/admin/mutations';
import {
  listDeleteResponseSchema,
  listPatchBodySchema,
  listResponseSchema,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return handleMutation(req, listPatchBodySchema, listResponseSchema, {
    permission: 'lists:manage',
    // handleMutation types the body as the schema INPUT (meta optional);
    // normalize here so patchReferenceList receives the resolved output shape.
    run: async (body, ctx) => ({
      list: await patchReferenceList(
        key,
        {
          expectedRevision: body.expectedRevision,
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.group !== undefined ? { group: body.group } : {}),
          ...(body.metaSchema !== undefined ? { metaSchema: body.metaSchema } : {}),
          ...(body.items !== undefined
            ? { items: body.items.map((i) => ({ ...i, meta: i.meta ?? {} })) }
            : {}),
        },
        ctx,
      ),
    }),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return handleMutation(req, z.object({}), listDeleteResponseSchema, {
    permission: 'lists:manage',
    run: async () => deleteReferenceList(key),
  });
}
