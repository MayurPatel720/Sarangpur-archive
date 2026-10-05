import type { InputHTMLAttributes } from 'react';

/**
 * Themed checkbox: token-coloured box, accent fill + white tick when checked, same
 * 16px size everywhere. Native checkboxes render bright white in the dark theme.
 */
export function Checkbox({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={`m-0 h-4 w-4 flex-shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-surface bg-center bg-no-repeat transition-colors duration-150 hover:border-accent checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%3E%3Cpath%20d='M3.5%208.5l3%203%206-7'%20fill='none'%20stroke='white'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E")] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
