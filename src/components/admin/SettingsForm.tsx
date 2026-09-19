'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { Panel, PanelHeader, Skeleton, ErrorState } from '@/components/ui/primitives';
import { Field, TextInput, Checkbox, PrimaryButton, FormError } from '@/components/ui/Form';

export function SettingsForm() {
  const canManage = useCan('settings:manage');
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: queryKeys.admin.settings(),
    queryFn: adminApi.settings,
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <Panel>
        <ErrorState message="You don't have access to settings." hint="Ask an administrator for the settings:manage permission." />
      </Panel>
    );
  }

  return (
    <Panel className="max-w-[720px]">
      <PanelHeader title="Archive settings" />
      {settings.isPending ? (
        <div className="p-4 flex flex-col gap-2.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : settings.isError ? (
        <ErrorState message="Couldn't load settings." hint={settings.error.message} onRetry={() => settings.refetch()} />
      ) : (
        <SettingsFields
          key={settings.data.settings.revision}
          initial={settings.data.settings}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.settings() })}
          onConflict={() => void settings.refetch()}
        />
      )}
    </Panel>
  );
}

function SettingsFields({
  initial,
  onSaved,
  onConflict,
}: {
  initial: {
    decisionPendingDays: number;
    scanStuckDays: number;
    returnGraceDays: number;
    storageCapacityTb: number;
    storageLabel: string;
    storageRoot: string;
    storageUsedTb: number;
    notifyEmailEnabled: boolean;
    notifySmsEnabled: boolean;
    revision: number;
    updatedBy: string | null;
  };
  onSaved: () => void;
  onConflict: () => void;
}) {
  const [decisionPendingDays, setDecisionPendingDays] = useState(initial.decisionPendingDays);
  const [scanStuckDays, setScanStuckDays] = useState(initial.scanStuckDays);
  const [returnGraceDays, setReturnGraceDays] = useState(initial.returnGraceDays);
  const [storageCapacityTb, setStorageCapacityTb] = useState(initial.storageCapacityTb);
  const [storageLabel, setStorageLabel] = useState(initial.storageLabel);
  const [storageRoot, setStorageRoot] = useState(initial.storageRoot);
  const [storageUsedTb, setStorageUsedTb] = useState(initial.storageUsedTb);
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(initial.notifyEmailEnabled);
  const [notifySmsEnabled, setNotifySmsEnabled] = useState(initial.notifySmsEnabled);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.patchSettings({
        decisionPendingDays,
        scanStuckDays,
        returnGraceDays,
        storageCapacityTb,
        storageLabel,
        storageRoot,
        storageUsedTb,
        notifyEmailEnabled,
        notifySmsEnabled,
        expectedRevision: initial.revision,
      }),
    onSuccess: onSaved,
    onError: (e) => {
      if (e instanceof ApiRequestError && e.status === 409) onConflict();
    },
  });

  return (
    <form
      className="p-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <FormError message={mutation.isError ? mutation.error.message : null} />
      {mutation.isSuccess && (
        <div className="px-3 py-2.5 bg-accent-soft border border-line rounded-[6px] text-[12.5px] font-medium text-ink">
          Settings saved.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Decision pending alert (days)" hint="Lots waiting on a decision longer than this raise an alert.">
          <TextInput type="number" min={1} step={1} value={decisionPendingDays} onChange={(e) => setDecisionPendingDays(Number(e.target.value))} required />
        </Field>
        <Field label="Scan stuck alert (days)" hint="Digitize scans idle longer than this raise an alert.">
          <TextInput type="number" min={1} step={1} value={scanStuckDays} onChange={(e) => setScanStuckDays(Number(e.target.value))} required />
        </Field>
        <Field label="Return grace period (days)" hint="Days after the due date before a return counts as overdue.">
          <TextInput type="number" min={0} step={1} value={returnGraceDays} onChange={(e) => setReturnGraceDays(Number(e.target.value))} required />
        </Field>
        <Field label="Storage capacity (TB)" hint="Total masters capacity; drives the storage meter.">
          <TextInput type="number" min={1} step={0.5} value={storageCapacityTb} onChange={(e) => setStorageCapacityTb(Number(e.target.value))} required />
        </Field>
        <Field label="Storage status label" hint="Shown in the sidebar, e.g. which store is reachable.">
          <TextInput value={storageLabel} onChange={(e) => setStorageLabel(e.target.value)} required />
        </Field>
        <Field label="Storage root path" hint="File-server root shown in the sidebar.">
          <TextInput value={storageRoot} onChange={(e) => setStorageRoot(e.target.value)} required />
        </Field>
        <Field label="Storage used (TB)" hint="Manually maintained until the storage-inventory job exists.">
          <TextInput type="number" min={0} step={0.1} value={storageUsedTb} onChange={(e) => setStorageUsedTb(Number(e.target.value))} required />
        </Field>
      </div>
      <Checkbox label="Email notifications enabled" checked={notifyEmailEnabled} onChange={(e) => setNotifyEmailEnabled(e.target.checked)} />
      <Checkbox label="SMS notifications enabled" checked={notifySmsEnabled} onChange={(e) => setNotifySmsEnabled(e.target.checked)} />
      <div className="flex items-center gap-2.5">
        <PrimaryButton disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save settings'}
        </PrimaryButton>
        <span className="text-[11.5px] text-ink-3">
          Revision {initial.revision}
          {initial.updatedBy ? ` · last changed by ${initial.updatedBy}` : ''}
        </span>
      </div>
    </form>
  );
}
