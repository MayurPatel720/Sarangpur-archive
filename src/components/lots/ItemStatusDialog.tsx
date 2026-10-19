'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { dmyToIso, isoToDmy } from '@/lib/format';
import { ITEM_STATUS_LABELS, REMOVAL_COLUMNS, REMOVAL_REQUIRED, itemStatus, missingRequired } from '@/lib/item-status';
import { Badge } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem, Removal } from '@/types/items';

const SEVERITY = { active: 'good', details_missing: 'warning', inactive: 'neutral' } as const;
const isDate = (id: string) => id === 'removedOn' || id === 'receivedAtNewOn';

/**
 * A Prasadi item's status. Active / Details Missing: shows which starred fields are still empty and
 * offers "Remove from archive" (the removal form — Date removed, New item location and Item sent to
 * are required). Inactive: shows the removal details, lets them be corrected, or makes the item
 * Active again. An Inactive item is read-only everywhere else until then.
 */
export function ItemStatusDialog({
  lotId,
  item,
  canManage,
  onClose,
  onChanged,
}: {
  lotId: string;
  item: GridItem;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const status = itemStatus(item) ?? 'active';
  const missing = missingRequired(item);
  const inactive = status === 'inactive';
  const [editing, setEditing] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form works in ISO dates for the picker; the item stores dd/mm/yyyy.
  const start = (id: string): string => {
    const v = String(item.attrs[id] ?? '');
    if (isDate(id)) return v ? (dmyToIso(v) ?? '') : id === 'removedOn' ? new Date().toISOString().slice(0, 10) : '';
    return v;
  };
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(REMOVAL_COLUMNS.map((c) => [c.id, start(c.id)])));
  const set = (id: string, v: string) => setForm((p) => ({ ...p, [id]: v }));
  const missingForm = REMOVAL_REQUIRED.filter((id) => !form[id]?.trim());

  const toRemoval = (): Removal =>
    Object.fromEntries(REMOVAL_COLUMNS.map((c) => [c.id, isDate(c.id) ? (form[c.id] ? isoToDmy(form[c.id]!) : '') : (form[c.id] ?? '').trim()])) as unknown as Removal;

  const done = (message: string) => {
    toast.success(message, item.code);
    onChanged();
    onClose();
  };
  const fail = (e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Could not change the status.');

  const remove = useMutation({
    mutationFn: () => itemsGridApi.changeStatus(lotId, { action: inactive ? 'edit_removal' : 'remove', itemId: item.id, removal: toRemoval() }),
    onSuccess: () => done(inactive ? 'Removal details saved' : 'Removed from the archive'),
    onError: fail,
  });
  const reactivate = useMutation({
    mutationFn: () => itemsGridApi.changeStatus(lotId, { action: 'reactivate', itemId: item.id }),
    onSuccess: () => done('Active again'),
    onError: (e) => {
      setConfirmActive(false);
      fail(e);
    },
  });

  const showForm = canManage && (editing || (!inactive && editing));

  return (
    <Dialog wide title={item.itemName || item.code} subtitle={item.code} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge severity={SEVERITY[status]}>{ITEM_STATUS_LABELS[status]}</Badge>
          {inactive ? <span className="text-[12.5px] text-ink-3">Removed from the archive — read-only until it is made active again.</span> : null}
        </div>

        {!inactive ? (
          missing.length > 0 ? (
            <div role="note" className="rounded-[6px] border border-warn-line bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
              Still needed: <span className="font-semibold">{missing.map((c) => c.label).join(', ')}</span>. Saving is never blocked — the item stays “Details Missing” until these are filled in.
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-3">Every starred field is filled in.</p>
          )
        ) : null}

        {inactive && !showForm ? (
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {REMOVAL_COLUMNS.map((c) => (
              <div key={c.id} className={c.kind === 'longtext' ? 'sm:col-span-2' : ''}>
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{c.label}</dt>
                <dd className="m-0 whitespace-pre-wrap text-[13px] text-ink">{String(item.attrs[c.id] ?? '') || <span className="text-ink-4">—</span>}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {showForm ? (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (missingForm.length > 0) return;
              remove.mutate();
            }}
          >
            {REMOVAL_COLUMNS.map((c) => {
              const required = (REMOVAL_REQUIRED as readonly string[]).includes(c.id);
              return (
                <div key={c.id} className={c.kind === 'longtext' ? 'sm:col-span-2' : ''}>
                  <Field label={c.label} required={required}>
                    {isDate(c.id) ? (
                      <DatePicker value={form[c.id] ?? ''} onChange={(v) => set(c.id, v)} aria-label={c.label} />
                    ) : c.kind === 'longtext' ? (
                      <Textarea value={form[c.id] ?? ''} rows={3} maxLength={2000} onChange={(e) => set(c.id, e.target.value)} aria-label={c.label} />
                    ) : (
                      <TextInput value={form[c.id] ?? ''} maxLength={300} onChange={(e) => set(c.id, e.target.value)} aria-label={c.label} />
                    )}
                  </Field>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <PrimaryButton type="submit" disabled={remove.isPending || missingForm.length > 0}>
                {remove.isPending ? 'Saving…' : inactive ? 'Save removal details' : 'Remove from archive'}
              </PrimaryButton>
              <GhostButton type="button" onClick={() => setEditing(false)}>
                Back
              </GhostButton>
              {missingForm.length > 0 ? <span className="text-[12px] text-ink-3">Still required: {missingForm.map((id) => REMOVAL_COLUMNS.find((c) => c.id === id)?.label).join(', ')}.</span> : null}
            </div>
          </form>
        ) : null}

        <FormError message={error} />

        {canManage && !showForm ? (
          <div className="flex flex-wrap gap-2">
            {inactive ? (
              <>
                <GhostButton onClick={() => setEditing(true)}>Edit removal details</GhostButton>
                <PrimaryButton onClick={() => setConfirmActive(true)}>Make active again</PrimaryButton>
              </>
            ) : (
              <GhostButton onClick={() => setEditing(true)}>Remove from archive…</GhostButton>
            )}
          </div>
        ) : null}
        {!canManage ? <p className="m-0 text-[12px] text-ink-3">Only the lot’s assignee or an admin can change the status.</p> : null}
      </div>

      {confirmActive ? (
        <ConfirmDialog
          title="Make this item active again?"
          body={`${item.code} goes back into the archive and can be edited again. Its removal details are kept.`}
          confirmLabel="Make active"
          tone="default"
          pending={reactivate.isPending}
          onConfirm={() => reactivate.mutate()}
          onClose={() => setConfirmActive(false)}
        />
      ) : null}
    </Dialog>
  );
}
