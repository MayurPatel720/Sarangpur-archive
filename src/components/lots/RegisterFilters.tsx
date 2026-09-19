'use client';

import { DATA_TYPES, DECISIONS, FORMATS, STAGES, STAGE_LABELS } from '@/lib/domain';
import { Field, GhostButton, Select, TextInput } from '@/components/ui/Form';

export interface LotFilters {
  q: string;
  stage: string;
  decision: string;
  format: string;
  dataType: string;
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
  sort: '-dateReceived',
  receivedFrom: '',
  receivedTo: '',
};

const DECISION_LABELS: Record<string, string> = {
  pending: 'Pending',
  archive: 'Archive',
  return: 'Return',
  discard: 'Discard',
};

export function RegisterFilters({
  filters,
  onChange,
}: {
  filters: LotFilters;
  onChange: (next: LotFilters) => void;
}) {
  const set = (k: keyof LotFilters) => (v: string) => onChange({ ...filters, [k]: v });
  const isActive =
    filters.q !== '' ||
    filters.stage !== '' ||
    filters.decision !== '' ||
    filters.format !== '' ||
    filters.dataType !== '' ||
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
              placeholder="Owner, lot ref or naming code…"
            />
          </Field>
        </div>
        <Field label="Stage">
          <Select value={filters.stage} onChange={(e) => set('stage')(e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Decision">
          <Select value={filters.decision} onChange={(e) => set('decision')(e.target.value)}>
            <option value="">All decisions</option>
            {DECISIONS.map((d) => (
              <option key={d} value={d}>
                {DECISION_LABELS[d] ?? d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format">
          <Select value={filters.format} onChange={(e) => set('format')(e.target.value)}>
            <option value="">All formats</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data type">
          <Select value={filters.dataType} onChange={(e) => set('dataType')(e.target.value)}>
            <option value="">Physical + digital</option>
            {DATA_TYPES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Received from">
          <TextInput
            type="date"
            value={filters.receivedFrom}
            onChange={(e) => set('receivedFrom')(e.target.value)}
          />
        </Field>
        <Field label="Received to">
          <TextInput
            type="date"
            value={filters.receivedTo}
            onChange={(e) => set('receivedTo')(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Field label="Sort">
          <Select value={filters.sort} onChange={(e) => set('sort')(e.target.value)}>
            <option value="-dateReceived">Newest first</option>
            <option value="dateReceived">Oldest first</option>
            <option value="-quantity">Largest first</option>
            <option value="quantity">Smallest first</option>
            <option value="stage">By stage</option>
            <option value="-stage">By stage (desc)</option>
          </Select>
        </Field>
        {isActive ? (
          <div className="ml-auto self-end">
            <GhostButton onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}>
              Clear filters
            </GhostButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
