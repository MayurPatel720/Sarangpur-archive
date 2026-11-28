'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { Panel, PanelHeader, Skeleton, ErrorState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { Field, TextInput, Checkbox, PrimaryButton, GhostButton, Select, FormError } from '@/components/ui/Form';
import { FolderPicker } from './FolderPicker';

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
    photoStorageDriver: 'cloudinary' | 'disk';
    photoStorageRoot: string;
    photoStorageSource: 'settings' | 'environment';
    photoStorageLegacyRoots: string[];
    notifyEmailEnabled: boolean;
    notifySmsEnabled: boolean;
    revision: number;
    updatedBy: string | null;
  };
  onSaved: () => void;
  onConflict: () => void;
}) {
  const toast = useToast();
  const [decisionPendingDays, setDecisionPendingDays] = useState(initial.decisionPendingDays);
  const [scanStuckDays, setScanStuckDays] = useState(initial.scanStuckDays);
  const [returnGraceDays, setReturnGraceDays] = useState(initial.returnGraceDays);
  const [storageCapacityTb, setStorageCapacityTb] = useState(initial.storageCapacityTb);
  const [storageLabel, setStorageLabel] = useState(initial.storageLabel);
  const [storageRoot, setStorageRoot] = useState(initial.storageRoot);
  const [storageUsedTb, setStorageUsedTb] = useState(initial.storageUsedTb);
  const [photoDriver, setPhotoDriver] = useState(initial.photoStorageDriver);
  const [photoRoot, setPhotoRoot] = useState(initial.photoStorageRoot);
  const [browsing, setBrowsing] = useState(false);
  const folderTest = useMutation({ mutationFn: () => adminApi.testPhotoFolder(photoRoot) });
  const photoChanged = photoDriver !== initial.photoStorageDriver || photoRoot.trim() !== initial.photoStorageRoot;
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
        ...(photoChanged ? { photoStorageDriver: photoDriver, photoStorageRoot: photoRoot.trim() } : {}),
        notifyEmailEnabled,
        notifySmsEnabled,
        expectedRevision: initial.revision,
      }),
    onSuccess: () => {
      toast.success('Settings saved');
      onSaved();
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.status === 409) onConflict();
      toast.error('Couldn’t save settings', e instanceof ApiRequestError ? e.message : undefined);
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
        <Field label="Digitalization stuck alert (days)" hint="Lots idle in digitalization longer than this raise an alert.">
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
      <div className="flex flex-col gap-3 rounded-[10px] border border-line-soft bg-surface-subtle p-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[13px] font-semibold text-ink">Photo storage</h3>
          <p className="m-0 text-[12.5px] leading-relaxed text-ink-3">
            Where photos of items, lots, projects and tasks are saved. Changes apply straight away, with no restart.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Save photos in" hint={photoDriver === 'disk' ? 'On this server, in the folder below.' : 'In the cloud (Cloudinary). Its keys are set in the server settings file.'}>
            <Select value={photoDriver} onChange={(e) => setPhotoDriver(e.target.value as 'cloudinary' | 'disk')} aria-label="Where photos are saved">
              <option value="cloudinary">Cloud (Cloudinary)</option>
              <option value="disk">Our own server (a folder)</option>
            </Select>
          </Field>
        </div>
        {photoDriver === 'disk' ? (
          <div className="flex flex-col gap-2">
            <Field label="Photo folder" hint="A folder on this server, or a network path such as \\server\share\photos. The app needs permission to read and write there.">
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[220px] flex-1">
                  <TextInput value={photoRoot} onChange={(e) => { setPhotoRoot(e.target.value); folderTest.reset(); }} placeholder="Choose or type a folder" spellCheck={false} autoComplete="off" />
                </div>
                <GhostButton type="button" onClick={() => setBrowsing(true)}>Browse…</GhostButton>
                <GhostButton type="button" disabled={!photoRoot.trim() || folderTest.isPending} onClick={() => folderTest.mutate()}>
                  {folderTest.isPending ? 'Testing…' : 'Test folder'}
                </GhostButton>
              </div>
            </Field>
            {folderTest.data ? (
              <p
                role="status"
                className={`m-0 rounded-[6px] border px-3 py-2 text-[12.5px] font-medium ${folderTest.data.ok ? 'border-line bg-accent-soft text-ink' : 'border-danger-line bg-danger-bg text-danger'}`}
              >
                {folderTest.data.message}
              </p>
            ) : folderTest.isError ? (
              <p role="alert" className="m-0 text-[12.5px] font-medium text-danger">Couldn’t test the folder.</p>
            ) : null}
          </div>
        ) : null}
        {initial.photoStorageSource === 'environment' ? (
          <p className="m-0 text-[12px] text-ink-3">Right now this comes from the server settings file. Saving here overrides it.</p>
        ) : null}
        {initial.photoStorageLegacyRoots.length > 0 ? (
          <p className="m-0 text-[12px] leading-relaxed text-ink-3">
            Earlier folders still read, so older photos keep showing: <span className="font-mono">{initial.photoStorageLegacyRoots.join('  ·  ')}</span>
          </p>
        ) : null}
        {photoChanged ? (
          <p role="note" className="m-0 text-[12px] leading-relaxed text-warn">
            Photos already saved stay where they are, and the old location keeps being read. Only new photos go to the new place.
          </p>
        ) : null}
      </div>
      {browsing ? (
        <FolderPicker
          start={photoRoot}
          onPick={(path) => {
            setPhotoRoot(path);
            folderTest.reset();
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      ) : null}
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
