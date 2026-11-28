'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { Badge, Panel, Skeleton, ErrorState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { TextInput, PrimaryButton, GhostButton, Select, FormError } from '@/components/ui/Form';
import { IconAlertCircle, IconAlertTriangle, IconCheckCircle, IconInfoCircle } from '@/components/ui/icons';
import { FolderPicker } from './FolderPicker';

/**
 * Admin → Settings. One page, two sections, each a card with the explanation on the left and the controls on the right
 * (stacked on phones): Alerts and Photo Storage. Every control has a visible label, helper text and an inline
 * error; the save bar stays in view, says when there are unsaved changes, and the page warns before it is left with edits.
 */

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
    <div className="flex max-w-[980px] flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] font-semibold tracking-[-0.022em] text-ink sm:text-[22px]">Archive Settings</h1>
        <p className="m-0 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-3">
          Alert limits and where photos are kept. Changes apply as soon as you save, with no restart.
        </p>
      </header>

      {settings.isPending ? (
        <div className="flex flex-col gap-4" aria-label="Loading settings">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : settings.isError ? (
        <Panel>
          <ErrorState message="Couldn't load settings." hint={settings.error.message} onRetry={() => settings.refetch()} />
        </Panel>
      ) : (
        <SettingsFields
          key={settings.data.settings.revision}
          initial={settings.data.settings}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.settings() })}
          onConflict={() => void settings.refetch()}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ building blocks */

/** A settings card: what it is on the left, the controls on the right; stacked on small screens. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const id = useId();
  return (
    <Panel>
      <section aria-labelledby={id} className="grid grid-cols-1 gap-x-8 gap-y-4 p-4 md:p-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <h2 id={id} className="m-0 text-[14px] font-semibold tracking-[-0.005em] text-ink">
            {title}
          </h2>
          <p className="m-0 text-[12.5px] leading-relaxed text-ink-3">{description}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </section>
    </Panel>
  );
}

/** Label + control + helper text + inline error, wired together for screen readers (label for, describedby, invalid). */
function Row({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean }) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="m-0 flex items-start gap-1.5 text-[12px] font-medium text-danger">
          <IconAlertCircle size={14} aria-hidden="true" className="mt-px flex-shrink-0" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="m-0 text-[12px] leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A number box with its unit inside it (days, TB), so the unit is never ambiguous. */
function NumberInput({
  unit,
  value,
  onChange,
  onBlur,
  step = 1,
  ...a11y
}: {
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  step?: number;
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean;
}) {
  return (
    <div className="relative w-full max-w-[220px]">
      <TextInput
        {...a11y}
        name={a11y.id}
        type="text"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="!h-11 scroll-mb-28 pr-14 text-right tabular-nums"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-ink-3">
        {unit}
      </span>
    </div>
  );
}

/** A note with an icon AND text (status is never colour alone). */
function Notice({ tone, children }: { tone: 'info' | 'warn' | 'danger' | 'good'; children: ReactNode }) {
  const style = {
    info: 'border-info-line bg-info-bg text-info',
    warn: 'border-warn-line bg-warn-bg text-warn',
    danger: 'border-danger-line bg-danger-bg text-danger',
    good: 'border-good-line bg-good-bg text-good',
  }[tone];
  const Icon = tone === 'danger' ? IconAlertCircle : tone === 'warn' ? IconAlertTriangle : tone === 'good' ? IconCheckCircle : IconInfoCircle;
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'note'}
      className={`m-0 flex items-start gap-2 rounded-[6px] border px-3 py-2.5 text-[12.5px] leading-relaxed ${style}`}
    >
      <Icon size={15} aria-hidden="true" className="mt-px flex-shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/* --------------------------------------------------------------------------- fields */

type Initial = {
  decisionPendingDays: number;
  scanStuckDays: number;
  photoStorageDriver: 'cloudinary' | 'disk';
  photoStorageRoot: string;
  photoStorageSource: 'settings' | 'environment';
  photoStorageLegacyRoots: string[];
  server: { os: string; name: string; hosted: boolean };
  revision: number;
  updatedBy: string | null;
};

