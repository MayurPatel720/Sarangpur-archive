'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useCan } from '@/hooks/useCan';
import type { ReferenceLookupResponse } from '@/types/admin';
import { Field, FormError, GhostButton, PrimaryButton, Select, TextInput } from './Form';
import { Skeleton } from './primitives';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { IconPlus } from './icons';

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function metaLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Reference-list select with an admin-only inline "create value" button.
 * `listKey === null` renders free text (lists without a fixed vocabulary);
 * `undefined` renders a loading skeleton (parent list still resolving).
 */
export function RefSelect({
  listKey,
  value,
  onChange,
  id,
  ariaLabel,
  autoFocus,
  placeholder = 'Select…',
  createLabel,
}: {
  listKey: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  placeholder?: string;
  /** Enables the admin-only inline create button, e.g. 'sub-type'. */
  createLabel?: string;
}) {
  // Always call the hook (dummy key) so hook order never depends on listKey.
  const { data, isLoading, isError } = useReferenceList(listKey ?? 'format');
  const canCreate = useCan('lists:manage');
  const [creating, setCreating] = useState(false);

  if (listKey === null) {
    return (
      <TextInput
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  if (listKey === undefined || isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (isError || !data) {
    return (
      <TextInput
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  const showCreate = Boolean(createLabel) && canCreate;
  const known = data.items.some((i) => i.value === value);

  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="flex-1 min-w-0">
        <Select
          id={id}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {!known && value ? <option value={value}>{value}</option> : null}
          {data.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </span>
      {showCreate ? (
        <IconButton label={`Add ${createLabel}`} onClick={() => setCreating(true)}>
          <IconPlus size={14} />
        </IconButton>
      ) : null}
      {creating && createLabel ? (
        <CreateValueDialog
          listKey={listKey}
          listLabel={data.label}
          what={createLabel}
          onClose={() => setCreating(false)}
          onCreated={onChange}
        />
      ) : null}
    </span>
  );
}

/**
 * Admin-only dialog that appends one value to a reference list.
 * Read-modify-write through the existing full-replace PATCH with a single
 * 409 retry (someone else saved meanwhile).
 */
function CreateValueDialog({
  listKey,
  listLabel,
  what,
  onClose,
  onCreated,
}: {
  listKey: string;
  listLabel: string;
  what: string;
  onClose: () => void;
  onCreated: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const lists = useQuery({ queryKey: queryKeys.admin.lists(), queryFn: adminApi.lists });
  const list = lists.data?.lists.find((l) => l.key === listKey);
  const metaSchema = list?.metaSchema ?? [];

  const create = useMutation({
    mutationFn: async () => {
      const fresh = await adminApi.lists();
      const target = fresh.lists.find((l) => l.key === listKey);
      if (!target) throw new Error('That vocabulary list no longer exists.');
      if (target.tier === 'system') {
        throw new Error('System list values are managed on the Admin → Lists page.');
      }
      const trimmed = label.trim();
      const value = slugify(trimmed);
      if (!value) throw new Error('Enter a label with at least one letter or number.');
      if (target.items.some((i) => i.value === value)) {
        throw new Error(`"${value}" already exists in ${target.label}.`);
      }
      const itemMeta: Record<string, unknown> = {};
      for (const f of target.metaSchema) {
        const raw = meta[f.field]?.trim() ?? '';
        if (f.required && !raw) throw new Error(`${metaLabel(f.field)} is required for a new value.`);
        if (!raw) continue;
        if (f.type === 'number') {
          const n = Number(raw);
          if (Number.isNaN(n)) throw new Error(`${metaLabel(f.field)} must be a number.`);
          itemMeta[f.field] = n;
        } else if (f.type === 'boolean') {
          itemMeta[f.field] = raw === 'true' || raw === 'on';
        } else {
          itemMeta[f.field] = raw;
        }
      }
      const maxOrder = target.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      const item = {
        value,
        label: trimmed,
        active: true,
        sortOrder: maxOrder + 1,
        meta: itemMeta,
      };
      const patchItems = (items: typeof target.items) => [
        ...items.map(({ value: v, label: l, active, sortOrder, meta: m }) => ({
          value: v,
          label: l,
          active,
          sortOrder,
          meta: (m ?? {}) as Record<string, unknown>,
        })),
        item,
      ];
      try {
        await adminApi.patchList(listKey, {
          items: patchItems(target.items),
          expectedRevision: target.revision,
        });
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 409) {
          const again = await adminApi.lists();
          const t2 = again.lists.find((l) => l.key === listKey);
          if (!t2) throw e;
          await adminApi.patchList(listKey, {
            items: patchItems(t2.items),
            expectedRevision: t2.revision,
          });
        } else {
          throw e;
        }
      }
      return item;
    },
    onSuccess: (item) => {
      queryClient.setQueryData<ReferenceLookupResponse>(
        queryKeys.reference.byKey(listKey),
        (old) =>
          old
            ? {
                ...old,
                items: [...old.items, { value: item.value, label: item.label, sortOrder: item.sortOrder, meta: item.meta }]
                  .sort((a, b) => a.sortOrder - b.sortOrder),
              }
            : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.reference.byKey(listKey) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.lists() });
      onCreated(item.value);
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add the value.'),
  });

  const slugPreview = slugify(label);

  return (
    <Dialog title={`Add ${what}`} subtitle={listLabel} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <FormError message={error} />
        <Field
          label="Label"
          hint={
            slugPreview
              ? `Stored as value: ${slugPreview}`
              : 'The stored value is the lowercased label with spaces as underscores.'
          }
        >
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            maxLength={120}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Manuscript bundle"
          />
        </Field>
        {metaSchema.map((f) => (
          <Field key={f.field} label={metaLabel(f.field)} hint={f.required ? 'Required' : undefined}>
            {f.type === 'boolean' ? (
              <Select value={meta[f.field] ?? ''} onChange={(e) => setMeta({ ...meta, [f.field]: e.target.value })}>
                <option value="">—</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            ) : (
              <TextInput
                type={f.type === 'number' ? 'number' : 'text'}
                value={meta[f.field] ?? ''}
                onChange={(e) => setMeta({ ...meta, [f.field]: e.target.value })}
                autoComplete="off"
              />
            )}
          </Field>
        ))}
        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={create.isPending || lists.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Sub-type cell: resolves the format's `subtypeListKey` and delegates to
 * `RefSelect` (free text for formats without a vocabulary list).
 */
export function SubtypeCell({
  format,
  value,
  onChange,
  id,
  ariaLabel,
  autoFocus,
}: {
  format: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const formats = useReferenceList('format');
  const formatItem = formats.data?.items.find((f) => f.value === format);
  const rawKey = formatItem?.meta.subtypeListKey;
  const listKey =
    formats.isLoading || !formatItem
      ? undefined
      : typeof rawKey === 'string' && rawKey.trim()
        ? rawKey
        : null;

  return (
    <RefSelect
      listKey={listKey}
      value={value}
      onChange={onChange}
      id={id}
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
      placeholder={listKey === null ? 'e.g. Manuscript bundle' : 'Select a sub-type…'}
      createLabel="sub-type"
    />
  );
}
