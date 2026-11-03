'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { resolveDropped, saveBaseFolder } from '@/lib/file-path';

/**
 * A browser only tells a page the NAME of a dropped file or folder, never where it lives. So when a
 * drop has no known base folder, this asks for the full path once, and remembers the folder it sits
 * in: the next drops from that folder save the full path by themselves.
 *
 * Rendered in a portal because it can open from inside a grid cell, whose rows are transformed (which
 * would otherwise trap a fixed dialog inside the cell).
 */
export function LocateFolderDialog({
  name,
  onDone,
  onClose,
}: {
  /** What the browser gave: just the file or folder name. */
  name: string;
  onDone: (path: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = resolveDropped(name, value);
    if (!r) {
      setError('Paste the full path, like E:\\Scans\\2026\\' + name + '.');
      return;
    }
    if (remember && r.base) saveBaseFolder(r.base);
    onDone(r.path);
    onClose();
  };

  return createPortal(
    <Dialog
      title="Where is this folder?"
      subtitle={`Your browser only shares the name "${name}", not its location. Paste the full path once and I will remember where your folders live.`}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          submit();
        }}
      >
        <Field label="Full path" hint="In File Explorer: click the folder, then Shift + right-click → Copy as path.">
          <TextInput
            data-autofocus
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            name="folderFullPath"
            autoComplete="off"
            spellCheck={false}
            placeholder={`E:\\Scans\\2026\\${name}`}
            aria-label="Full path"
          />
        </Field>
        <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember the folder it is in, so the next drops save the full path on their own
        </label>
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!value.trim()}>
            Save path
          </PrimaryButton>
        </div>
      </form>
    </Dialog>,
    document.body,
  );
}
