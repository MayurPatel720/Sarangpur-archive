'use client';

import { useEffect, useState } from 'react';
import { FORMATS, type Format } from '@/lib/domain';
import { useMe } from '@/hooks/useCan';

const KEY = 'archive-tracker.last-format';

/** Formats the signed-in user may open (`format:*` grants — admins hold all). null while loading. */
export function useAccessibleFormats(): Format[] | null {
  const { data } = useMe();
  if (!data) return null;
  return FORMATS.filter((f) => data.grants.includes(`format:${f}`));
}

/**
 * The format the user was last working in, remembered on this device. Pass the format the
 * current page is scoped to (if any) and it is stored; the return value is what to fall back
 * to when a page has no format of its own (e.g. the sidebar's Dashboard tile).
 */
export function useLastFormat(current?: Format): Format | undefined {
  const [last, setLast] = useState<Format | undefined>(undefined);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw && (FORMATS as readonly string[]).includes(raw)) setLast(raw as Format);
    } catch {
      /* storage unavailable — no remembered format */
    }
  }, []);
  useEffect(() => {
    if (!current) return;
    setLast(current);
    try {
      window.localStorage.setItem(KEY, current);
    } catch {
      /* ignore */
    }
  }, [current]);
  return last;
}
