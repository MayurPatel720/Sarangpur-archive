/**
 * Shell geometry shared by the rail (Sidebar) and anything that must align to it
 * (SearchOverlay). Tailwind cannot build class names from variables — keep the
 * numeric widths and the paired utility strings together so they cannot drift.
 */
export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_WIDTH_COLLAPSED = 76;

/** Width utilities for the rail itself. */
export const SIDEBAR_WIDTH_CLASS = {
  full: 'w-[248px]',
  collapsed: 'xl:w-[76px]',
} as const;

/** Left-offset utilities for overlays that sit beside the rail at `xl`. */
export const SIDEBAR_OFFSET_CLASS = {
  expanded: 'xl:left-[248px]',
  collapsed: 'xl:left-[76px]',
} as const;

/** localStorage key for the desktop collapse preference. */
export const SIDEBAR_COLLAPSED_KEY = 'archive-tracker.rail-collapsed';
