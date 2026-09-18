import type { ReactNode } from 'react';
import { severityChip, severityFill, severityMark } from '@/lib/format';
import type { Severity } from '@/types/dashboard';

/* -------------------------------------------------------------------- panel */

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-surface border border-line rounded-[8px] shadow-panel ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="h-12 flex-shrink-0 border-b border-line-soft px-4 flex items-center gap-2.5">
      <h2 className="m-0 text-[13.5px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- badge */

/**
 * Status badge. Always renders a coloured mark *and* the label — status is never
 * communicated by colour alone.
 */
export function Badge({
  severity,
  children,
}: {
  severity: Severity;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[4px] border text-[11px] font-semibold ${severityChip[severity]}`}
    >
      <span className={`w-[5px] h-[5px] rounded-full ${severityMark[severity]}`} />
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- meter */

/**
 * Progress meter. The unfilled track is a lighter step of the same ramp as the fill,
 * so the whole bar reads as one object rather than two unrelated colours.
 */
export function Meter({
  percent,
  severity = 'info',
  className = '',
}: {
  percent: number;
  severity?: Severity;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`h-1.5 rounded-full bg-accent-track overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${severityFill[severity]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- skeleton */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton bg-line-soft rounded-[4px] ${className}`} />;
}

/* -------------------------------------------------------------------- error */

export function ErrorState({
  message,
  hint,
  onRetry,
}: {
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-start gap-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 flex-shrink-0 rounded-[6px] bg-danger-bg flex items-center justify-center">
          <span className="w-[6px] h-[6px] rounded-full bg-danger-mark" />
        </span>
        <div>
          <p className="m-0 text-[13px] font-semibold text-ink">{message}</p>
          {hint ? <p className="m-0 mt-1 text-[12px] text-ink-3">{hint}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-3.5 bg-surface border border-line-strong rounded-[6px] shadow-control text-[12.5px] font-semibold text-ink-2 cursor-pointer"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
