'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Dialog } from '@/components/ui/Dialog';
import {
  Checkbox,
  Field,
  FormError,
  GhostButton,
  PrimaryButton,
  Select,
  TextInput,
} from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { ItemCreateInput } from '@/types/project';

/**
 * Manual single-item entry. The server numbers the item (GG-II style, continuing
 * the intake 36-per-group convention); an explicit group starts a new group.
 */
export function AddItemDialog({ lotId, onClose }: { lotId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reasons = useReferenceList('notDigitizedReason');
  const [groupNo, setGroupNo] = useState('');
  const [selected, setSelected] = useState(true);
  const [reason, setReason] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const body: ItemCreateInput = {
        selectedForDigitization: selected,
      };
      const g = groupNo.trim();
      if (g) body.groupNo = Number.parseInt(g, 10);
      if (!selected && reason) body.notDigitizedReason = reason;
      if (fileName.trim()) body.fileName = fileName.trim();
      return lotsApi.createItem(lotId, body);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.lots.all, 'items', lotId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      toast.success('Item added', data.code);
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not add the item.';
      setError(message);
      toast.error('Could not add item', message);
    },
  });

  const groupInvalid = groupNo.trim() !== '' && !/^\d+$/.test(groupNo.trim());
  const canSubmit = !create.isPending && !groupInvalid && (selected || reason !== '');

  return (
    <Dialog title="Add item" subtitle="Numbered automatically in intake order." onClose={onClose}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <Field label="Group" hint="Leave blank to append to the last group.">
          <TextInput
            value={groupNo}
            onChange={(e) => setGroupNo(e.target.value)}
            placeholder="e.g. 3"
            inputMode="numeric"
            aria-label="Group number (optional)"
          />
        </Field>
        <Checkbox
          label="Selected for digitization"
          checked={selected}
          onChange={(e) => setSelected(e.target.checked)}
        />
        {!selected ? (
          <Field label="Reason" required hint="Required when the item is not selected.">
            <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Not-selected reason">
              <option value="">Choose a reason…</option>
              {(reasons.data?.items ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="File name" hint="Optional — usually filled at scan time.">
          <TextInput
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="IMG_0042.jpg"
            maxLength={180}
            aria-label="File name (optional)"
          />
        </Field>
        <FormError message={groupInvalid ? 'Group must be a positive number.' : error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Adding…' : 'Add item'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
