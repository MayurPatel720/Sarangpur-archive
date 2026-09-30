'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse, LotPatchBody } from '@/types/lot';
import { Field, FormError, PrimaryButton, TextInput } from '@/components/ui/Form';
import { Badge, Definition, EmptyValue, Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

/**
 * Storage location, captured after Discard at the foot of the workflow tab.
 * The intake-time `digitalFilePath` is often unknown until the lot has been
 * handled, so the file path + physical/container labels can be recorded here
 * via the lot PATCH endpoint (same fields the edit form writes).
 */
export function FilePathSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const grants = me.data ? me.data.grants : [];
  const canEdit = grants.includes('lot:edit');

  const [filePath, setFilePath] = useState(lot.digitalFilePath ?? '');
  const [physicalLabel, setPhysicalLabel] = useState(lot.physicalLabelApplied);
  const [containerLabel, setContainerLabel] = useState(lot.containerLabelApplied);
  const [error, setError] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => {
      const body: LotPatchBody = {
        version: lot.version,
        digitalFilePath: filePath.trim() ? filePath.trim() : null,
        physicalLabelApplied: physicalLabel,
        containerLabelApplied: containerLabel,
      };
      return lotsApi.patch(lot.id, body);
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not save the file path.'),
  });

  return (
    <Panel>
      <PanelHeader title="Storage location" />
      <div className="px-4 md:px-5 py-3.5 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-3.5">
          <div className="md:col-span-2">
            <Definition label="Digital file path">
              {lot.digitalFilePath ? (
                <span className="font-mono text-[12px] break-all">{lot.digitalFilePath}</span>
              ) : (
                <EmptyValue />
              )}
            </Definition>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge severity={lot.physicalLabelApplied ? 'good' : 'neutral'}>
              Physical label {lot.physicalLabelApplied ? 'applied' : 'not applied'}
            </Badge>
            <Badge severity={lot.containerLabelApplied ? 'good' : 'neutral'}>
              Container label {lot.containerLabelApplied ? 'applied' : 'not applied'}
            </Badge>
          </div>
        </div>

        <FormError message={error} />

        {canEdit ? (
          <div className="flex flex-col gap-3">
            <Field label="Digital file path" hint="Where this lot lives on the file server.">
              <TextInput
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g. /archive/2026/LOT-2026-1285"
              />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input type="checkbox" checked={physicalLabel} onChange={(e) => setPhysicalLabel(e.target.checked)} className="h-4 w-4 accent-accent" />
              Physical label applied
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input type="checkbox" checked={containerLabel} onChange={(e) => setContainerLabel(e.target.checked)} className="h-4 w-4 accent-accent" />
              Container label applied
            </label>
            <div>
              <PrimaryButton disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? 'Saving…' : 'Save storage location'}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
