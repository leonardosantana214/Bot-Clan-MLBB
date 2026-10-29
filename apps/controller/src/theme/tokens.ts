export const colors = {
  gold: '#C9A24B',
  silver: '#B7B4AA',
  bronze: '#B58F72',
  transparent: 'transparent',
  qrPaper: '#FFFFFF',
  qrInk: '#08080A',
  background: '#08080A',
  surface: '#101013',
  surfaceElevated: '#16161A',
  surfaceHighlight: '#1D191B',
  border: 'rgba(201, 162, 75, 0.30)',
  borderFocus: '#B3122B',

  primary: '#B3122B',
  primaryHover: '#D2132F',
  primarySoft: 'rgba(179, 18, 43, 0.12)',
  primaryBorder: 'rgba(201, 162, 75, 0.35)',
  primaryText: '#E3C77A',

  textPrimary: '#EDE6D6',
  textSecondary: '#BDB6AA',
  textMuted: '#A39B8E',
  textOnPrimary: '#EDE6D6',

  success: '#718768',
  successSoft: 'rgba(113, 135, 104, 0.12)',
  successText: '#A9BE9B',

  warning: '#C9A24B',
  warningSoft: 'rgba(201, 162, 75, 0.12)',
  warningText: '#E3C77A',

  danger: '#B3122B',
  dangerSoft: 'rgba(179, 18, 43, 0.12)',
  dangerText: '#E99BA6',

  info: '#C9A24B',
  infoSoft: 'rgba(201, 162, 75, 0.10)',
  infoText: '#E3C77A',

  overlay: 'rgba(8, 8, 10, 0.92)'
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32
} as const;

export const radii = {
  xs: 2,
  sm: 4,
  md: 4,
  lg: 6,
  pill: 3
} as const;

export const borders = { hairline: 1, focus: 2 } as const;

export const typography = {
  families: { ui: 'Manrope_400Regular', medium: 'Manrope_500Medium', bold: 'Manrope_600SemiBold', display: 'CormorantGaramond_500Medium' },
  tracking: { label: 2, wordmark: 8 },
  sizes: {
    nav: 11,
    eyebrow: 10,
    bodyCompact: 13,
    section: 24,
    rank: 30,
    heading: 36,
    hero: 38,
    metric: 40,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const
  },
  lineHeights: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 26,
    xl: 30,
    xxl: 36
  }
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  borders,
  typography
} as const;

export type Theme = typeof theme;
