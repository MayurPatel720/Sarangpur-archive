'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiRequestError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCan, useMe } from '@/hooks/useCan';
import { Panel, PanelHeader, Skeleton, ErrorState, Badge } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton, FormError } from '@/components/ui/Form';
import type { AdminUser, UserCreateBody, UserPatchBody } from '@/types/admin';

export function UsersManager() {
  const canManage = useCan('user:manage');
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: adminApi.users,
    enabled: canManage,
  });
  const roles = useQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: adminApi.roles,
    enabled: canManage,
  });

  const deactivate = useMutation({
    mutationFn: (user: AdminUser) => adminApi.patchUser(user.id, { active: false }),
    onSuccess: (_res, user) => {
      setConfirmDeactivate(null);
      setDeactivateError(null);
      toast.success('User deactivated', `${user.name} can no longer sign in.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
    },
    onError: (e) => {
      const msg = e instanceof ApiRequestError ? e.message : 'Could not deactivate user.';
      setDeactivateError(msg);
      toast.error('Couldn’t deactivate user', msg);
    },
  });

  if (!canManage) {
    return (
      <Panel>
        <ErrorState message="You don't have access to user management." hint="Ask an administrator for the user:manage permission." />
      </Panel>
    );
  }

  const roleLabel = (key: string) => roles.data?.roles.find((r) => r.key === key)?.label ?? key;
  const selfId = me.data?.id;

  return (
    <Panel>
      <PanelHeader title="Users">
        <span className="ml-auto" />
        <button
          type="button"
          onClick={() => setDialog({ mode: 'create' })}
          className="h-9 px-3.5 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[12.5px] font-semibold cursor-pointer"
        >
          New user
        </button>
      </PanelHeader>

      {users.isPending || roles.isPending ? (
        <div className="p-4 flex flex-col gap-2.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : users.isError ? (
        <ErrorState
          message="Couldn't load users."
          hint={users.error.message}
          onRetry={() => users.refetch()}
        />
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-line-soft">
          {users.data.users.map((u) => {
            const isSelf = u.id === selfId;
            const canDeactivate = !isSelf && u.active;
            return (
              <li key={u.id} className="px-4 py-3 flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-[6px] bg-rail-control text-ink-2 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                  {u.initials}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[13px] font-semibold text-ink truncate">{u.name}</p>
                  <p className="m-0 text-[12px] text-ink-3 truncate">
                    @{u.username} · {roleLabel(u.role)}
                    {isSelf ? ' · You' : ''}
                  </p>
                </div>
                <Badge severity={u.active ? 'good' : 'neutral'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <IconButton
                    label={`Edit ${u.name}`}
                    icon="edit"
                    onClick={() => setDialog({ mode: 'edit', user: u })}
                  />
                  {canDeactivate ? (
                    <IconButton
                      label={`Deactivate ${u.name}`}
                      icon="trash"
                      variant="danger"
                      onClick={() => {
                        setDeactivateError(null);
                        setConfirmDeactivate(u);
                      }}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {confirmDeactivate ? (
        <ConfirmDialog
          title={`Deactivate ${confirmDeactivate.name}?`}
          body={
            <>
              They will not be able to sign in. You can reactivate the account later by editing
              the user and enabling <strong>Account active</strong>. Nothing is deleted.
            </>
          }
          meta={
            <>
              <span className="font-semibold">@{confirmDeactivate.username}</span>
              {' · '}
              {roleLabel(confirmDeactivate.role)}
            </>
          }
          confirmLabel="Deactivate"
          pending={deactivate.isPending}
          error={deactivateError}
          onConfirm={() => deactivate.mutate(confirmDeactivate)}
          onClose={() => {
            if (!deactivate.isPending) {
              setConfirmDeactivate(null);
              setDeactivateError(null);
            }
          }}
        />
      ) : null}

      {dialog && (
        <UserDialog
          key={dialog.mode === 'edit' ? dialog.user.id : 'create'}
          initial={dialog.mode === 'edit' ? dialog.user : null}
          roleOptions={(roles.data?.roles ?? []).map((r) => ({ key: r.key, label: r.label }))}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            toast.success(dialog.mode === 'edit' ? 'User updated' : 'User created');
            void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
          }}
        />
      )}
    </Panel>
  );
}

function UserDialog({
  initial,
  roleOptions,
  onClose,
  onSaved,
}: {
  initial: AdminUser | null;
  roleOptions: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initial?.role ?? roleOptions[0]?.key ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const mutation = useMutation({
    mutationFn: async () => {
      if (initial) {
        const patch: UserPatchBody = {};
        if (name.trim() !== initial.name) patch.name = name.trim();
        if (role !== initial.role) patch.role = role;
        if (active !== initial.active) patch.active = active;
        if (password) patch.password = password;
        const emailNow = email.trim() || null;
        if (emailNow !== (initial.email ?? null)) patch.email = emailNow;
        return adminApi.patchUser(initial.id, patch);
      }
      const body: UserCreateBody = {
        name: name.trim(),
        username: username.trim(),
        password,
        role,
      };
      if (email.trim()) body.email = email.trim();
      return adminApi.createUser(body);
    },
    onSuccess: onSaved,
    onError: (e) => {
      toast.error(
        initial ? 'Couldn’t update user' : 'Couldn’t create user',
        e instanceof ApiRequestError ? e.message : undefined,
      );
    },
  });

  return (
    <Dialog title={initial ? `Edit ${initial.name}` : 'New user'} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <FormError message={mutation.isError ? mutation.error.message : null} />
        <Field label="Full name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        </Field>
        {!initial && (
          <Field label="Username" hint="Lowercase, used at sign-in. Can't be changed later.">
            <TextInput value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={40} autoComplete="off" />
          </Field>
        )}
        <Field
          label={initial ? 'New password (leave blank to keep)' : 'Password'}
          hint="At least 8 characters."
        >
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!initial}
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)} required>
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email (optional)" hint="Also works at sign-in. Blank clears it.">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        {initial && <Checkbox label="Account active" checked={active} onChange={(e) => setActive(e.target.checked)} />}
        <div className="flex justify-end gap-2.5">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : initial ? 'Save changes' : 'Create user'}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
