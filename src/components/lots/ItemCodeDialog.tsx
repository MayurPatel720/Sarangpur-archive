'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { abbrError, buildItemCode, KIND_DUPLICATE, KIND_ORIGINAL, parseItemCodeParts } from '@/lib/item-code';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { GridItem } from '@/types/items';

/**
 * Opens from a click on an Archive code. Two things can be changed here:
 *  - the whole sheet's code: both abbreviations and the first number — the rest simply
 *    continue (and a start number higher than the next free one leaves the numbers in
 *    between free for later);
 *  - this one item's number, its last three digits (to free ones) and its code letter (R, M, P … — the
 *    admin list "Item code letters"). Choosing D marks it as a duplicate of an original instead.
 * A duplicate (…-D-…) follows its original: it can only be given another letter, which unlinks it.
 */
export function ItemCodeDialog({
  lotId,
  item,
  sheetName,
  sheetItems,
  onClose,
  onDone,
  onDuplicate,
  itemOnly = false,
  selectedIds = [],
}: {
  lotId: string;
  item: GridItem;
  sheetName: string;
  /** Every item of this sheet (not just the filtered rows). */
  sheetItems: GridItem[];
  onClose: () => void;
  onDone: () => void;
  /** The kind D was chosen with an original's code: open the duplicate flow. */
  onDuplicate: (item: GridItem, otherCode: string) => void;
  /** Only this item's five parts (the Master Excel has no whole-sheet view). */
  itemOnly?: boolean;
  /** Rows ticked on this sheet: the "Code letter" in the sheet section changes these (and only these). */
  selectedIds?: string[];
}) {
  const toast = useToast();
  const kindList = useReferenceList('itemCodeKind');
  const parts = parseItemCodeParts(item.code);
  const recodable = sheetItems.filter((i) => {
    const k = parseItemCodeParts(i.code)?.kind;
    return k !== undefined && k !== KIND_DUPLICATE;
  });
  const firstParts = recodable[0] ? parseItemCodeParts(recodable[0].code) : null;

  const [abbr1, setAbbr1] = useState(parts?.abbr1 ?? '');
  const [abbr2, setAbbr2] = useState(parts?.abbr2 ?? '');
  const [start, setStart] = useState(firstParts ? String(firstParts.no) : '');
  const [startTouched, setStartTouched] = useState(false);
  const [highest, setHighest] = useState<number | null>(null);
  const [itemAbbr1, setItemAbbr1] = useState(parts?.abbr1 ?? '');
  const [itemAbbr2, setItemAbbr2] = useState(parts?.abbr2 ?? '');
  const [number, setNumber] = useState(parts ? String(parts.no) : '');
  const [copy, setCopy] = useState(parts ? String(parts.copy).padStart(3, '0') : '000');
  const [kind, setKind] = useState(parts?.kind ?? KIND_ORIGINAL);
  const [original, setOriginal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sheetLetter, setSheetLetter] = useState('');
  const isDuplicate = parts?.kind === KIND_DUPLICATE;
  // R and D always exist; the admin list adds more (M, P …). A duplicate can only leave D, so D is not offered to it.
  const kindOptions = (() => {
    const base = (kindList.data?.items ?? []).map((i) => ({ value: i.value, label: i.label }));
    for (const v of [KIND_ORIGINAL, KIND_DUPLICATE]) if (!base.some((b) => b.value === v)) base.push({ value: v, label: v });
    return base;
  })();
  // Same letters as Bulk edit: D is left out because it needs an original's code.
  const sheetLetterOptions = kindOptions.filter((o) => o.value !== KIND_DUPLICATE);

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

  const makesDuplicate = kind === KIND_DUPLICATE && !isDuplicate;
  const itemPairError = isDuplicate ? null : (abbrError('First abbreviation', itemAbbr1) ?? abbrError('Second abbreviation', itemAbbr2));
  const itemOk = !itemPairError && /^\d+$/.test(number) && Number(number) >= 1 && /^\d{1,3}$/.test(copy) && (!makesDuplicate || original.trim() !== '');
  const itemPairChanged = itemAbbr1.trim() !== parts?.abbr1 || itemAbbr2.trim() !== parts?.abbr2;
  const itemChanged = itemPairChanged || Number(number) !== parts?.no || Number(copy) !== parts?.copy || kind !== parts?.kind;

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
  const letterMut = useMutation({
    mutationFn: () => itemsGridApi.setLetters(lotId, { itemIds: selectedIds, kind: sheetLetter }),
    onSuccess: (r) => {
      if (r.skipped.length > 0) toast.error(`${r.skipped.length} not changed`, `${r.skipped[0]!.code}: ${r.skipped[0]!.reason}`);
      if (r.changed > 0) done('Code letter changed', `${sheetLetter} on ${r.changed} ${r.changed === 1 ? 'item' : 'items'}`);
    },
    onError: fail,
  });
  const single = useMutation({
    mutationFn: () =>
      itemsGridApi.setNumber(lotId, {
        itemId: item.id,
        ...(!isDuplicate && itemAbbr1.trim() !== parts?.abbr1 ? { abbr1: itemAbbr1.trim() } : {}),
        ...(!isDuplicate && itemAbbr2.trim() !== parts?.abbr2 ? { abbr2: itemAbbr2.trim() } : {}),
        ...(!isDuplicate && Number(number) !== parts?.no ? { no: Number(number) } : {}),
        ...(!isDuplicate && Number(copy) !== parts?.copy ? { copy: Number(copy) } : {}),
        ...(kind !== parts?.kind ? { kind } : {}),
      }),
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
  return (
    <Dialog title={item.code} subtitle={`${sheetName} · ${recodable.length} item${recodable.length === 1 ? '' : 's'}`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {isDuplicate ? (
          <p className="m-0 text-[13px] text-ink-2">
            This item is a duplicate of <span className="font-mono">{item.duplicateCode}</span> and takes its original&apos;s number. Give it another letter below to make it an
            ordinary item again (it is unlinked and gets the next free number), or change the original.
          </p>
        ) : null}
        {isDuplicate || itemOnly ? null : (
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
          <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code letter" hint={selectedIds.length === 0 ? 'Tick rows in the Items tab first.' : undefined}>
                <Select
                  value={sheetLetter}
                  onChange={(e) => setSheetLetter(e.target.value)}
                  disabled={selectedIds.length === 0}
                  aria-label="Code letter for the ticked rows"
                >
                  <option value="">Keep as is</option>
                  {sheetLetterOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="m-0 text-[12px] text-ink-3">
              {selectedIds.length > 0
                ? `Changes the letter of the ${selectedIds.length} ticked row${selectedIds.length === 1 ? '' : 's'} only. Rows that cannot change are skipped.`
                : 'The letter is applied only to the rows you tick.'}
            </p>
            <div>
              <PrimaryButton
                disabled={!sheetLetter || selectedIds.length === 0 || letterMut.isPending}
                onClick={() => {
                  setError(null);
                  letterMut.mutate();
                }}
              >
                {letterMut.isPending ? 'Saving…' : `Apply letter to ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`}
              </PrimaryButton>
            </div>
          </div>
        </section>
        )}

        <section className={`flex flex-col gap-3 ${isDuplicate || itemOnly ? '' : 'border-t border-line-soft pt-4'}`} aria-label="Number of this item">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Only this item (all five parts)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {isDuplicate ? null : (
              <>
                <Field label="Abbreviation 1">
                  <TextInput value={itemAbbr1} onChange={(e) => setItemAbbr1(e.target.value)} maxLength={12} autoComplete="off" />
                </Field>
                <Field label="Abbreviation 2">
                  <TextInput value={itemAbbr2} onChange={(e) => setItemAbbr2(e.target.value)} maxLength={12} autoComplete="off" />
                </Field>
              </>
            )}
            <Field label="Code letter">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Code letter">
                {kindOptions
                  .filter((o) => !(isDuplicate && o.value === KIND_DUPLICATE))
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                {isDuplicate ? <option value={KIND_DUPLICATE}>D — duplicate (now)</option> : null}
              </Select>
            </Field>
            {isDuplicate ? null : (
              <>
                <Field label="Number">
                  <TextInput value={number} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
                </Field>
                <Field label="Last 3 digits">
                  <TextInput value={copy} inputMode="numeric" maxLength={3} onChange={(e) => setCopy(e.target.value.replace(/\D/g, ''))} />
                </Field>
              </>
            )}
            {makesDuplicate ? (
              <div className="col-span-full">
              <Field label="Original's code">
                <TextInput value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="e.g. NEG-MUM-0176-R-000" autoComplete="off" />
              </Field>
              </div>
            ) : null}
            <div className="col-span-full">
            <GhostButton
              disabled={!itemChanged || !itemOk || single.isPending}
              onClick={() => {
                setError(null);
                if (makesDuplicate) {
                  onDuplicate(item, original.trim());
                  onClose();
                } else single.mutate();
              }}
            >
              {single.isPending ? 'Saving…' : makesDuplicate ? 'Mark as duplicate' : 'Change code'}
            </GhostButton>
            </div>
          </div>
          <p className="m-0 text-[12px] text-ink-3" aria-live="polite">
            {isDuplicate && kind !== KIND_DUPLICATE ? (
              <>The code becomes <span className="font-mono text-ink-2">{parts.abbr1}-{parts.abbr2}-…-{kind}-000</span> with the next free number.</>
            ) : makesDuplicate ? (
              'Type the code of the original this item duplicates; you will see the new code before anything is saved.'
            ) : itemOk ? (
              <>
                <span className="font-mono text-ink-2">{buildItemCode({ abbr1: itemAbbr1.trim(), abbr2: itemAbbr2.trim(), no: Number(number), copy: Number(copy), kind })}</span> — any combination not used by another item.
              </>
            ) : itemPairError ? (
              itemPairError
            ) : (
              'The number needs digits, and the last 3 digits can be 000 to 999.'
            )}
          </p>
        </section>

        <FormError message={error} />
        <div className="flex justify-end">
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      </div>
    </Dialog>
  );
}
