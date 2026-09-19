import { HttpError, handleQuery } from '@/lib/api';
import { getActiveReferenceItems, getReferenceListMeta } from '@/server/reference';
import { referenceLookupResponseSchema } from '@/types/admin';

export const dynamic = 'force-dynamic';

/**
 * Active vocabulary items for form dropdowns. Any signed-in user may read —
 * intake and record screens need these words, only `lists:manage` may change them.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return handleQuery(
    referenceLookupResponseSchema,
    async () => {
      const [meta, items] = await Promise.all([
        getReferenceListMeta(key),
        getActiveReferenceItems(key),
      ]);
      if (!meta) throw new HttpError(404, `Reference list '${key}' not found.`);
      return {
        key: meta.key,
        label: meta.label,
        items: items.map((i) => ({
          value: i.value,
          label: i.label,
          sortOrder: i.sortOrder,
          meta: i.meta,
        })),
      };
    },
    { session: true },
  );
}
