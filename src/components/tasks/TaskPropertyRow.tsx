import type { ReactNode } from 'react';

/** One row of the drawer's property list: small label, then the value (or its editor). */
export function TaskPropertyRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
      <div className="text-[13px] font-medium text-ink min-w-0 break-words">{children}</div>
      {hint ? <span className="text-[11.5px] text-ink-3">{hint}</span> : null}
    </div>
  );
}
