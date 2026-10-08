'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { Dialog } from '@/components/ui/Dialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import type { ItemDuplicateResponse, GridItem } from '@/types/items';

/**
 * Typing a code in an item's "Duplicate code" cell lands here. The item already in the
 * archive is the MAIN one and keeps its code; this item becomes the duplicate and takes the
 * main item's number with kind D. "Swap" reverses the roles. Nothing is written until Confirm.
 */
export function DuplicateDialog({
  lotId,
  item,
  otherCode,
  onClose,
  onDone,
}: {
  lotId: string;
  item: GridItem;
  otherCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [swap, setSwap] = useState(false);
  const [plan, setPlan] = useState<ItemDuplicateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (s: boolean) => {
      setPlan(null);
      setError(null);
      itemsGridApi
        .markDuplicate(lotId, { itemId: item.id, otherCode, swap: s, confirm: false })
        .then(setPlan)
        .catch((e) => setError(e instanceof ApiRequestError ? e.message : 'Could not check that code.'));
    },
    [lotId, item.id, otherCode],
  );
  useEffect(() => load(false), [load]);

  const confirm = () => {
    setSaving(true);
    setError(null);
    itemsGridApi
      .markDuplicate(lotId, { itemId: item.id, otherCode, swap, confirm: true })
      .then((r) => {
        toast.success('Marked as duplicate', `${r.duplicate.code} → ${r.duplicate.newCode}`);
        onDone();
        onClose();
      })
      .catch((e) => {
        setError(e instanceof ApiRequestError ? e.message : 'Could not save.');
        setSaving(false);
      });
  };

  const Side = ({ title, code, lot, here, note }: { title: string; code: string; lot: string; here: boolean; note?: string }) => (
    <div className="rounded-[8px] border border-line-soft bg-surface-subtle px-3.5 py-3 flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">{title}</span>
      <span className="font-mono text-[13px] font-semibold text-ink break-all">{code}</span>
      <span className="text-[12px] text-ink-3">
        {lot}
        {here ? ' · this lot' : ''}
      </span>
      {note ? <span className="font-mono text-[12.5px] text-ink-2 break-all">{note}</span> : null}
    </div>
  );

  return (
    <Dialog title="Mark as duplicate" subtitle={`${item.code} and ${otherCode}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!plan && !error ? <Skeleton className="h-28 w-full" /> : null}
        {plan ? (
          <>
            <p className="m-0 text-[13px] text-ink-2">
              The <strong>main</strong> item keeps its code — it may already be stored and stickered. The{' '}
              <strong>duplicate</strong> is re-coded, so only its sticker has to change.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Side title="Main — keeps its code" code={plan.main.code} lot={plan.main.lotReference} here={plan.main.here} />
              <Side
                title="Duplicate — new code"
                code={plan.duplicate.code}
                lot={plan.duplicate.lotReference}
                here={plan.duplicate.here}
                note={`→ ${plan.duplicate.newCode}`}
              />
            </div>
            <p className="m-0 text-[12px] text-ink-3">
              {plan.duplicate.code} becomes free for another item. Both rows show the link in Duplicate code.
            </p>
            {plan.blocked ? (
              <p role="alert" className="m-0 text-[12.5px] text-danger">
                {plan.blocked}
              </p>
            ) : null}
          </>
        ) : null}
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          {plan ? (
            <GhostButton
              disabled={saving}
              onClick={() => {
                setSwap((s) => !s);
                load(!swap);
              }}
            >
              Swap main and duplicate
            </GhostButton>
          ) : null}
          <PrimaryButton disabled={!plan || Boolean(plan.blocked) || saving} onClick={confirm}>
            {saving ? 'Saving…' : 'Confirm'}
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
