'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-viewer boolean remembered in localStorage. Returns `null` until a value
 * has been read (and whenever none is stored / storage is unavailable), so the
 * caller can fall back to its own default. Every storage access is guarded —
 * the page must work in private windows and with blocked site data.
 */
export function useStoredFlag(key: string): [boolean | null, (next: boolean) => void] {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') setValue(true);
      else if (raw === '0') setValue(false);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* not persisted; still applies for this visit */
      }
    },
    [key],
  );

  return [value, set];
}
