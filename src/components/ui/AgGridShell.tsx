'use client';

import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';

/**
 * Single client boundary for AG Grid (approved exception to the no-component-
 * library rule — AG Grid is *the* grid library; `DataTable` stays as fallback).
 * Modules are registered once here; every future grid imports this shell.
 *
 * No CSS imports needed — v33+ themes ship styles via the `theme` prop. Colours
 * reference the app's own `var(--color-*)` tokens so grids follow light/dark
 * (`:root[data-theme='dark']`) automatically. Status is still never colour
 * alone — grid cells must render text alongside any colour cue.
 */
ModuleRegistry.registerModules([AllCommunityModule]);

export const agGridTheme = themeQuartz.withParams({
  backgroundColor: 'var(--color-surface)',
  foregroundColor: 'var(--color-ink-2)',
  headerBackgroundColor: 'var(--color-surface)',
  headerTextColor: 'var(--color-ink-3)',
  borderColor: 'var(--color-line-soft)',
  rowHoverColor: 'var(--color-accent-soft)',
  selectedRowBackgroundColor: 'var(--color-accent-soft)',
  oddRowBackgroundColor: 'var(--color-surface-subtle)',
  fontFamily: 'inherit',
  fontSize: 13,
});

export { AgGridReact };
