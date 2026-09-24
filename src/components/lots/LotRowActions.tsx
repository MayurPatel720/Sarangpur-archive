'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { prettyEnum } from '@/lib/format';
import type { LotRow } from '@/types/lot';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/hooks/useCan';
import { useReferenceList } from '@/hooks/useReferenceList';

/**
 * Circular edit + discard actions for lot list rows. Edit opens the lot detail;
 * discard fetches the current version then confirms with a premium dialog.
 */
export function LotRowActions({ row }: { row: LotRow }) {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const discardReasons = useReferenceList('discardReason');
  const stages = useReferenceList('stage');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canDiscard =
    (me.data?.grants.includes('discard:confirm') ?? false) &&
    (stages.data?.items ?? []).some((i) => i.value === row.stage && i.meta.discardable === true);

  const discard = useMutation({
    mutationFn: async () => {
      const detail = await lotsApi.detail(row.id);
      return lotsApi.confirmDiscard(row.id, {
        confirm: true,
        reason: reason || (discardReasons.data?.items[0]?.value ?? ''),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        version: detail.lot.version,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setNotes('');
      setError(null);
      toast.success('Lot discarded', `${row.lotReference} moved to Discarded.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
    onError: (e) => {
      setError(e instanceof ApiRequestError ? e.message : 'Could not discard lot.');
      toast.error('Couldn’t discard lot', e instanceof ApiRequestError ? e.message : undefined);
    },
  });

  return (
    <>
      <IconButton
        label={`Edit ${row.lotReference}`}
        icon="edit"
        onClick={() => router.push(`/register/${row.id}`)}
      />
      {canDiscard ? (
        <IconButton
          label={`Discard ${row.lotReference}`}
          icon="trash"
          variant="danger"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        />
      ) : null}

      {open ? (
        <ConfirmDialog
          title="Discard lot?"
          meta={
            <>
              <span className="font-medium text-ink-2">{row.lotReference}</span>
              {' · '}
              {row.ownerName}
              {' · '}
              {row.format}
            </>
          }
          body={
            <>
              This moves the lot to <strong>Discarded</strong>. An admin can reverse it later
              from the lot record. History is kept in the activity log.
            </>
          }
          confirmLabel="Discard lot"
          pending={discard.isPending}
          error={error}
          onConfirm={() => discard.mutate()}
          onClose={() => {
            if (!discard.isPending) {
              setOpen(false);
              setError(null);
            }
          }}
        >
          <Field label="Reason">
            <Select
              value={reason || (discardReasons.data?.items[0]?.value ?? '')}
              onChange={(e) => setReason(e.target.value)}
            >
              {(discardReasons.data?.items ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              maxLength={2000}
            />
          </Field>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
