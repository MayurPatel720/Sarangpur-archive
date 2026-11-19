'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, layoutsApi } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

/** JSON with sorted keys, so two equal layouts always compare equal. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * A sheet's layout that the person saves to their account.
 *
 * `current` is the layout as it is on screen right now (a draft while they drag, pin, resize …). `apply` puts a
 * layout on screen. When the page opens, the saved layout (if any) is applied; until "Save layout" is pressed,
 * changes are a draft and a reload brings the saved layout back. `dirty` says the draft differs from the saved one.
 */
export function useServerLayout<T extends object>(scope: string, current: T, apply: (v: T) => void) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['layouts', scope], queryFn: () => layoutsApi.get(scope), staleTime: Infinity, retry: false });
  const [saved, setSaved] = useState<T | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  // Another sheet (e.g. another media format): forget the previous one's saved layout.
  useEffect(() => {
    setSaved(null);
  }, [scope]);

  // First answer from the server: show the saved layout, or treat what is on screen as the saved one.
  useEffect(() => {
    if (saved || !q.data) return;
    const cur = currentRef.current;
    const merged = q.data.layout ? ({ ...cur, ...(q.data.layout as Partial<T>) } as T) : cur;
    if (q.data.layout) apply(merged);
    setSaved(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, saved]);

  const dirty = saved !== null && stable(current) !== stable(saved);

  const save = useMutation({
    mutationFn: () => layoutsApi.save({ scope, layout: currentRef.current as Record<string, unknown> }),
    onSuccess: () => {
      setSaved(currentRef.current);
      void queryClient.invalidateQueries({ queryKey: ['layouts', scope] });
      toast.success('Layout saved', 'It now follows you to any computer.');
    },
    onError: (e) => toast.error('Could not save the layout', e instanceof ApiRequestError ? e.message : undefined),
  });

  /** Throw the draft away: back to the saved layout. */
  const discard = useCallback(() => {
    if (saved) apply(saved);
  }, [saved, apply]);

  return { dirty, saving: save.isPending, save: () => save.mutate(), discard, ready: saved !== null };
}
