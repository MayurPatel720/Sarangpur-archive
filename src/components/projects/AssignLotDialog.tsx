'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi, projectsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/useCan';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { useUserPicker } from '@/hooks/useUserPicker';
import { ErrorState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';

/**
 * Admin-only: search the lot register and attach a lot to this project. The
 * project's shared details overwrite the lot's (blanks on the project are filled
 * from the lot), and the lot starts syncing. Pick an assignee — a synced lot with
 * no assignee is admin-only. The server call is idempotent.
 */
export function AssignLotDialog({
  projectId,
  projectCode,
  onClose,
}: {
  projectId: string;
  projectCode: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const users = useUserPicker();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const results = useQuery({
    queryKey: ['lots', 'assign-search', debounced],
    queryFn: () => lotsApi.list({ q: debounced, page: '1', pageSize: '10' }),
    enabled: !!me.data && debounced.length > 0,
  });

  const assign = useMutation({
    mutationFn: (lot: { id: string; lotReference: string }) => projectsApi.assignLot(projectId, lot.id, assigneeId || undefined),
    onSuccess: (_data, lot) => {
      setAddedIds((prev) => [...prev, lot.id]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lot.id) });
      toast.success('Lot added to project', `${lot.lotReference} → ${projectCode}`);
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not add the lot.';
      setError(message);
    },
  });

  return (
    <Dialog title={`Add lots to ${projectCode}`} subtitle="Search the register, then add." onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Field label="Search lots">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Owner, lot ref, place…"
            aria-label="Search lots to add"
          />
        </Field>
        <Field label="Assign to" hint="Owns the lot end to end. The project's details replace the lot's own.">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assignee for added lots">
            <option value="">Keep current / unassigned</option>
            {(users.data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        {results.isError ? (
          <ErrorState message="Couldn't search lots." onRetry={() => results.refetch()} />
        ) : null}
        {(results.data?.rows ?? []).length > 0 ? (
          <ul className="m-0 flex flex-col gap-1.5 p-0 list-none">
            {results.data?.rows.map((r) => {
              const added = addedIds.includes(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-2"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-[12.5px] font-semibold text-ink">{r.lotReference}</span>
                    <span className="truncate text-[11.5px] text-ink-3">
                      {r.ownerName || 'No owner yet'} · {r.format} · {r.stage}
                    </span>
                  </span>
                  <span className="ml-auto flex-shrink-0">
                    {added ? (
                      <span className="text-[12px] font-semibold text-good-mark">Added ✓</span>
                    ) : (
                      <PrimaryButton onClick={() => assign.mutate({ id: r.id, lotReference: r.lotReference })} disabled={assign.isPending}>
                        Add
                      </PrimaryButton>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : debounced && !results.isLoading ? (
          <p className="m-0 text-[12.5px] text-ink-3">No lots match this search.</p>
        ) : null}
        <FormError message={error} />
        <div className="flex justify-end">
          <GhostButton type="button" onClick={onClose}>
            Done
          </GhostButton>
        </div>
      </div>
    </Dialog>
  );
}
