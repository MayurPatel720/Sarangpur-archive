import { Children, type ReactNode } from 'react';

/**
 * One legended block inside a form step. Uppercase micro-legend matches the
 * `DataTable` header style so field groups and tables read as the same
 * hierarchy level. Optional description sits directly under the legend.
 */
export function FormSection({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="m-0 p-0 border-0 min-w-0">
      <legend className="px-0 mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
        {legend}
      </legend>
      {description ? (
        <p className="m-0 mb-3 text-[12px] text-ink-3 max-w-[68ch]">{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

/**
 * Splits a step's sections into visually separated blocks: every section
 * after the first is preceded by a hairline rule with breathing room on both
 * sides. The rule lives on a wrapper div (not the fieldset) so it can never
 * fight the fieldset's UA-border reset (`border-0`).
 */
export function StepBlocks({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {Children.map(children, (child, i) =>
        i === 0 ? (
          child
        ) : (
          <div key={i} className="mt-4 pt-4 border-t border-line-soft">
            {child}
          </div>
        ),
      )}
    </div>
  );
}
