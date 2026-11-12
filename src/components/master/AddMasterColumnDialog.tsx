'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, masterApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { LOT_SOURCES, type LotSource, type MasterColumnKind } from '@/lib/master-custom';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

/** "+ Column" of the Master Excel: a name, and either free text or a detail fetched from the lot. */
export function AddMasterColumnDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<MasterColumnKind>('text');
  const [source, setSource] = useState<LotSource>('ownerName');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => masterApi.updateColumns({ add: { label, kind, source: kind === 'lot' ? source : null } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.columns });
      void queryClient.invalidateQueries({ queryKey: queryKeys.master.all });
      toast.success('Column added', `“${label.trim()}” is at the right end of the sheet, for everyone.`);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not add the column.'),
  });

  const submit = () => {
    if (!label.trim()) {
      setError('Give the column a name.');
      return;
    }
    setError(null);
    add.mutate();
  };

  return (
    <Dialog title="Add a column" subtitle="Only in the Master Excel. Everyone sees it; lots' own sheets are not changed." onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormError message={error} />
        <Field label="Column name">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Owner phone" />
        </Field>
        <Field label="What goes in it">
          <Select value={kind} onChange={(e) => setKind(e.target.value as MasterColumnKind)} aria-label="Column type">
            <option value="text">Free text — I type it in each row</option>
            <option value="lot">From the lot — fetched automatically</option>
          </Select>
        </Field>
        {kind === 'lot' ? (
          <Field label="Which lot detail" hint="Taken from the details filled in at intake. It cannot be typed over.">
            <Select value={source} onChange={(e) => setSource(e.target.value as LotSource)} aria-label="Lot detail">
              {LOT_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <PrimaryButton type="submit" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add column'}
          </PrimaryButton>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
        </div>
      </form>
    </Dialog>
  );
}
