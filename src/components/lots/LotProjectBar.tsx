'use client';

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

/** Assignee dropdown for the lot header, next to Edit. Admins only, and only on lots that belong to a project or have an assignee. */
export function LotAssigneeSelect({ lot }: { lot: DetailLot }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const users = useUserPicker();
  const { isAdmin, restricted } = useLotAccess(lot);

  const reassign = useMutation({
    mutationFn: (assigneeId: string | null) => projectsApi.setAssignee(lot.id, assigneeId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success(res.assigneeName ? `Assigned to ${res.assigneeName}` : 'Assignee removed');
    },
    onError: (e) => toast.error('Could not change assignee', e instanceof ApiRequestError ? e.message : undefined),
  });

  if (!restricted || !isAdmin) return null;
  return (
    <div className="w-[200px] flex-shrink-0">
      <Select
        value={lot.assignee?.id ?? ''}
        disabled={reassign.isPending}
        onChange={(e) => reassign.mutate(e.target.value || null)}
        aria-label="Reassign this lot"
        className="h-10"
      >
        <option value="">Unassigned (admin only)</option>
        {(users.data?.users ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** A short note when the lot is read-only for you. Nothing else is shown on the page for the assignee any more. */
export function LotProjectBar({ lot }: { lot: DetailLot }) {
  const { restricted, canWork } = useLotAccess(lot);
  if (!restricted || canWork) return null;
  return (
    <p role="note" className="m-0 text-[12px] text-ink-3">
      You can view this lot, but only {lot.assignee ? lot.assignee.name : 'an admin'} can change it.
    </p>
  );
}
