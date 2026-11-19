'use client';

import { useState } from 'react';
import { cleanPath, loadBaseFolder, readDrop } from '@/lib/file-path';
import { LocateFolderDialog } from '@/components/lots/LocateFolderDialog';
import { TextInput } from '@/components/ui/Form';

/**
 * A file-path box that behaves like the Excel's File path cell: type or paste a full path, or drop a file or folder
 * on it (a dropped name that has no path asks "Locate folder" once). Used for bill files on a machine's repair.
 */
export function PathField({
  value,
  onChange,
  label,
  placeholder = 'Paste, type or drop the path of the file…',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [over, setOver] = useState(false);
  const [locate, setLocate] = useState<string | null>(null);
  return (
    <>
      <div
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const d = readDrop(e.dataTransfer, loadBaseFolder());
          if (d.path) onChange(d.path);
          else if (d.name) setLocate(d.name);
        }}
        className="rounded-[6px] data-[over=true]:bg-accent-soft data-[over=true]:ring-2 data-[over=true]:ring-accent"
      >
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const text = cleanPath(e.clipboardData.getData('text/plain'));
            if (!text) return;
            e.preventDefault();
            onChange(text);
          }}
          onBlur={() => onChange(cleanPath(value))}
          maxLength={1000}
          name="path"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
      {locate ? <LocateFolderDialog name={locate} onDone={(p) => onChange(p)} onClose={() => setLocate(null)} /> : null}
    </>
  );
}
