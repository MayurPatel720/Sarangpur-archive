/**
 * Inline stroke icons. Kept as components rather than an icon package so the set stays
 * small, the stroke weight stays consistent, and `currentColor` lets the nav tint them
 * without a second copy.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 17, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7.4" height="7.4" rx="1.4" />
    <rect x="13.6" y="3" width="7.4" height="7.4" rx="1.4" />
    <rect x="3" y="13.6" width="7.4" height="7.4" rx="1.4" />
    <rect x="13.6" y="13.6" width="7.4" height="7.4" rx="1.4" />
  </Icon>
);

export const IconIntake = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16l2 8v6H2v-6z" />
    <path d="M2 13h5l2 3h6l2-3h5" />
  </Icon>
);

export const IconDecision = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.4" />
    <path d="M8 12.2l2.8 2.8L16 9.5" />
  </Icon>
);

export const IconScan = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
    <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
    <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
    <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
    <path d="M3 12h18" />
  </Icon>
);

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z" />
    <circle cx="7.6" cy="7.6" r="1.3" />
  </Icon>
);

export const IconReturn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 14.5L4 9l5.5-5.5" />
    <path d="M4 9h11a5 5 0 0 1 5 5v6" />
  </Icon>
);

export const IconDiscard = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h17" />
    <path d="M8.5 6V3.6h7V6" />
    <path d="M6 6l1 14.4h10L18 6" />
  </Icon>
);

export const IconStorage = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9.2" cy="8" r="3.4" />
    <path d="M2.8 20a6.4 6.4 0 0 1 12.8 0" />
    <path d="M16.2 5.4a3.4 3.4 0 0 1 0 6.6" />
    <path d="M17.6 14.4A6.4 6.4 0 0 1 21.4 20" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6.8V12l3.6 2.1" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="M15.8 15.8L21 21" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon strokeWidth={2.1} {...p}>
    <path d="M12 5.5v13" />
    <path d="M5.5 12h13" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 6-2.2 7-2.2 7h16.4S18 15 18 9" />
    <path d="M10.4 20a2 2 0 0 0 3.2 0" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M8 10.5l4 4 4-4" />
  </Icon>
);

export const IconCollapse = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M13.6 8.4L10 12l3.6 3.6" />
    <path d="M6.4 4.6v14.8" />
  </Icon>
);

export const IconAlertTriangle = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <path d="M12 3.5l9.5 16.5H2.5z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.1" />
  </Icon>
);

export const IconStar = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <path d="M12 3.4l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2.2" />
    <path d="M16 8V5.6A1.6 1.6 0 0 0 14.4 4H5.6A1.6 1.6 0 0 0 4 5.6v8.8A1.6 1.6 0 0 0 5.6 16H8" />
  </Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.5 4.5V10h-5.5" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </Icon>
);

export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11l2-7h14l2 7" />
    <path d="M3 11h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z" />
    <path d="M9.5 21v-5h5v5" />
  </Icon>
);

export const IconClipboardList = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="2.5" width="14" height="19" rx="2" />
    <path d="M9 2.5V5h6V2.5" />
    <path d="M9 10h6" />
    <path d="M9 14h4" />
  </Icon>
);

export const IconBox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8l9-4.5L21 8v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
    <path d="M12 3.5V21" />
  </Icon>
);

export const IconFileImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="2.5" width="18" height="19" rx="2" />
    <circle cx="9" cy="9.5" r="2" />
    <path d="M21 17l-5-5-8 8" />
  </Icon>
);

export const IconFileVideo = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="2.5" width="18" height="19" rx="2" />
    <path d="M10 9l5 3-5 3V9z" />
  </Icon>
);

export const IconFileAudio = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="2.5" width="18" height="19" rx="2" />
    <path d="M12 8v8" />
    <path d="M9 10.5a3 3 0 0 1 6 0" />
    <path d="M9 15.5a3 3 0 0 0 6 0" />
  </Icon>
);

export const IconDatabase = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1.5v3M12 19.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1.5 12h3M19.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
