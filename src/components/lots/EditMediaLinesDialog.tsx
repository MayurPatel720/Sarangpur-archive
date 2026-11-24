'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Dialog } from '@/components/ui/Dialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { LotDetailResponse } from '@/types/lot';
import {
  EMPTY_LINE,
  MediaStep,
  buildMediaLines,
  emptyDraft,
  useIntakeDraft,
  validateMedia,
  type StepCtx,
} from './intake-steps';

type DetailLot = LotDetailResponse['lot'];

/**
 * Correct the media table (e.g. counted 52, not 50) while the lot is in Intake. The
 * lot's items are regenerated from the new lines. Project child lots stay
 * single-format, so the format column is locked to the lot's format.
 */
export function EditMediaLinesDialog({ lot, onClose }: { lot: DetailLot; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { draft, patch, fieldErrors, setFieldErrors, clearPrefix, newRowId } = useIntakeDraft(() => ({
    ...emptyDraft(EMPTY_LINE, ''),
    lines: lot.mediaLines.map((l, i) => ({
      id: `m${i}`,
      format: l.format,
      dataType: l.dataType,
      mediaSubtype: l.mediaSubtype,
      quantity: String(l.quantity),
      quantityRemarks: l.quantityRemarks ?? '',
      guru: l.guru ?? lot.guru ?? '',
    })),
  }));
  const [error, setError] = useState<string | null>(null);
  // Letters that already have a code (a scanned file was chosen), per line: those lines keep their format / data type and cannot
  // drop below that many letters. Everything else about the lot can still be edited.
  const lineLocks: Record<string, number> = {};
  if (lot.format === 'documents') {
    lot.mediaLines.forEach((_, i) => {
      const coded = lot.lineStats.find((s) => s.lineIndex === i)?.coded ?? 0;
      if (coded > 0) lineLocks[`m${i}`] = coded;
    });
  }
  const ctx: StepCtx = {
    lineLocks,
    mode: 'lot',
    draft,
    patch,
    errors: fieldErrors,
    clearPrefix,
    newRowId: () => `n${newRowId()}`,
    // Letters lots are always Documents: the Format column is hidden (and the rest reordered), so the table fits without scrolling.
    initialFormat: lot.syncProject || lot.format === 'documents' ? lot.format : undefined,
  };

  const save = useMutation({
    mutationFn: () => lotsApi.replaceMediaLines(lot.id, { version: lot.version, mediaLines: buildMediaLines(draft) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      toast.success('Quantities updated', lot.lotReference);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not update the quantities.'),
  });

  const submit = () => {
    const errs = validateMedia(draft, { guru: lot.format === 'documents' });
    for (const [id, coded] of Object.entries(lineLocks)) {
      const line = draft.lines.find((l) => l.id === id);
      const at = draft.lines.findIndex((l) => l.id === id);
      if (!line) {
        errs['lines.total'] = `Line ${Number(id.slice(1)) + 1} has letters with codes, so it cannot be removed.`;
      } else if (Number(line.quantity) < coded) {
        errs[`${id}.quantity`] = `Line ${at + 1}: ${coded} ${coded === 1 ? 'letter already has' : 'letters already have'} a code, so the quantity cannot go below ${coded}.`;
      }
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Fix the highlighted rows first.');
      return;
    }
    setError(null);
    save.mutate();
  };

  return (
    <Dialog
      title={`Edit quantities · ${lot.lotReference}`}
      subtitle={
        lot.format === 'documents'
          ? 'Add or remove letters and change the Guru. Letters that already have a code keep it, and only letters without a code can be removed.'
          : 'Only while the lot is in Intake. Item codes are regenerated from the new totals.'
      }
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-3.5">
        <MediaStep ctx={ctx} />
        <FormError message={error} />
        <div className="flex justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="button" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save quantities'}
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
