'use client';

import { useReferenceList } from '@/hooks/useReferenceList';
import { useUserPicker } from '@/hooks/useUserPicker';
import { Field, GhostButton, Select, TextInput } from '@/components/ui/Form';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/primitives';

export interface LotFilters {
  q: string;
  stage: string;
  decision: string;
  format: string;
  dataType: string;
  receiver: string;
  returnStatus: string;
  sort: string;
  receivedFrom: string;
  receivedTo: string;
}

export const EMPTY_FILTERS: LotFilters = {
  q: '',
  stage: '',
  decision: '',
  format: '',
  dataType: '',
  receiver: '',
  returnStatus: '',
  sort: '-dateReceived',
  receivedFrom: '',
  receivedTo: '',
};

export function RegisterFilters({
  filters,
  onChange,
  lockedFormat,
}: {
  filters: LotFilters;
  onChange: (next: LotFilters) => void;
  /** Format block the list was opened from: dropdown locked to that one format. */
  lockedFormat?: string;
}) {
  const set = (k: keyof LotFilters) => (v: string) => onChange({ ...filters, [k]: v });
  const stages = useReferenceList('stage');
  const decisions = useReferenceList('decision');
  const formats = useReferenceList('format');
  const dataTypes = useReferenceList('dataType');
  const returnStatuses = useReferenceList('returnStatus');
  const receivers = useUserPicker();
  const isActive =
    filters.q !== '' ||
    filters.stage !== '' ||
    filters.decision !== '' ||
    filters.format !== '' ||
    filters.dataType !== '' ||
    filters.receiver !== '' ||
    filters.returnStatus !== '' ||
    filters.receivedFrom !== '' ||
    filters.receivedTo !== '';

  return (
    <div className="bg-surface border border-line rounded-[8px] p-3 md:p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <Field label="Search">
            <TextInput
              value={filters.q}
              onChange={(e) => set('q')(e.target.value)}
              placeholder="Owner, phone, lot ref, place, remarks…"
              aria-label="Search lots"
            />
          </Field>
        </div>
        <Field label="Stage">
          <Select value={filters.stage} onChange={(e) => set('stage')(e.target.value)}>
            <option value="">All stages</option>
            {(stages.data?.items ?? []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Decision">
          <Select value={filters.decision} onChange={(e) => set('decision')(e.target.value)}>
            <option value="">All decisions</option>
            {(decisions.data?.items ?? []).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format">
          <Select
            value={lockedFormat ?? filters.format}
            disabled={Boolean(lockedFormat)}
            onChange={(e) => set('format')(e.target.value)}
            aria-label="Format"
          >
            {lockedFormat ? null : <option value="">All formats</option>}
            {(formats.data?.items ?? [])
              .filter((f) => !lockedFormat || f.value === lockedFormat)
              .map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Data type">
          <Select value={filters.dataType} onChange={(e) => set('dataType')(e.target.value)}>
            <option value="">Physical + digital</option>
            {(dataTypes.data?.items ?? []).map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Receiver">
          {receivers.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : receivers.isError || !receivers.data || receivers.data.users.length === 0 ? (
            <TextInput
              value={filters.receiver}
              onChange={(e) => set('receiver')(e.target.value)}
              placeholder="User id"
              aria-label="Receiver user id"
            />
          ) : (
            <Select
              value={filters.receiver}
              onChange={(e) => set('receiver')(e.target.value)}
              aria-label="Receiver"
            >
              <option value="">All receivers</option>
              {receivers.data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {filters.receiver &&
              !receivers.data.users.some((u) => u.id === filters.receiver) ? (
                <option value={filters.receiver}>{filters.receiver}</option>
              ) : null}
            </Select>
          )}
        </Field>
        <Field label="Return status">
          <Select value={filters.returnStatus} onChange={(e) => set('returnStatus')(e.target.value)}>
            <option value="">Any return status</option>
            {(returnStatuses.data?.items ?? []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received from">
          <DatePicker
            value={filters.receivedFrom}
            onChange={set('receivedFrom')}
            aria-label="Received from date"
          />
        </Field>
        <Field label="Received to">
          <DatePicker
            value={filters.receivedTo}
            onChange={set('receivedTo')}
            aria-label="Received to date"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <div className="w-[170px] shrink-0">
          <Field label="Sort">
            <Select
              className="h-8 text-[12px] px-2 pr-6"
              value={filters.sort}
              onChange={(e) => set('sort')(e.target.value)}
            >
              <option value="-dateReceived">Newest first</option>
              <option value="dateReceived">Oldest first</option>
              <option value="-quantity">Largest first</option>
              <option value="quantity">Smallest first</option>
              <option value="stage">By stage</option>
              <option value="-stage">By stage (desc)</option>
            </Select>
          </Field>
        </div>
        {isActive ? (
          <div className="ml-auto">
            <GhostButton
              onClick={() =>
                onChange({
                  ...EMPTY_FILTERS,
                  // Clearing filters must never drop the block's format lock.
                  ...(lockedFormat ? { format: lockedFormat } : {}),
                  sort: filters.sort,
                })
              }
            >
              Clear filters
            </GhostButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
