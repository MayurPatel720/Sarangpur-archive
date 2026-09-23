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
    <div className="h-11 flex-shrink-0 border-b border-line-soft px-4 md:px-5 flex items-center gap-2.5">
      <h2 className="m-0 text-[13.5px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export type TabItem = { id: string; label: string };

/**
 * In-page tab bar. Active state uses weight + underline (not colour alone).
 * Controlled: parent owns value/onChange (pair with useUrlTab for deep links).
 */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel = 'Sections',
}: {
  tabs: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-0.5 overflow-x-auto border-b border-line-soft -mx-0 px-0"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = tabs.findIndex((x) => x.id === t.id);
              if (i < 0) return;
              const next =
                e.key === 'ArrowRight'
                  ? tabs[(i + 1) % tabs.length]
                  : tabs[(i - 1 + tabs.length) % tabs.length];
              if (next) onChange(next.id);
            }}
            className={`relative h-10 px-3.5 flex items-center text-[13px] whitespace-nowrap transition-colors border-b-2 -mb-px cursor-pointer ${
              active
                ? 'font-semibold text-ink border-accent'
                : 'font-medium text-ink-3 border-transparent hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tab panel body. Hide when inactive; keep ids for aria-controls. */
export function TabPanel({
  id,
  active,
  children,
  className = '',
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={`flex flex-col gap-3.5 md:gap-4 focus:outline-none ${className}`}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- definition */

/**
 * Read-only label/value cell. Sentence-case label so stacks of fields stay calm;
 * value is medium-weight so it reads first.
 */
export function Definition({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[12px] font-medium leading-tight text-ink-3">{label}</span>
      <span className="text-[13px] font-medium leading-snug text-ink break-words">{children}</span>
    </div>
  );
}

/** Shared empty-value marker for Definition cells. */
export const EmptyValue = () => <span className="text-ink-4 font-normal">—</span>;

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
    <div className="p-4 md:p-6 flex flex-col items-start gap-3">
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
