'use client';

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { IconEdit, IconTrash } from './icons';

type Variant = 'default' | 'danger';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: Variant;
  icon?: 'edit' | 'trash' | 'custom';
  children?: ReactNode;
};

function defaultIcon(icon: IconButtonProps['icon'], size: number) {
  if (icon === 'edit') return <IconEdit size={size} />;
  if (icon === 'trash') return <IconTrash size={size} />;
  return null;
}

/**
 * Circular, transparent row action. Stops click propagation so table row
 * navigation does not fire when the control is used.
 */
export function IconButton({
  label,
  variant = 'default',
  icon = 'custom',
  children,
  className = '',
  onClick,
  ...props
}: IconButtonProps) {
  const tone =
    variant === 'danger'
      ? 'border-danger-line text-danger hover:text-danger hover:bg-danger-bg hover:border-danger active:bg-danger-line'
      : 'border-line-strong text-ink-3 hover:text-ink hover:bg-surface-sunken hover:border-line active:bg-line-soft';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(e);
      }}
      className={`inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border bg-transparent transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${tone} ${className}`}
      {...props}
    >
      {children ?? defaultIcon(icon, 15)}
    </button>
  );
}
