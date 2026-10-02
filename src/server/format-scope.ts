import { FORMATS, type Format } from '@/lib/domain';
import { HttpError, type MutationContext } from '@/lib/api';
import { can } from '@/server/permissions';

/**
 * Shared `?format=` gate for every format-scoped read (dashboard + queues).
 *
 * - absent / empty → null (global scope, stays ungated as before);
 * - unknown value  → 400;
 * - caller's live grants lack `format:<x>` → 403;
 * - otherwise      → the validated Format.
 *
 * The caller passes its `handleQuery` context; routes that may be called without
 * a session (global scope) pass `null`, which is fine when the param is absent
 * but becomes 401 as soon as a format is requested.
 */
export function requireFormatScope(
  raw: string | null,
  ctx: MutationContext | null,
): Format | null {
  if (raw === null || raw === '') return null;

  if (!(FORMATS as readonly string[]).includes(raw)) {
    throw new HttpError(400, `Unknown format "${raw}".`);
  }
  const format = raw as Format;

  if (!ctx) throw new HttpError(401, 'Sign in to continue.');
  if (!can(ctx.grants, `format:${format}`)) {
    throw new HttpError(403, 'Your role does not allow this format.');
  }
  return format;
}
