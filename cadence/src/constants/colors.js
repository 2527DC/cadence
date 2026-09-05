// src/constants/colors.js
/**
 * Master Color Palette for Cadence
 *
 * SINGLE SOURCE OF TRUTH:
 * Changing any color here updates the entire app across Tailwind/NativeWind,
 * UI components, status indicators, and sheets.
 *
 * Theme: Blue & White with distinct, high-contrast status colors for task items.
 */

const colors = {
  // ---- Surfaces: Blue & White Theme -----------------------------------
  // Paired light/dark. Use as `bg-bg dark:bg-bg-dark`.
  bg: {
    DEFAULT: '#F6F9FD', // Crisp clean ice-white background
    dark: '#0B1120',    // Deep midnight navy background
  },
  surface: {
    DEFAULT: '#FFFFFF', // Pure crisp white card/sheet background
    dark: '#131D31',    // Dark slate navy card/sheet background
  },
  raised: {
    DEFAULT: '#EFF6FF', // Airy blue-white elevation for chips and active layers
    dark: '#1E2B44',    // Midnight elevated navy
  },
  border: {
    DEFAULT: '#E2E8F0', // Crisp slate border
    dark: '#243452',    // Sleek navy border
  },

  // ---- Typography -----------------------------------------------------
  ink: {
    DEFAULT: '#0F172A', // Deep midnight navy for high-contrast crisp text
    dark: '#F8FAFC',    // Ice white text for dark mode
  },
  muted: {
    DEFAULT: '#475569', // Medium slate for secondary text
    dark: '#94A3B8',    // Soft blue-slate for dark mode secondary text
  },
  faint: {
    DEFAULT: '#94A3B8', // Light slate for hints, icons, and timestamps
    dark: '#64748B',    // Muted navy-slate
  },

  // ---- Brand Accent: Royal Blue & White -------------------------------
  accent: {
    DEFAULT: '#2563EB', // Vibrant Royal Blue
    dark: '#3B82F6',    // Electric Sky Blue
    active: '#1D4ED8',
    soft: '#DBEAFE',
    softDark: '#1E3A8A',
  },

  // ---- Status Colors --------------------------------------------------
  // Distinctive, vibrant colors for the 4 core domain statuses:
  // `open`: Warm Amber Gold (Committed, pending, active in progress)
  // `c`:    Vivid Emerald Green (Completed)
  // `n`:    Coral Crimson Red (Not completed / Missed)
  // `nc`:   Cool Slate Silver (Not counted / Excluded)
  status: {
    open: '#D97706',
    'open-dark': '#FBBF24',
    'open-soft': '#FEF3C7',
    'open-softDark': '#3D2206',

    c: '#059669',
    'c-dark': '#34D399',
    'c-soft': '#ECFDF5',
    'c-softDark': '#063A29',

    n: '#E11D48',
    'n-dark': '#FB7185',
    'n-soft': '#FFF1F2',
    'n-softDark': '#3F0816',

    nc: '#64748B',
    'nc-dark': '#94A3B8',
    'nc-soft': '#F1F5F9',
    'nc-softDark': '#1E293B',
  },

  // Warning (e.g. late add tag, NC warning banners)
  warn: {
    DEFAULT: '#D97706',
    dark: '#F59E0B',
  },
};

module.exports = colors;
