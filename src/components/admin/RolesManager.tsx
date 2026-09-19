'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan } from '@/hooks/useCan';
import { PERMISSIONS } from '@/server/permissions';
import type { Permission } from '@/server/permissions';
import { Panel, PanelHeader, Skeleton, ErrorState, Badge } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextInput, Checkbox, PrimaryButton, GhostButton, FormError } from '@/components/ui/Form';
import type { AdminRole, RoleCreateBody } from '@/types/admin';

export function RolesManager() {
  const canManage = useCan('roles:manage');
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const roles = useQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: adminApi.roles,
    enabled: canManage,
  });

  const selected = roles.data?.roles.find((r) => r.key === selectedKey) ?? null;

  if (!canManage) {
    return (
      <Panel>
        <ErrorState message="You don't have access to role management." hint="Ask an administrator for the roles:manage permission." />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <Panel className="w-full lg:w-[300px] flex-shrink-0">
        <PanelHeader title="Roles">
          <span className="ml-auto" />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-9 px-3.5 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[12.5px] font-semibold cursor-pointer"
          >
            New role
          </button>
        </PanelHeader>
        {roles.isPending ? (
          <div className="p-4 flex flex-col gap-2.5">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : roles.isError ? (
          <ErrorState message="Couldn't load roles." hint={roles.error.message} onRetry={() => roles.refetch()} />
        ) : (
          <ul className="m-0 p-2 list-none flex flex-col gap-0.5">
            {roles.data.roles.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(r.key)}
                  className={`w-full min-h-[44px] px-2.5 rounded-md flex items-center gap-2.5 text-left cursor-pointer border-0 transition-colors ${
                    selectedKey === r.key || (!selectedKey && r.key === roles.data.roles[0]?.key)
                      ? 'bg-accent-soft text-ink'
                      : 'bg-transparent text-ink-2 hover:bg-rail-control'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{r.label}</span>
                    <span className="block text-[11px] text-ink-3 truncate">
                      {r.key} · {r.permissions.length} permissions
                    </span>
                  </span>
                  {!r.active && <Badge severity="neutral">Off</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RoleDetail
        key={selected?.key ?? roles.data?.roles[0]?.key ?? 'empty'}
        role={selected ?? roles.data?.roles[0] ?? null}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
        }}
      />

      {creating && (
        <CreateRoleDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.admin.roles() });
          }}
        />
      )}
    </div>
  );
}

function RoleDetail({ role, onSaved }: { role: AdminRole | null; onSaved: () => void }) {
  const [label, setLabel] = useState(role?.label ?? '');
  const [active, setActive] = useState(role?.active ?? true);
  const [grants, setGrants] = useState<Permission[]>((role?.permissions ?? []) as Permission[]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!role) throw new Error('No role selected.');
      return adminApi.patchRole(role.key, {
        label: label.trim(),
        permissions: grants,
        active,
        expectedRevision: role.revision,
      });
    },
    onSuccess: onSaved,
  });

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of PERMISSIONS) {
      const group = p.split(':')[0] ?? p;
      const list = map.get(group) ?? [];
      list.push(p);
      map.set(group, list);
    }
    return [...map.entries()];
  }, []);

  if (!role) {
    return (
      <Panel className="flex-1 w-full">
        <ErrorState message="No roles yet." hint="Create the first role to get started." />
      </Panel>
    );
  }

  const toggle = (p: Permission) =>
    setGrants((g) => (g.includes(p) ? g.filter((x) => x !== p) : [...g, p]));

  return (
    <Panel className="flex-1 w-full min-w-0">
      <PanelHeader title={role.label}>
        {role.isSystem && (
          <span className="ml-2 text-[11px] font-semibold text-ink-3 uppercase tracking-[0.08em]">
            System role
          </span>
        )}
      </PanelHeader>
      <form
        className="p-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <FormError message={mutation.isError ? mutation.error.message : null} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Label">
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} />
          </Field>
          <Field label="Key (immutable)" hint="The key is referenced by users; it can't be renamed.">
            <TextInput value={role.key} disabled />
          </Field>
        </div>
        <Checkbox label="Role active (inactive roles can't be assigned and block sign-in)" checked={active} onChange={(e) => setActive(e.target.checked)} />

        <div className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-ink-2">
            Permissions · {grants.length} of {PERMISSIONS.length}
          </span>
          {groups.map(([group, perms]) => (
            <div key={group} className="border border-line-soft rounded-[6px] px-3 py-1">
              <p className="m-0 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                {group}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                {perms.map((p) => (
                  <Checkbox key={p} label={p} checked={grants.includes(p)} onChange={() => toggle(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <PrimaryButton disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save role'}
          </PrimaryButton>
          <span className="text-[11.5px] text-ink-3">Revision {role.revision} · optimistic locking</span>
        </div>

        {role.recentChanges.length > 0 && (
          <div className="border-t border-line-soft pt-3">
            <p className="m-0 mb-2 text-[12px] font-semibold text-ink-2">Recent changes</p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
              {role.recentChanges.map((c, i) => (
                <li key={`${c.at}-${i}`} className="text-[12px] text-ink-3">
                  {c.summary} · {c.actorName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Panel>
  );
}

function CreateRoleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [grants, setGrants] = useState<Permission[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const body: RoleCreateBody = { key: key.trim(), label: label.trim(), rank: 0, permissions: grants };
      return adminApi.createRole(body);
    },
    onSuccess: onSaved,
  });

  return (
    <Dialog title="New role" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <FormError message={mutation.isError ? mutation.error.message : null} />
        <Field label="Key" hint="Lowercase letters, digits, underscore. Can't be renamed later.">
          <TextInput value={key} onChange={(e) => setKey(e.target.value)} required maxLength={32} autoFocus autoComplete="off" />
        </Field>
        <Field label="Label">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} />
        </Field>
        <Field label={`Permissions · ${grants.length} selected`}>
          <div className="border border-line-soft rounded-[6px] px-3 py-1 max-h-[240px] overflow-auto grid grid-cols-1 gap-x-4">
            {PERMISSIONS.map((p) => (
              <Checkbox
                key={p}
                label={p}
                checked={grants.includes(p)}
                onChange={() =>
                  setGrants((g) => (g.includes(p) ? g.filter((x) => x !== p) : [...g, p]))
                }
              />
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create role'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
