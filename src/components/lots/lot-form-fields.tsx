'use client';

import type { LotContactInput } from '@/types/lot';
import { useReferenceList } from '@/hooks/useReferenceList';
import { Field, Select, TextInput } from '@/components/ui/Form';
import { Skeleton } from '@/components/ui/primitives';

export const EMPTY_CONTACT: LotContactInput = { name: '' };

/* ---------------------------------------------------------- contact block */

export function ContactFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: LotContactInput;
  onChange: (next: LotContactInput) => void;
}) {
  const set = (k: keyof LotContactInput) => (v: string) =>
    onChange({ ...value, [k]: v });
  return (
    <fieldset className="m-0 p-0 border-0 min-w-0">
      <legend className="px-0 mb-2 text-[12px] font-semibold text-ink-3">
        {legend}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <TextInput
            value={value.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <Field label="Phone">
          <TextInput
            value={value.phone ?? ''}
            onChange={(e) => set('phone')(e.target.value)}
            placeholder="Optional"
            inputMode="tel"
          />
        </Field>
        <Field label="Email">
          <TextInput
            value={value.email ?? ''}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="Optional"
            inputMode="email"
          />
        </Field>
        <Field label="Address">
          <TextInput
            value={value.address ?? ''}
            onChange={(e) => set('address')(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------- media sub-type select */

/**
 * Tier-2 vocabulary field. Photo/video/audio offer the admin-managed
 * `mediaSubtype.<format>` list; documents/prasadi are free text (SPEC Q2).
 */
export function SubtypeField({
  format,
  value,
  onChange,
}: {
  format: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const needsList = format === 'photo' || format === 'video' || format === 'audio';
  const { data, isLoading, isError } = useReferenceList(
    needsList ? `mediaSubtype.${format}` : 'mediaSubtype.photo',
  );

  if (!needsList) {
    return (
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Manuscript bundle"
      />
    );
  }

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (isError || !data) {
    return (
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type the sub-type"
      />
    );
  }

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a sub-type…</option>
      {data.items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </Select>
  );
}

/* ------------------------------------------------------ rights type field */

export function RightsTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data, isLoading, isError } = useReferenceList('rightsType');

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (isError || !data || data.items.length === 0) {
    return (
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Deed of gift"
      />
    );
  }

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a rights type…</option>
      {data.items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </Select>
  );
}
