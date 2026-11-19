import type { MutationContext } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { UserLayout } from '@/models/UserLayout';
import type { LayoutResponse, LayoutSaveBody } from '@/types/layout';

/** The caller's saved layout of one sheet (null when they never saved one). */
export async function getLayout(scope: string, ctx: MutationContext): Promise<LayoutResponse> {
  await connectToDatabase();
  const doc = await UserLayout.findOne({ user: ctx.userId, scope }).lean();
  return { layout: (doc?.data as Record<string, unknown> | undefined) ?? null };
}

/** Saves (or, with `layout: null`, forgets) the caller's layout of one sheet. Always their own. */
export async function saveLayout(body: LayoutSaveBody, ctx: MutationContext): Promise<LayoutResponse> {
  await connectToDatabase();
  if (body.layout === null) {
    await UserLayout.deleteOne({ user: ctx.userId, scope: body.scope });
    return { layout: null };
  }
  await UserLayout.updateOne({ user: ctx.userId, scope: body.scope }, { $set: { data: body.layout } }, { upsert: true });
  return { layout: body.layout };
}