const isWhole = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 1;

function SettingsFields({ initial, onSaved, onConflict }: { initial: Initial; onSaved: () => void; onConflict: () => void }) {
  const toast = useToast();
  const [decisionDays, setDecisionDays] = useState(String(initial.decisionPendingDays));
  const [scanDays, setScanDays] = useState(String(initial.scanStuckDays));
  const [photoDriver, setPhotoDriver] = useState(initial.photoStorageDriver);
  const [photoRoot, setPhotoRoot] = useState(initial.photoStorageRoot);
  const [errors, setErrors] = useState<{ decision?: string; scan?: string }>({});
  const [browsing, setBrowsing] = useState(false);

  const folderTest = useMutation({ mutationFn: () => adminApi.testPhotoFolder(photoRoot) });

  const photoChanged = photoDriver !== initial.photoStorageDriver || photoRoot.trim() !== initial.photoStorageRoot;
  const dirty =
    decisionDays.trim() !== String(initial.decisionPendingDays) ||
    scanDays.trim() !== String(initial.scanStuckDays) ||
    photoChanged;

  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const check = {
    decision: () => (isWhole(decisionDays) ? undefined : 'Enter a whole number of days, 1 or more.'),
    scan: () => (isWhole(scanDays) ? undefined : 'Enter a whole number of days, 1 or more.'),
  };
  const validateOne = (k: keyof typeof check) => setErrors((prev) => ({ ...prev, [k]: check[k]() }));

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.patchSettings({
        decisionPendingDays: Number(decisionDays),
        scanStuckDays: Number(scanDays),
        ...(photoChanged ? { photoStorageDriver: photoDriver, photoStorageRoot: photoRoot.trim() } : {}),
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

  const submit = () => {
    const next = { decision: check.decision(), scan: check.scan() };
    setErrors(next);
    const first = (['decision', 'scan'] as const).find((k) => next[k]);
    if (first) {
      document.getElementById({ decision: 'decisionPendingDays', scan: 'scanStuckDays' }[first])?.focus();
      return;
    }
    mutation.mutate();
  };

  const discard = () => {
    setDecisionDays(String(initial.decisionPendingDays));
    setScanDays(String(initial.scanStuckDays));
    setPhotoDriver(initial.photoStorageDriver);
    setPhotoRoot(initial.photoStorageRoot);
    setErrors({});
    folderTest.reset();
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* ------------------------------------------------------------------ alerts */}
      <Section title="Alerts" description="How long a lot can sit in a stage before it shows up in the dashboard's Alerts.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Row id="decisionPendingDays" label="Decision Pending" error={errors.decision} hint="Lots waiting for a decision longer than this raise an alert.">
            {(a) => <NumberInput {...a} unit="days" value={decisionDays} onChange={setDecisionDays} onBlur={() => validateOne('decision')} />}
          </Row>
          <Row id="scanStuckDays" label="Digitalization Stuck" error={errors.scan} hint="Lots sitting in digitalization longer than this raise an alert.">
            {(a) => <NumberInput {...a} unit="days" value={scanDays} onChange={setScanDays} onBlur={() => validateOne('scan')} />}
          </Row>
        </div>
      </Section>

      {/* --------------------------------------------------------------- photo storage */}
      <Section title="Photo Storage" description="Where photos of items, lots, projects and tasks are saved. Photos already saved stay where they are and keep showing.">
        <div className="flex flex-col gap-1.5">
          <Row
            id="photoStorageDriver"
            label="Save Photos In"
            hint={photoDriver === 'disk' ? 'On this server, in the folder below.' : 'In the cloud (Cloudinary). Its keys live in the server settings file.'}
          >
            {(a) => (
              <Select
                {...a}
                name="photoStorageDriver"
                value={photoDriver}
                onChange={(e) => setPhotoDriver(e.target.value as 'cloudinary' | 'disk')}
                className="!h-11 max-w-[320px]"
              >
                <option value="cloudinary">Cloud (Cloudinary)</option>
                <option value="disk">Our own server (a folder)</option>
              </Select>
            )}
          </Row>
          <p className="m-0 flex items-center gap-2 text-[12px] text-ink-3">
            Right now:
            <Badge severity="info">{initial.photoStorageDriver === 'disk' ? 'Our own server' : 'Cloud'}</Badge>
            <span>{initial.photoStorageSource === 'settings' ? 'set in this screen' : 'from the server settings file'}</span>
          </p>
        </div>

        {photoDriver === 'disk' && initial.server.hosted ? (
          <Notice tone="danger">
            This app is running on a cloud host. It has no permanent folder and cannot reach your PC or file server, so photos saved to a folder would be lost. Keep
            Cloud storage here, or open Settings from the app running on your own server.
          </Notice>
        ) : null}

        {photoDriver === 'disk' ? (
          <div className="flex flex-col gap-3">
            <Row
              id="photoStorageRoot"
              label="Photo Folder"
              hint={
                <>
                  A folder on this server, or a network path such as <span className="font-mono">\\server\share\photos</span>. The app needs permission to read and
                  write there.
                </>
              }
            >
              {(a) => (
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-[220px] flex-1">
                    <TextInput
                      {...a}
                      name="photoStorageRoot"
                      value={photoRoot}
                      onChange={(e) => {
                        setPhotoRoot(e.target.value);
                        folderTest.reset();
                      }}
                      placeholder="Choose or type a folder…"
                      spellCheck={false}
                      autoComplete="off"
                      className="!h-11 scroll-mb-28 font-mono !text-[12.5px]"
                    />
                  </div>
                  <GhostButton type="button" className="!h-11" onClick={() => setBrowsing(true)}>
                    Browse…
                  </GhostButton>
                  <GhostButton type="button" className="!h-11" disabled={!photoRoot.trim() || folderTest.isPending} onClick={() => folderTest.mutate()}>
                    {folderTest.isPending ? 'Testing…' : 'Test Folder'}
                  </GhostButton>
                </div>
              )}
            </Row>
            <div aria-live="polite">
              {folderTest.data ? (
                <Notice tone={folderTest.data.ok ? 'good' : 'danger'}>{folderTest.data.message}</Notice>
              ) : folderTest.isError ? (
                <Notice tone="danger">Couldn’t test the folder. Check your connection and try again.</Notice>
              ) : null}
            </div>
          </div>
        ) : null}

        {initial.photoStorageSource === 'environment' ? (
          <Notice tone="info">This comes from the server settings file for now. Saving a choice here overrides it.</Notice>
        ) : null}
        {initial.photoStorageLegacyRoots.length > 0 ? (
          <Notice tone="info">
            Earlier folders are still read, so older photos keep showing: <span className="font-mono">{initial.photoStorageLegacyRoots.join('  ·  ')}</span>
          </Notice>
        ) : null}
        {photoChanged ? (
          <Notice tone="warn">Only new photos go to the new place. Photos already saved stay where they are, and the old location keeps being read.</Notice>
        ) : null}
      </Section>

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

      {/* ----------------------------------------------------------------- save bar */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t border-line bg-surface/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <FormError message={mutation.isError ? mutation.error.message : null} />
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="m-0 min-w-0 flex-1 text-[12.5px] text-ink-3">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-warn">
                <IconAlertTriangle size={14} aria-hidden="true" />
                You have unsaved changes.
              </span>
            ) : (
              <>
                All changes saved · revision {initial.revision}
                {initial.updatedBy ? ` · last changed by ${initial.updatedBy}` : ''}
              </>
            )}
          </p>
          <GhostButton type="button" className="!h-11" disabled={!dirty || mutation.isPending} onClick={discard}>
            Discard Changes
          </GhostButton>
          <PrimaryButton className="!h-11 min-w-[140px]" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </PrimaryButton>
        </div>
      </div>
    </form>
  );
}
