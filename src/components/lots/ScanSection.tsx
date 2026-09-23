'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import type { LotDetailResponse } from '@/types/lot';
import type { ReconcileResponse } from '@/types/ops';
import { SCAN_STATUSES } from '@/lib/domain';
import { date, prettyEnum } from '@/lib/format';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from '@/components/ui/Form';
import { Definition, EmptyValue, Panel, PanelHeader } from '@/components/ui/primitives';
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
      <div className="px-4 md:px-5 py-3.5 flex flex-col gap-3.5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3.5">
          <Definition label="Status">{prettyEnum(lot.ops.scanStatus)}</Definition>
          <Definition label="Folder">{lot.ops.folderPath ?? <EmptyValue />}</Definition>
          <Definition label="Expected / found">
            {lot.ops.expectedFileCount} / {lot.ops.foundFileCount}
          </Definition>
          <Definition label="Last reconciled">
            {lot.ops.lastReconciledAt ? date(lot.ops.lastReconciledAt) : <EmptyValue />}
          </Definition>
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
