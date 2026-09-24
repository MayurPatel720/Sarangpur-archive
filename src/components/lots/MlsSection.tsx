'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { Badge, Definition, EmptyValue, Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';
import { useReferenceList } from '@/hooks/useReferenceList';

type DetailLot = LotDetailResponse['lot'];

const dash = <EmptyValue />;

export function MlsSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const duplicateActions = useReferenceList('duplicateAction');
  const canTag = me.data ? me.data.grants.includes('mls:tag') : false;
  const canResolve = me.data ? me.data.grants.includes('duplicate:resolve') : false;
  const [formError, setFormError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState('');
  const [taggedCount, setTaggedCount] = useState('');
  const [tagsApplied, setTagsApplied] = useState('');
  const [dataListAttached, setDataListAttached] = useState(false);
  const [markComplete, setMarkComplete] = useState(false);
  const [dupAction, setDupAction] = useState('');

  const tag = useMutation({
    mutationFn: () =>
      lotsApi.tagMls(lot.id, {
        ...(recordId.trim() ? { recordId: recordId.trim() } : {}),
        ...(taggedCount.trim() ? { taggedCount: Number(taggedCount) } : {}),
        ...(tagsApplied.trim() ? { tagsApplied: tagsApplied.trim() } : {}),
        ...(dataListAttached ? { dataListAttached: true } : {}),
        ...(markComplete ? { markComplete: true } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setFormError(null);
      setRecordId('');
      setTaggedCount('');
      setTagsApplied('');
      setDataListAttached(false);
      setMarkComplete(false);
      onChanged();
    },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.message : 'Could not save MLS tagging.'),
  });

  const resolve = useMutation({
    mutationFn: () => lotsApi.resolveDuplicate(lot.id, { duplicateAction: dupAction, version: lot.version }),
    onSuccess: () => {
      setFormError(null);
      onChanged();
    },
    onError: (e) => setFormError(e instanceof ApiRequestError ? e.message : 'Could not resolve duplicate.'),
  });

  const actionLabel = (value: string): string =>
    duplicateActions.data?.items.find((a) => a.value === value)?.label ?? value;

  return (
    <Panel>
      <PanelHeader title="MLS tagging" />
      <div className="px-4 md:px-5 py-3.5 flex flex-col gap-3.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3.5">
          <Definition label="Record ID">{lot.ops.mlsRecordId ?? dash}</Definition>
          <Definition label="Tagged">{lot.ops.mlsTaggedCount}</Definition>
          <Definition label="Tags applied" className="col-span-2">{lot.ops.mlsTagsApplied ?? dash}</Definition>
          <Definition label="Data list">{lot.ops.mlsDataListAttached ? 'Attached' : dash}</Definition>
          <Definition label="Duplicates">
            {lot.ops.mlsDuplicatesFound > 0 ? (
              <Badge severity={lot.ops.mlsDuplicateAction ? 'neutral' : 'warning'}>
                {lot.ops.mlsDuplicatesFound} · {lot.ops.mlsDuplicateAction ? actionLabel(lot.ops.mlsDuplicateAction) : 'unresolved'}
              </Badge>
            ) : (
              dash
            )}
          </Definition>
        </div>

        {canTag ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="MLS record ID">
                <TextInput value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="e.g. MLS-2026-0142" />
              </Field>
              <Field label="Tagged count">
                <TextInput value={taggedCount} onChange={(e) => setTaggedCount(e.target.value)} inputMode="numeric" placeholder="e.g. 36" />
              </Field>
            </div>
            <Field label="Tags applied" hint="Free-text tags from the Tagging Guidelines (brief §3.04).">
              <Textarea
                value={tagsApplied}
                onChange={(e) => setTagsApplied(e.target.value)}
                rows={2}
                placeholder="e.g. festival; prasang; 1985"
              />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input type="checkbox" checked={dataListAttached} onChange={(e) => setDataListAttached(e.target.checked)} className="h-4 w-4 accent-accent" />
              Data list attached
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 min-h-[44px]">
              <input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} className="h-4 w-4 accent-accent" />
              Mark complete (advance to storage)
            </label>
            {formError ? <FormError message={formError} /> : null}
            <div>
              <PrimaryButton onClick={() => tag.mutate()} disabled={tag.isPending}>
                {tag.isPending ? 'Saving…' : 'Save tagging'}
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {canResolve && lot.ops.mlsDuplicatesFound > 0 && !lot.ops.mlsDuplicateAction ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="Duplicate action">
                <Select value={dupAction} onChange={(e) => setDupAction(e.target.value)}>
                  <option value="">Choose…</option>
                  {(duplicateActions.data?.items ?? []).map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <GhostButton onClick={() => resolve.mutate()} disabled={resolve.isPending || !dupAction}>
                  {resolve.isPending ? 'Resolving…' : 'Resolve duplicate'}
                </GhostButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
