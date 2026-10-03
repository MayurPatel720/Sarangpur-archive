'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { LotDetailResponse } from '@/types/lot';

type DetailLot = LotDetailResponse['lot'];

/**
 * The assignee rule, client side (the server enforces it in `withAudit`): a lot with
 * an assignee, or synced with a project, can only be changed by its assignee or a
 * `project:assign` holder. Assignment restricts; the role's own grants still apply.
 */
export function useLotAccess(lot: DetailLot) {
  const me = useMe();
  const isAdmin = me.data ? me.data.grants.includes('project:assign') : false;
  const restricted = Boolean(lot.assignee) || Boolean(lot.syncProject);
  const isAssignee = Boolean(me.data && lot.assignee && lot.assignee.id === me.data.id);
  return { isAdmin, restricted, isAssignee, canWork: !restricted || isAdmin || isAssignee };
}

/** Project + assignee strip on the lot header: sync notice, owner, admin reassign. */
export function LotProjectBar({ lot }: { lot: DetailLot }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();
  const { isAdmin, restricted, canWork } = useLotAccess(lot);

  const reassign = useMutation({
    mutationFn: (assigneeId: string | null) => projectsApi.setAssignee(lot.id, assigneeId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success(res.assigneeName ? `Assigned to ${res.assigneeName}` : 'Assignee removed');
    },
    onError: (e) => toast.error('Could not change assignee', e instanceof ApiRequestError ? e.message : undefined),
  });

  if (!restricted) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-[8px] border border-line bg-surface-sunken px-3 py-2.5 text-[12.5px] text-ink-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          {lot.syncProject ? (
            <span>
              Part of project{' '}
              <Link href={`/projects/${lot.syncProject.id}`} className="font-semibold text-accent no-underline hover:underline">
                {lot.syncProject.code}
              </Link>
              . Origin, owner, contacts, condition and rights are shared — a change here applies to all{' '}
              {lot.syncProject.siblingCount} {lot.syncProject.siblingCount === 1 ? 'lot' : 'lots'}.
            </span>
          ) : null}
          <span>
            Assigned to <span className="font-semibold text-ink">{lot.assignee ? lot.assignee.name : 'no one yet'}</span>
            {lot.assignee ? ' — only they and admins can change this lot.' : ' — only admins can change this lot until it is assigned.'}
          </span>
        </div>
        {isAdmin ? (
          <div className="sm:ml-auto sm:w-[220px] flex-shrink-0">
            <Select
              value={lot.assignee?.id ?? ''}
              disabled={reassign.isPending}
              onChange={(e) => reassign.mutate(e.target.value || null)}
              aria-label="Reassign this lot"
            >
              <option value="">Unassigned (admin only)</option>
              {(users.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      {!canWork ? (
        <p role="note" className="m-0 text-[12px] text-ink-3">
          You can view this lot, but only {lot.assignee ? lot.assignee.name : 'an admin'} can change it.
        </p>
      ) : null}
    </div>
  );
}
