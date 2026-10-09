'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { abbrError, buildItemCode, parseItemCodeParts } from '@/lib/item-code';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem } from '@/types/items';

/**
 * Opens from a click on an Archive code. Two things can be changed here:
 *  - the whole sheet's code: both abbreviations and the first number — the rest simply
 *    continue (and a start number higher than the next free one leaves the numbers in
 *    between free for later);
 *  - this one item's number (to a free one).
 * Duplicates (…-D-…) follow their original and are not edited here.
 */
export function ItemCodeDialog({
  lotId,
  item,
  sheetName,
  sheetItems,
  onClose,
  onDone,
}: {
  lotId: string;
  item: GridItem;
  sheetName: string;
  /** Every item of this sheet (not just the filtered rows). */
  sheetItems: GridItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const parts = parseItemCodeParts(item.code);
  const recodable = sheetItems.filter((i) => parseItemCodeParts(i.code)?.kind === 'R');
  const firstParts = recodable[0] ? parseItemCodeParts(recodable[0].code) : null;

  const [abbr1, setAbbr1] = useState(parts?.abbr1 ?? '');
  const [abbr2, setAbbr2] = useState(parts?.abbr2 ?? '');
  const [start, setStart] = useState(firstParts ? String(firstParts.no) : '');
  const [startTouched, setStartTouched] = useState(false);
  const [highest, setHighest] = useState<number | null>(null);
  const [number, setNumber] = useState(parts ? String(parts.no) : '');
  const [error, setError] = useState<string | null>(null);

  const samePair = parts?.abbr1 === abbr1.trim() && parts?.abbr2 === abbr2.trim();
  const pairError = abbrError('First abbreviation', abbr1) ?? abbrError('Second abbreviation', abbr2);

  // How far is this pair already used (all lots)? Prefill the start with the next free number.
  useEffect(() => {
    if (pairError) {
      setHighest(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      itemsGridApi
        .codeInfo(lotId, abbr1.trim(), abbr2.trim())
        .then((r) => {
          if (!live) return;
          setHighest(r.highest);
          if (!startTouched && !samePair) setStart(String(r.nextNo));
          if (!startTouched && samePair && firstParts) setStart(String(firstParts.no));
        })
        .catch(() => live && setHighest(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abbr1, abbr2, lotId]);

  const startNo = Number(start);
  const startOk = Number.isInteger(startNo) && startNo >= 1;
  const endNo = startOk ? startNo + recodable.length - 1 : 0;
  const pad = (n: number) => String(n).padStart(4, '0');
  const jump = !samePair && highest !== null && startOk && startNo > highest + 1;
  const captured = recodable.filter((i) => i.captured).length;

  const fail = (e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Could not change the code.');
  const done = (title: string, detail: string) => {
    toast.success(title, detail);
    onDone();
    onClose();
  };

  const sheet = useMutation({
    mutationFn: () =>
      itemsGridApi.recodeSheet(lotId, { lineIndex: item.lineIndex, abbr1: abbr1.trim(), abbr2: abbr2.trim(), startNo }),
    onSuccess: (r) => done('Codes updated', `${r.firstCode} … ${r.lastCode}`),
    onError: fail,
  });
  const single = useMutation({
    mutationFn: () => itemsGridApi.setNumber(lotId, { itemId: item.id, no: Number(number) }),
    onSuccess: (r) => done('Code updated', r.code),
    onError: fail,
  });

  if (!parts) {
    return (
      <Dialog title={item.code} subtitle={sheetName} onClose={onClose}>
        <p className="m-0 text-[13px] text-ink-2">This item has an older code format that cannot be edited here.</p>
      </Dialog>
    );
  }
  if (parts.kind === 'D') {
    return (
      <Dialog title={item.code} subtitle={sheetName} onClose={onClose}>
        <p className="m-0 text-[13px] text-ink-2">
          This item is a duplicate of <span className="font-mono">{item.duplicateCode}</span>. A duplicate takes its
          original&apos;s number, so its code is changed from the original.
        </p>
        <div className="mt-4 flex justify-end">
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={item.code} subtitle={`${sheetName} · ${recodable.length} item${recodable.length === 1 ? '' : 's'}`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3" aria-label="Code for this whole sheet">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Code for this sheet</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Abbreviation 1">
              <TextInput value={abbr1} onChange={(e) => setAbbr1(e.target.value)} maxLength={12} autoComplete="off" />
            </Field>
            <Field label="Abbreviation 2">
              <TextInput value={abbr2} onChange={(e) => setAbbr2(e.target.value)} maxLength={12} autoComplete="off" />
            </Field>
            <Field label="First number">
              <TextInput
                value={start}
                inputMode="numeric"
                onChange={(e) => {
                  setStart(e.target.value);
                  setStartTouched(true);
                }}
              />
            </Field>
          </div>
          <p className="m-0 text-[12px] text-ink-3" aria-live="polite">
            {pairError ? (
              pairError
            ) : startOk ? (
              <>
                <span className="font-mono text-ink-2">{buildItemCode({ abbr1: abbr1.trim(), abbr2: abbr2.trim(), no: startNo, kind: 'R', copy: 0 })}</span>
                {recodable.length > 1 ? (
                  <>
                    {' '}to <span className="font-mono text-ink-2">{pad(endNo)}</span>
                  </>
                ) : null}
                {highest !== null ? (
                  <>
                    {' · '}
                    {highest === 0 ? `${abbr1.trim()}-${abbr2.trim()} is new` : `${abbr1.trim()}-${abbr2.trim()} is used up to ${pad(highest)}`}
                  </>
                ) : null}
                {jump ? ` · numbers ${pad(highest! + 1)}–${pad(startNo - 1)} stay free` : ''}
              </>
            ) : (
              'Enter a first number.'
            )}
          </p>
          {captured > 0 ? (
            <p role="note" className="m-0 text-[12px] text-warn">
              {captured} item{captured === 1 ? ' is' : 's are'} already digitalized — rename their files to match the new codes.
            </p>
          ) : null}
          <div>
            <PrimaryButton
              disabled={Boolean(pairError) || !startOk || sheet.isPending || (samePair && firstParts?.no === startNo)}
              onClick={() => {
                setError(null);
                sheet.mutate();
              }}
            >
              {sheet.isPending ? 'Saving…' : `Apply to ${recodable.length} item${recodable.length === 1 ? '' : 's'}`}
            </PrimaryButton>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-line-soft pt-4" aria-label="Number of this item">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Only this item</h3>
          <div className="flex items-end gap-3">
            <Field label="Number">
              <TextInput value={number} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
            </Field>
            <GhostButton
              disabled={!/^\d+$/.test(number) || Number(number) === parts.no || single.isPending}
              onClick={() => {
                setError(null);
                single.mutate();
              }}
            >
              {single.isPending ? 'Saving…' : 'Change number'}
            </GhostButton>
          </div>
          <p className="m-0 text-[12px] text-ink-3">Any number not used by another item of {parts.abbr1}-{parts.abbr2}.</p>
        </section>

        <FormError message={error} />
        <div className="flex justify-end">
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      </div>
    </Dialog>
  );
}
