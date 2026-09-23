'use client';

export interface StepDef {
  label: string;
}

/**
 * Wizard step indicator. Renders numbered circles with labels on desktop and a
 * compact "Step n of N · label" on small screens. Status is never colour-only:
 * each step also carries a visible check glyph, number or dot plus sr-only text.
 */
export function Stepper({
  steps,
  current,
  onJump,
}: {
  steps: readonly StepDef[];
  current: number;
  onJump?: (index: number) => void;
}) {
  const step = steps[current];
  return (
    <nav aria-label="Intake progress" className="flex flex-col gap-2">
      {/* Desktop: full rail */}
      <ol className="hidden sm:flex m-0 p-0 list-none items-center gap-2">
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          const clickable = Boolean(onJump) && i < current;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={`w-6 h-6 flex-shrink-0 rounded-full border flex items-center justify-center text-[11px] font-semibold ${
                  state === 'active'
                    ? 'bg-accent border-accent text-white'
                    : state === 'done'
                      ? 'bg-accent-soft border-accent text-accent'
                      : 'bg-surface border-line-strong text-ink-4'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span
                className={`text-[12.5px] font-medium ${
                  state === 'active' ? 'text-ink' : state === 'done' ? 'text-ink-2' : 'text-ink-4'
                }`}
              >
                {s.label}
              </span>
              <span className="sr-only">
                {state === 'done' ? 'completed' : state === 'active' ? 'current step' : 'upcoming'}
              </span>
            </>
          );
          return (
            <li key={s.label} className="flex items-center gap-2 min-w-0">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={`h-px w-6 md:w-10 flex-shrink-0 ${i <= current ? 'bg-accent' : 'bg-line'}`}
                />
              ) : null}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onJump?.(i)}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className="m-0 p-0 bg-transparent border-0 flex items-center gap-2 cursor-pointer min-w-0"
                >
                  {body}
                </button>
              ) : (
                <span
                  aria-current={state === 'active' ? 'step' : undefined}
                  className="flex items-center gap-2 min-w-0"
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: compact counter */}
      <div className="sm:hidden flex items-center gap-2">
        <span className="inline-flex items-center justify-center min-w-[70px] h-6 px-2 rounded-full bg-accent-soft border border-accent text-[11px] font-semibold text-accent">
          Step {current + 1} of {steps.length}
        </span>
        <span className="text-[12.5px] font-medium text-ink truncate">{step?.label}</span>
      </div>
    </nav>
  );
}
