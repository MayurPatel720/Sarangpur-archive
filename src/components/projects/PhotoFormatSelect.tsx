'use client';

import { FORMATS, FORMAT_LABELS, type Format } from '@/lib/domain';
import { Select } from '@/components/ui/Form';

/** Optional media-format tag for a project photo ("No tag" = null). */
export function PhotoFormatSelect({
  value,
  onChange,
  disabled,
  label = 'Format tag',
}: {
  value: Format | null;
  onChange: (next: Format | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as Format))}
    >
      <option value="">No format tag</option>
      {FORMATS.map((f) => (
        <option key={f} value={f}>
          {FORMAT_LABELS[f]}
        </option>
      ))}
    </Select>
  );
}
