export interface ColorPair {
  DEFAULT: string;
  dark: string;
}

export interface AccentColor extends ColorPair {
  active: string;
  soft: string;
  softDark: string;
}

export interface StatusColors {
  open: string;
  'open-dark': string;
  'open-soft': string;
  'open-softDark': string;

  c: string;
  'c-dark': string;
  'c-soft': string;
  'c-softDark': string;

  n: string;
  'n-dark': string;
  'n-soft': string;
  'n-softDark': string;

  nc: string;
  'nc-dark': string;
  'nc-soft': string;
  'nc-softDark': string;
}

export interface AppColors {
  bg: ColorPair;
  surface: ColorPair;
  raised: ColorPair;
  border: ColorPair;
  ink: ColorPair;
  muted: ColorPair;
  faint: ColorPair;
  accent: AccentColor;
  status: StatusColors;
  warn: ColorPair;
}

declare const colors: AppColors;
export default colors;
