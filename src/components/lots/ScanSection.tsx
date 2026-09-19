'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import type { ReconcileResponse } from '@/types/ops';
import { SCAN_STATUSES } from '@/lib/domain';
import { prettyEnum } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Panel, PanelHeader } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';

type DetailLot = LotDetailResponse['lot'];

export function ScanSection({ lot, onChanged }: { lot: DetailLot; onChanged: () => void }) {
  const me = useMe();
  const grants = me.data ? me.data.grants : [];
  const canScan = grants.includes('scan:record');
  const canReconcile = grants.includes('reconcile:trigger');

  const [scanStatus, setScanStatus] = useState(lot.ops.scanStatus);
  const [folderPath, setFolderPath] = useState(lot.ops.folderPath ?? '');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResponse | null>(null);

  const scanMut = useMutation({
    mutationFn: () =>
      lotsApi.scan(lot.id, {
        scanStatus: scanStatus as (typeof SCAN_STATUSES)[number],
        ...(folderPath.trim() ? { folderPath: folderPath.trim() } : {}),
        version: lot.version,
      }),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not record the scan.'),
  });

  const reconcileMut = useMutation({
    mutationFn: () => lotsApi.reconcile(lot.id),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
      onChanged();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not reconcile.'),
  });

  return (
    <Panel>
      <PanelHeader title="Scanning & reconciliation" />
      <div className="p-3 md:p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Status</span>
            <span className="text-ink font-medium">{prettyEnum(lot.ops.scanStatus)}</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Folder</span>
            <span className="text-ink break-all">{lot.ops.folderPath ?? '—'}</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Expected / found</span>
            <span className="text-ink">
              {lot.ops.expectedFileCount} / {lot.ops.foundFileCount}
            </span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">Last reconciled</span>
            <span className="text-ink">{lot.ops.lastReconciledAt ? lot.ops.lastReconciledAt.slice(0, 10) : '—'}</span>
          </span>
        </div>

        <FormError message={error} />

        {canScan ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Scan status">
              <Select value={scanStatus} onChange={(e) => setScanStatus(e.target.value)}>
                {SCAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {prettyEnum(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Folder path" hint="Where the scanned files live on the file server.">
              <TextInput
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="e.g. /archive/2026/LOT-2026-1285"
              />
            </Field>
            <div>
              <PrimaryButton disabled={scanMut.isPending} onClick={() => scanMut.mutate()}>
                {scanMut.isPending ? 'Saving…' : 'Save scan state'}
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {canReconcile ? (
          <div className="flex flex-col gap-2">
            <div>
              <GhostButton disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate()}>
                {reconcileMut.isPending ? 'Reconciling…' : 'Run reconciliation'}
              </GhostButton>
            </div>
            {result ? (
              <p className="m-0 text-[13px] text-ink-2">
                Found {result.found} of {result.expected} expected files
                {result.missingTotal > 0 ? ` · ${result.missingTotal} missing` : ' · nothing missing'}
                {result.unexpectedTotal > 0 ? ` · ${result.unexpectedTotal} unexpected` : ''}.
                {result.missing.length > 0 ? ` Missing: ${result.missing.slice(0, 10).join(', ')}${result.missing.length > 10 ? '…' : ''}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
