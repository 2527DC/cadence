/**
 * Single source of truth theme definition.
 * All values are derived directly from `./colors.js` so that changing any color in `./colors.js`
 * automatically updates Tailwind classes, UI components, sheets, error boundaries, and charts.
 */

import { Platform } from 'react-native';

import colors from './colors';

export { default as colors } from './colors';

export const Colors = {
  light: {
    text: colors.ink.DEFAULT,
    background: colors.bg.DEFAULT,
    backgroundElement: colors.raised.DEFAULT,
    backgroundSelected: colors.accent.soft,
    textSecondary: colors.muted.DEFAULT,
    tint: colors.accent.DEFAULT,
  },
  dark: {
    text: colors.ink.dark,
    background: colors.bg.dark,
    backgroundElement: colors.raised.dark,
    backgroundSelected: colors.accent.softDark,
    textSecondary: colors.muted.dark,
    tint: colors.accent.dark,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Direct hex palette for components that render outside the Tailwind style pipeline
 * (e.g. ErrorBoundary, native sheets, custom canvas).
 */
export const PALETTE = {
  light: {
    bg: colors.bg.DEFAULT,
    surface: colors.surface.DEFAULT,
    raised: colors.raised.DEFAULT,
    border: colors.border.DEFAULT,
    ink: colors.ink.DEFAULT,
    muted: colors.muted.DEFAULT,
    faint: colors.faint.DEFAULT,
    accent: colors.accent.DEFAULT,
  },
  dark: {
    bg: colors.bg.dark,
    surface: colors.surface.dark,
    raised: colors.raised.dark,
    border: colors.border.dark,
    ink: colors.ink.dark,
    muted: colors.muted.dark,
    faint: colors.faint.dark,
    accent: colors.accent.dark,
  },
} as const;

/**
 * Sheet background and handle colors (used by BottomSheetModal).
 */
export const SHEET_THEME = {
  light: {
    background: colors.surface.DEFAULT,
    handle: colors.faint.DEFAULT,
  },
  dark: {
    background: colors.surface.dark,
    handle: colors.faint.dark,
  },
} as const;

/**
 * Domain Status Themes for task statuses:
 * - OPEN: Amber / Gold (Committed, pending)
 * - C: Emerald Green (Completed)
 * - N: Coral Crimson Red (Not completed / Missed)
 * - NC: Cool Slate Silver (Not counted / Excluded)
 */
export const STATUS_THEME = {
  OPEN: {
    label: 'Open',
    meaning: 'Committed, not yet resolved',
    dot: 'bg-status-open dark:bg-status-open-dark',
    text: 'text-status-open dark:text-status-open-dark',
    pillBg: 'bg-status-open-soft dark:bg-status-open-softDark',
    pillBorder: 'border-status-open/30 dark:border-status-open-dark/30',
    cardBorder: 'border-l-status-open dark:border-l-status-open-dark',
    raw: {
      light: colors.status.open,
      dark: colors.status['open-dark'],
      softLight: colors.status['open-soft'],
      softDark: colors.status['open-softDark'],
    },
  },
  C: {
    label: 'Completed',
    meaning: 'You did it',
    dot: 'bg-status-c dark:bg-status-c-dark',
    text: 'text-status-c dark:text-status-c-dark',
    pillBg: 'bg-status-c-soft dark:bg-status-c-softDark',
    pillBorder: 'border-status-c/30 dark:border-status-c-dark/30',
    cardBorder: 'border-l-status-c dark:border-l-status-c-dark',
    raw: {
      light: colors.status.c,
      dark: colors.status['c-dark'],
      softLight: colors.status['c-soft'],
      softDark: colors.status['c-softDark'],
    },
  },
  N: {
    label: 'Not completed',
    meaning: 'You did not do it',
    dot: 'bg-status-n dark:bg-status-n-dark',
    text: 'text-status-n dark:text-status-n-dark',
    pillBg: 'bg-status-n-soft dark:bg-status-n-softDark',
    pillBorder: 'border-status-n/30 dark:border-status-n-dark/30',
    cardBorder: 'border-l-status-n dark:border-l-status-n-dark',
    raw: {
      light: colors.status.n,
      dark: colors.status['n-dark'],
      softLight: colors.status['n-soft'],
      softDark: colors.status['n-softDark'],
    },
  },
  NC: {
    label: 'Not counted',
    meaning: 'Outside your control — excluded from the rate',
    dot: 'bg-status-nc dark:bg-status-nc-dark',
    text: 'text-status-nc dark:text-status-nc-dark',
    pillBg: 'bg-status-nc-soft dark:bg-status-nc-softDark',
    pillBorder: 'border-status-nc/30 dark:border-status-nc-dark/30',
    cardBorder: 'border-l-status-nc dark:border-l-status-nc-dark',
    raw: {
      light: colors.status.nc,
      dark: colors.status['nc-dark'],
      softLight: colors.status['nc-soft'],
      softDark: colors.status['nc-softDark'],
    },
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
