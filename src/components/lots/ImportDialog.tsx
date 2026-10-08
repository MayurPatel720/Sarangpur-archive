'use client';

import { useRef, useState } from 'react';
import { ApiRequestError, itemsGridApi } from '@/lib/api-client';
import { Dialog } from '@/components/ui/Dialog';
import { FormError, GhostButton, PrimaryButton } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { ImportBody, ImportResponse } from '@/types/items';
import { readItemsFromExcel } from './excel-io';

/**
 * Import an .xlsx exported from this Excel (or filled in the same layout). Rows are matched
 * by Archive code; blank cells are left alone; nothing is saved until the preview is confirmed.
 */
export function ImportDialog({ lotId, onClose, onDone }: { lotId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportBody['rows'] | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError(e instanceof ApiRequestError ? e.message : 'Could not read that file.');
    setBusy(false);
  };

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const parsed = await readItemsFromExcel(file);
      if (parsed.rows.length === 0) {
        setError(
          parsed.sheets === 0
            ? 'No sheet has an “Archive code” column. Export this Excel first and fill that file in.'
            : 'No rows with an Archive code were found.',
        );
        setBusy(false);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      setPreview(await itemsGridApi.importRows(lotId, { apply: false, rows: parsed.rows }));
      setBusy(false);
    } catch (e) {
      fail(e);
    }
  };

  const apply = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const r = await itemsGridApi.importRows(lotId, { apply: true, rows });
      toast.success('Import done', `${r.willChange} ${r.willChange === 1 ? 'row' : 'rows'} updated.`);
      onDone();
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const nothing = preview && preview.willChange === 0;
  return (
    <Dialog title="Import from Excel" subtitle="Rows are matched by Archive code. Blank cells are left as they are." onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
              e.target.value = '';
            }}
          />
          <GhostButton disabled={busy} onClick={() => input.current?.click()}>
            {fileName ? 'Choose another file' : 'Choose .xlsx file'}
          </GhostButton>
          {fileName ? <span className="text-[12.5px] text-ink-2">{fileName}</span> : null}
          {busy ? <span className="text-[12px] text-ink-3">Working…</span> : null}
        </div>

        <FormError message={error} />

        {preview ? (
          <div className="flex flex-col gap-3 text-[12.5px] text-ink-2">
            <p className="m-0">
              <strong className="text-ink">{preview.matched}</strong> rows matched ·{' '}
              <strong className="text-ink">{preview.willChange}</strong> would change ({preview.changesTotal}{' '}
              {preview.changesTotal === 1 ? 'cell' : 'cells'})
              {preview.unknownCodes.length ? ` · ${preview.unknownCodes.length} code${preview.unknownCodes.length === 1 ? '' : 's'} not in this lot` : ''}
            </p>
            {preview.unknownCodes.length ? (
              <p className="m-0 text-ink-3 break-words">Not found: {preview.unknownCodes.slice(0, 8).join(', ')}{preview.unknownCodes.length > 8 ? '…' : ''}</p>
            ) : null}
            {preview.ignoredColumns.length ? (
              <p className="m-0 text-ink-3">Ignored columns: {preview.ignoredColumns.join(', ')}</p>
            ) : null}
            {preview.errors.length ? (
              <div role="alert" className="rounded-[6px] border border-danger-line bg-danger-bg px-3 py-2">
                <p className="m-0 font-semibold text-danger">{preview.blockedBy[0]}</p>
                <ul className="m-0 mt-1 pl-4 text-danger">
                  {preview.errors.slice(0, 12).map((er, i) => (
                    <li key={i}>
                      <span className="font-mono">{er.code}</span> · {er.column}: {er.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview.changes.length ? (
              <div className="max-h-[260px] overflow-auto rounded-[6px] border border-line-soft">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] uppercase tracking-[0.04em] text-ink-3">
                    <tr>
                      <th className="px-2.5 py-1.5">Code</th>
                      <th className="px-2.5 py-1.5">Column</th>
                      <th className="px-2.5 py-1.5">From</th>
                      <th className="px-2.5 py-1.5">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c, i) => (
                      <tr key={i} className="border-t border-line-soft">
                        <td className="px-2.5 py-1 font-mono">{c.code}</td>
                        <td className="px-2.5 py-1">{c.column}</td>
                        <td className="px-2.5 py-1 text-ink-3">{c.from || '—'}</td>
                        <td className="px-2.5 py-1 text-ink">{c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {preview.changesTotal > preview.changes.length ? (
              <p className="m-0 text-ink-3">Showing the first {preview.changes.length} changes.</p>
            ) : null}
            {nothing && !preview.errors.length ? <p className="m-0 text-ink-3">Nothing in this file differs from the Excel.</p> : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={busy || !preview || nothing || preview.errors.length > 0} onClick={() => void apply()}>
            {busy && preview ? 'Importing…' : `Import ${preview?.willChange ?? ''} ${preview?.willChange === 1 ? 'row' : 'rows'}`.replace('  ', ' ')}
          </PrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}
