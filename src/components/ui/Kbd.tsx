/**
 * Soft key chip for shortcut hints — Apple-style separate keys (`⌘` `K`),
 * never a single "Ctrl+K" string blob.
 */
export function Kbd({ keys, label }: { keys: readonly string[]; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label ?? keys.join(' ')}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="font-sans min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center text-[11px] font-semibold text-ink-3 bg-surface-subtle border border-line rounded-[5px] leading-none shadow-none"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
