'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { Panel, PanelHeader, Skeleton, ErrorState, Badge } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton, FormError } from '@/components/ui/Form';
import type { AdminReferenceList, AdminListItem, ListCreateBody, ListMetaField } from '@/types/admin';

type EditableItem = {
  value: string;
  label: string;
  active: boolean;
  sortOrder: number;
  meta: Record<string, unknown>;
};

function toEditable(items: AdminListItem[]): EditableItem[] {
  return items.map((i) => ({
    value: i.value,
    label: i.label,
    active: i.active,
    sortOrder: i.sortOrder,
    meta: (i.meta ?? {}) as Record<string, unknown>,
  }));
}

export function ListsManager() {
  const canManage = useCan('lists:manage');
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const lists = useQuery({
    queryKey: queryKeys.admin.lists(),
    queryFn: adminApi.lists,
    enabled: canManage,
  });

  const fallbackKey = lists.data?.lists[0]?.key ?? null;
  const activeKey = selectedKey ?? fallbackKey;
  const selected = lists.data?.lists.find((l) => l.key === activeKey) ?? null;

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.lists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.reference.all });
  };

  if (!canManage) {
    return (
      <Panel>
        <ErrorState message="You don't have access to reference lists." hint="Ask an administrator for the lists:manage permission." />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <Panel className="w-full lg:w-[300px] flex-shrink-0">
        <PanelHeader title="Vocabularies">
          <span className="ml-auto" />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-9 px-3.5 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[12.5px] font-semibold cursor-pointer"
          >
            New list
          </button>
        </PanelHeader>
        {lists.isPending ? (
          <div className="p-4 flex flex-col gap-2.5">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : lists.isError ? (
          <ErrorState message="Couldn't load vocabularies." hint={lists.error.message} onRetry={() => lists.refetch()} />
        ) : (
          <ul className="m-0 p-2 list-none flex flex-col gap-0.5">
            {lists.data.lists.map((l) => (
              <li key={l.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(l.key)}
                  className={`w-full min-h-[44px] px-2.5 rounded-md flex items-center gap-2.5 text-left cursor-pointer border-0 transition-colors ${
                    l.key === activeKey
                      ? 'bg-accent-soft text-ink'
                      : 'bg-transparent text-ink-2 hover:bg-rail-control'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{l.label}</span>
                    <span className="block text-[11px] text-ink-3 truncate">
                      {l.group} · {l.items.length} items
                    </span>
                  </span>
                  {l.tier === 'system' ? (
                    <Badge severity="info">System</Badge>
                  ) : l.protected ? (
                    <Badge severity="neutral">Seeded</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ListDetail
        key={selected?.key ?? 'empty'}
        list={selected}
        onChanged={invalidateAll}
      />

      {creating && (
        <CreateListDialog
          onClose={() => setCreating(false)}
          onSaved={(key) => {
            setCreating(false);
            setSelectedKey(key);
            invalidateAll();
          }}
        />
      )}
    </div>
  );
}

function metaLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function ListDetail({ list, onChanged }: { list: AdminReferenceList | null; onChanged: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(list?.label ?? '');
  const [group, setGroup] = useState(list?.group ?? '');
  const [items, setItems] = useState<EditableItem[]>(list ? toEditable(list.items) : []);
  const [metaSchema, setMetaSchema] = useState(list?.metaSchema ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMeta, setNewMeta] = useState<Record<string, string>>({});
  const [schemaDraft, setSchemaDraft] = useState({ field: '', type: 'string' as 'string' | 'number' | 'boolean' });

  const save = useMutation({
    mutationFn: () => {
      if (!list) throw new Error('No list selected.');
      return adminApi.patchList(list.key, {
        label: label.trim(),
        group: group.trim(),
        metaSchema,
        items: items.map((i) => ({
          value: i.value,
          label: i.label.trim(),
          active: i.active,
          sortOrder: i.sortOrder,
          meta: i.meta,
        })),
        expectedRevision: list.revision,
      });
    },
    onSuccess: () => {
      toast.success('List saved', list ? `${list.label} is up to date.` : undefined);
      onChanged();
    },
    onError: (e) => toast.error('Couldn’t save list', e.message),
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!list) throw new Error('No list selected.');
      return adminApi.deleteList(list.key);
    },
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success('List deleted', list ? `${list.label} was removed.` : undefined);
      onChanged();
    },
    onError: (e) => toast.error('Couldn’t delete list', e.message),
  });

  if (!list) {
    return (
      <Panel className="flex-1 w-full">
        <ErrorState message="No vocabularies yet." hint="Create the first list to get started." />
      </Panel>
    );
  }

  const patchItem = (value: string, patch: Partial<EditableItem>) =>
    setItems((arr) => arr.map((i) => (i.value === value ? { ...i, ...patch } : i)));

  const patchItemMeta = (value: string, field: string, raw: string, type: ListMetaField['type']) =>
    setItems((arr) =>
      arr.map((i) => {
        if (i.value !== value) return i;
        const meta = { ...i.meta };
        if (raw === '') {
          delete meta[field];
        } else if (type === 'number') {
          meta[field] = Number(raw);
        } else if (type === 'boolean') {
          meta[field] = raw === 'true' || raw === 'on';
        } else {
          meta[field] = raw;
        }
        return { ...i, meta };
      }),
    );

  const metaRaw = (m: EditableItem['meta'], field: string): string => {
    const v = m[field];
    if (v === undefined || v === null) return '';
    return String(v);
  };

  // usageCount is server-owned; look it up from the last fetched list.
  const usageByValue = new Map(list.items.map((o) => [o.value, o.usageCount] as const));

  const isSystem = list.tier === 'system';
  const isProtected = list.protected || isSystem;

  const addItem = () => {
    const v = newValue.trim();
    if (!v || items.some((i) => i.value === v)) return;
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
    const meta: Record<string, unknown> = {};
    for (const f of metaSchema) {
      const raw = newMeta[f.field]?.trim() ?? '';
      if (raw === '') continue;
      meta[f.field] = f.type === 'number' ? Number(raw) : f.type === 'boolean' ? raw === 'true' || raw === 'on' : raw;
    }
    setItems((arr) => [...arr, { value: v, label: newLabel.trim() || v, active: true, sortOrder: maxOrder + 1, meta }]);
    setNewValue('');
    setNewLabel('');
    setNewMeta({});
  };

  const addSchemaField = () => {
    const field = schemaDraft.field.trim();
    if (!field || metaSchema.some((f) => f.field === field)) return;
    setMetaSchema((arr) => [...arr, { field, type: schemaDraft.type, required: false, unique: false }]);
    setSchemaDraft({ field: '', type: 'string' });
  };

  const removeSchemaField = (field: string) => {
    setMetaSchema((arr) => arr.filter((f) => f.field !== field));
    setItems((arr) =>
      arr.map((i) => {
        if (!(field in i.meta)) return i;
        const meta = { ...i.meta };
        delete meta[field];
        return { ...i, meta };
      }),
    );
    setNewMeta((m) => {
      if (!(field in m)) return m;
      const next = { ...m };
      delete next[field];
      return next;
    });
  };

  const patchSchemaField = (field: string, patch: Partial<ListMetaField>) => {
    setMetaSchema((arr) => arr.map((f) => (f.field === field ? { ...f, ...patch } : f)));
  };

  return (
    <Panel className="flex-1 w-full min-w-0">
      <PanelHeader title={list.label}>
        <span className="ml-2 text-[11px] font-semibold text-ink-3 truncate">{list.key}</span>
        {isSystem && <Badge severity="info">System</Badge>}
        {!isSystem && list.protected && <Badge severity="neutral">Seeded</Badge>}
      </PanelHeader>
      <div className="p-4 flex flex-col gap-4">
        <FormError message={save.isError ? save.error.message : null} />
        {isSystem && (
          <p className="m-0 text-[12px] text-ink-2 bg-surface border border-line-soft rounded-[6px] px-3 py-2">
            System list — labels, sort order, active flags and item meta are editable; item values are immutable.
            Deactivate a value to retire it.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Label">
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Group">
            <TextInput value={group} onChange={(e) => setGroup(e.target.value)} required maxLength={60} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-2">Meta fields · {metaSchema.length}</span>
          {metaSchema.map((f) => (
            <div key={f.field} className="border border-line-soft rounded-[6px] px-3 py-2 flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] font-semibold text-ink min-w-[120px]">{f.field}</span>
              <span className="text-[11px] text-ink-3 uppercase tracking-wide">{f.type}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => patchSchemaField(f.field, { required: e.target.checked })}
                  className="w-3.5 h-3.5 accent-accent cursor-pointer"
                />
                <span className="text-[12px] text-ink-2">Required</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.unique}
                  onChange={(e) => patchSchemaField(f.field, { unique: e.target.checked })}
                  className="w-3.5 h-3.5 accent-accent cursor-pointer"
                />
                <span className="text-[12px] text-ink-2">Unique</span>
              </label>
              <span className="flex-1" />
              <GhostButton onClick={() => removeSchemaField(f.field)}>Remove</GhostButton>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <TextInput
              aria-label="New meta field name"
              placeholder="field name"
              value={schemaDraft.field}
              onChange={(e) => setSchemaDraft((s) => ({ ...s, field: e.target.value }))}
              maxLength={40}
              className="flex-1 min-w-[140px]"
            />
            <Select
              aria-label="New meta field type"
              value={schemaDraft.type}
              onChange={(e) =>
                setSchemaDraft((s) => ({ ...s, type: e.target.value as typeof schemaDraft.type }))
              }
              className="w-[110px]"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </Select>
            <GhostButton onClick={addSchemaField} disabled={!schemaDraft.field.trim()}>
              Add meta field
            </GhostButton>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-2">Items · {items.length}</span>
          {items.map((i) => (
            <div key={i.value} className="border border-line-soft rounded-[6px] px-3 py-2 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="sm:w-[180px] flex-shrink-0 min-w-0">
                  <p className="m-0 text-[12.5px] font-semibold text-ink truncate" title={i.value}>{i.value}</p>
                </div>
                <TextInput
                  aria-label={`Label for ${i.value}`}
                  value={i.label}
                  onChange={(e) => patchItem(i.value, { label: e.target.value })}
                  maxLength={120}
                  className="flex-1"
                />
                <TextInput
                  aria-label={`Sort order for ${i.value}`}
                  type="number"
                  value={i.sortOrder}
                  onChange={(e) => patchItem(i.value, { sortOrder: Number(e.target.value) })}
                  className="sm:w-[90px]"
                />
                <label className="flex items-center gap-2 cursor-pointer flex-shrink-0 min-h-[44px] sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={i.active}
                    onChange={(e) => patchItem(i.value, { active: e.target.checked })}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                  <span className="text-[12.5px] text-ink-2">Active</span>
                </label>
                {(usageByValue.get(i.value) ?? 0) > 0 && (
                  <Badge severity="info">Used ×{usageByValue.get(i.value) ?? 0}</Badge>
                )}
              </div>
              {metaSchema.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-1">
                  {metaSchema.map((f) => (
                    <label key={f.field} className="flex items-center gap-1.5 min-w-[140px]">
                      <span className="text-[11px] text-ink-3 w-[90px] shrink-0">{metaLabel(f.field)}</span>
                      {f.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={i.meta[f.field] === true}
                          onChange={(e) => patchItemMeta(i.value, f.field, e.target.checked ? 'true' : '', 'boolean')}
                          className="w-4 h-4 accent-accent cursor-pointer"
                          aria-label={`${metaLabel(f.field)} for ${i.value}`}
                        />
                      ) : (
                        <TextInput
                          aria-label={`${metaLabel(f.field)} for ${i.value}`}
                          type={f.type === 'number' ? 'number' : 'text'}
                          value={metaRaw(i.meta, f.field)}
                          onChange={(e) => patchItemMeta(i.value, f.field, e.target.value, f.type)}
                          className="flex-1"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {!isSystem && (
          <div className="flex flex-col gap-2 border border-line-soft rounded-[6px] p-3">
            <span className="text-[12px] font-semibold text-ink-2">Add item</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <TextInput aria-label="New item value" placeholder="value (immutable once added)" value={newValue} onChange={(e) => setNewValue(e.target.value)} maxLength={80} autoComplete="off" className="flex-1" />
              <TextInput aria-label="New item label" placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} autoComplete="off" className="flex-1" />
            </div>
            {metaSchema.map((f) => (
              <div key={f.field} className="flex items-center gap-2">
                <span className="text-[11px] text-ink-3 w-[90px] shrink-0">{metaLabel(f.field)}</span>
                {f.type === 'boolean' ? (
                  <Select
                    aria-label={`${metaLabel(f.field)} for new item`}
                    value={newMeta[f.field] ?? ''}
                    onChange={(e) => setNewMeta((m) => ({ ...m, [f.field]: e.target.value }))}
                    className="flex-1"
                  >
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                ) : (
                  <TextInput
                    aria-label={`${metaLabel(f.field)} for new item`}
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={newMeta[f.field] ?? ''}
                    onChange={(e) => setNewMeta((m) => ({ ...m, [f.field]: e.target.value }))}
                    className="flex-1"
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end">
              <GhostButton onClick={addItem} disabled={!newValue.trim()}>Add item</GhostButton>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save list'}
          </PrimaryButton>
          <span className="text-[11.5px] text-ink-3">Revision {list.revision} · optimistic locking</span>
          <span className="flex-1" />
          {isProtected ? (
            <span className="text-[12px] text-ink-3">Protected — cannot be deleted.</span>
          ) : !confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-10 px-4 bg-surface border border-danger-line rounded-[6px] text-[13px] font-semibold text-danger cursor-pointer"
            >
              Delete list
            </button>
          ) : (
            <>
              <span className="text-[12px] text-ink-2">Seeded or in-use lists are protected.</span>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="h-10 px-4 bg-danger-mark border border-danger-mark rounded-[6px] text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60"
              >
                {remove.isPending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <GhostButton onClick={() => setConfirmDelete(false)}>Cancel</GhostButton>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CreateListDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (key: string) => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState('Custom');

  const mutation = useMutation({
    mutationFn: () => {
      const body: ListCreateBody = { key: key.trim(), label: label.trim(), group: group.trim() || 'Custom', metaSchema: [] };
      return adminApi.createList(body);
    },
    onSuccess: (res) => {
      toast.success('List created', res.list.label);
      onSaved(res.list.key);
    },
    onError: (e) => toast.error('Couldn’t create list', e.message),
  });

  return (
    <Dialog title="New vocabulary" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <FormError message={mutation.isError ? mutation.error.message : null} />
        <Field label="Key" hint="Lowercase, dot-namespaced (e.g. rights.type). Can't be renamed later.">
          <TextInput value={key} onChange={(e) => setKey(e.target.value)} required maxLength={80} autoFocus autoComplete="off" />
        </Field>
        <Field label="Label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Group">
          <TextInput value={group} onChange={(e) => setGroup(e.target.value)} maxLength={60} />
        </Field>
        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create list'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
