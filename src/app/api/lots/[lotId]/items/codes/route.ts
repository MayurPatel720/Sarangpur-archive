import { handleMutation, handleQuery, parseQueryParams } from '@/lib/api';
import { codeInfoQuerySchema, codeInfoResponseSchema, sheetCodeBodySchema, sheetCodeResponseSchema } from '@/types/items';
import { codeInfo, recodeSheet } from '@/server/lots/item-codes';

export const dynamic = 'force-dynamic';

/** GET /api/lots/[lotId]/items/codes?abbr1&abbr2 — the next free number for an abbreviation pair, `lot:view`. */
export async function GET(req: Request) {
  return handleQuery(
    codeInfoResponseSchema,
    () => {
      const q = parseQueryParams(codeInfoQuerySchema, req);
      return codeInfo(q.abbr1, q.abbr2);
    },
    { permission: 'lot:view' },
  );
}

/**
 * PATCH /api/lots/[lotId]/items/codes — set one sheet's two abbreviations and first
 * number (the rest continue), `lot:edit`. The assignee rule applies (withAudit).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  return handleMutation(req, sheetCodeBodySchema, sheetCodeResponseSchema, {
    permission: 'lot:edit',
    run: (body, ctx) => recodeSheet(lotId, body, ctx),
  });
}
