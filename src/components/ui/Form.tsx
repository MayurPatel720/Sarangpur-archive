import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/* --------------------------------------------------------------------- field */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[12px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[11.5px] font-medium text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11.5px] text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- input */

const inputClass =
  'h-10 px-3 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] text-ink placeholder:text-ink-4 disabled:opacity-60 w-full min-w-0';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

const textareaClass =
  'min-h-[76px] px-3 py-2.5 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] text-ink placeholder:text-ink-4 disabled:opacity-60 w-full min-w-0 resize-y';

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${textareaClass} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`pr-8 appearance-none ${inputClass} ${props.className ?? ''}`} />
  );
}

export function Checkbox({
  label,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
      <input
        type="checkbox"
        {...props}
        className={`w-4 h-4 flex-shrink-0 accent-accent cursor-pointer ${props.className ?? ''}`}
      />
      <span className="text-[13px] text-ink-2">{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------- buttons */

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...props}
      className={`h-10 px-4 bg-accent border border-accent rounded-[6px] shadow-accent text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`h-10 px-4 bg-surface border border-line-strong rounded-[6px] shadow-control text-[13px] font-semibold text-ink-2 cursor-pointer disabled:opacity-60 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------- error */

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="px-3 py-2.5 bg-danger-bg border border-danger-line rounded-[6px] text-[12.5px] font-medium text-danger"
    >
      {message}
    </div>
  );
}
