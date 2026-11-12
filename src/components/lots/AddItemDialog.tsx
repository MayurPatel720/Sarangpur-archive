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

const ITEMS_PER_GROUP = 36;
const MAX_QUANTITY = 200;
const NEW_GROUP = 'new';
const LAST_GROUP = 'last';

export interface AddItemSheet {
  lineIndex: number;
  name: string;
  /** The sheet's groups, with how many items each holds now. */
  groups: { groupNo: number; count: number }[];
}

/**
 * Add items by hand: how many, to which sheet (media type of the lot) and to which group (an existing one,
 * or a new one). The server numbers every item in order; a group holds 36, so the rest rolls into the next
 * new group.
 */
export function AddItemDialog({
  lotId,
  sheets,
  onClose,
}: {
  lotId: string;
  /** The lot's sheets (media lines) that already have items. An empty list means one default sheet. */
  sheets: AddItemSheet[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reasons = useReferenceList('notDigitizedReason');
  const sheetList: AddItemSheet[] = sheets.length > 0 ? sheets : [{ lineIndex: 0, name: 'Items', groups: [] }];
  const [lineIndex, setLineIndex] = useState(sheetList[0]!.lineIndex);
  const [count, setCount] = useState('1');
  const [group, setGroup] = useState<string>(LAST_GROUP);
  const [selected, setSelected] = useState(true);
  const [reason, setReason] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sheet = sheetList.find((s) => s.lineIndex === lineIndex) ?? sheetList[0]!;
  // Groups are numbered across the whole lot: a new group takes the number after the highest one in use.
  const highestGroup = Math.max(0, ...sheetList.flatMap((s) => s.groups.map((g) => g.groupNo)));
  const quantity = Number.parseInt(count, 10);
  const quantityInvalid = !/^\d+$/.test(count.trim()) || quantity < 1 || quantity > MAX_QUANTITY;

  const chosen = group !== LAST_GROUP && group !== NEW_GROUP ? sheet.groups.find((g) => String(g.groupNo) === group) : null;
  const room = chosen ? Math.max(0, ITEMS_PER_GROUP - chosen.count) : null;

  const create = useMutation({
    mutationFn: async () => {
      const body: ItemCreateInput = {
        selectedForDigitization: selected,
        quantity,
        lineIndex,
      };
      if (group === NEW_GROUP) body.groupNo = highestGroup + 1;
      else if (group !== LAST_GROUP) body.groupNo = Number.parseInt(group, 10);
      if (!selected && reason) body.notDigitizedReason = reason;
      if (fileName.trim()) body.fileName = fileName.trim();
      return lotsApi.createItem(lotId, body);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.lots.all, 'items', lotId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      toast.success(data.created === 1 ? 'Item added' : `${data.created} items added`, data.created === 1 ? data.code : `${data.code} to ${data.lastCode}`);
      onClose();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not add the items.';
      setError(message);
      toast.error('Could not add items', message);
    },
  });

  const canSubmit = !create.isPending && !quantityInvalid && (selected || reason !== '');

  return (
    <Dialog title="Add items" subtitle="Numbered automatically, one after another." onClose={onClose}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <Field label="How many items" hint={`Up to ${MAX_QUANTITY} at once.`}>
          <TextInput
            value={count}
            onChange={(e) => setCount(e.target.value)}
            inputMode="numeric"
            autoFocus
            aria-label="Number of items to add"
          />
        </Field>
        {sheetList.length > 1 ? (
          <Field label="Sheet" hint="Which media type of the lot these items belong to.">
            <Select
              value={String(lineIndex)}
              onChange={(e) => {
                setLineIndex(Number(e.target.value));
                setGroup(LAST_GROUP);
              }}
              aria-label="Sheet"
            >
              {sheetList.map((s) => (
                <option key={s.lineIndex} value={s.lineIndex}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="Group"
          hint={
            room !== null
              ? room >= (quantityInvalid ? 1 : quantity)
                ? `Group ${chosen!.groupNo} has room for ${room} more.`
                : `Group ${chosen!.groupNo} has room for ${room} more — the rest go into new groups.`
              : group === NEW_GROUP
                ? `Starts group ${highestGroup + 1}.`
                : 'Continues the last group, then starts a new one when it is full.'
          }
        >
          <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">
            <option value={LAST_GROUP}>Last group (continue)</option>
            {sheet.groups.map((g) => (
              <option key={g.groupNo} value={String(g.groupNo)}>
                Group {g.groupNo} · {g.count} {g.count === 1 ? 'item' : 'items'}
              </option>
            ))}
            <option value={NEW_GROUP}>New group</option>
          </Select>
        </Field>
        <Checkbox
          label="Selected for digitization"
          checked={selected}
          onChange={(e) => setSelected(e.target.checked)}
        />
        {!selected ? (
          <Field label="Reason" required hint="Required when the items are not selected.">
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
        <Field label="File name" hint="Optional — usually filled at digitalization time.">
          <TextInput
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="IMG_0042.jpg"
            maxLength={180}
            aria-label="File name (optional)"
          />
        </Field>
        <FormError message={quantityInvalid ? `How many must be a whole number from 1 to ${MAX_QUANTITY}.` : error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Adding…' : !quantityInvalid && quantity > 1 ? `Add ${quantity} items` : 'Add item'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
