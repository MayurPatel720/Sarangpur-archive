import { HttpError } from '@/lib/api';
import { can } from '@/server/permissions';

/**
 * The assignee rule. A lot that has an assignee, or is synced with a project, may
 * only be changed by its assignee or by someone holding `project:assign` (admin).
 * An unassigned project lot is admin-only until it is assigned. Plain standalone
 * lots are unrestricted — the route's role grant is the only gate for those.
 *
 * Assignment only RESTRICTS; it never grants. The route-level permission check
 * (e.g. `decision:record`) still has to pass first.
 */
export interface LotAccessFields {
  assignee?: unknown;
  assigneeName?: string | null;
  syncProjectId?: unknown;
}

export function isLotAdmin(grants: readonly string[]): boolean {
  return can(grants, 'project:assign');
}

export function lotIsRestricted(lot: LotAccessFields): boolean {
  return Boolean(lot.assignee) || Boolean(lot.syncProjectId);
}

export function canWorkLot(lot: LotAccessFields, actor: { id: string; grants: readonly string[] }): boolean {
  if (!lotIsRestricted(lot)) return true;
  if (isLotAdmin(actor.grants)) return true;
  return lot.assignee != null && String(lot.assignee) === actor.id;
}

export function assertCanWorkLot(
  lot: LotAccessFields,
  actor: { id: string; grants: readonly string[] },
): void {
  if (canWorkLot(lot, actor)) return;
  throw new HttpError(
    403,
    lot.assignee
      ? `This lot is assigned to ${lot.assigneeName ?? 'another member'}. Only the assignee or an admin can change it.`
      : 'This project lot has no assignee yet. Only an admin can change it until it is assigned.',
  );
}
