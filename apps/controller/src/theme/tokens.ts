export const colors = {
  background: '#090A0F',
  surface: '#12151E',
  surfaceElevated: '#1A1E2B',
  surfaceHighlight: '#222838',
  border: '#282E42',
  borderFocus: '#DC143C',

  primary: '#DC143C',
  primaryHover: '#E81E48',
  primarySoft: 'rgba(220, 20, 60, 0.16)',
  primaryBorder: 'rgba(220, 20, 60, 0.45)',
  primaryText: '#FF5C7C',

  textPrimary: '#F5F7FA',
  textSecondary: '#B4BCD0',
  textMuted: '#8E98B0',
  textOnPrimary: '#FFFFFF',

  success: '#2ECC71',
  successSoft: 'rgba(46, 204, 113, 0.15)',
  successText: '#4CE68D',

  warning: '#F39C12',
  warningSoft: 'rgba(243, 156, 18, 0.16)',
  warningText: '#FFB74D',

  danger: '#DC143C',
  dangerSoft: 'rgba(220, 20, 60, 0.16)',
  dangerText: '#FF6B88',

  info: '#3498DB',
  infoSoft: 'rgba(52, 152, 219, 0.16)',
  infoText: '#67B8F0',

  overlay: 'rgba(5, 6, 10, 0.82)'
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
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999
} as const;

export const typography = {
  sizes: {
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
  typography
} as const;

export type Theme = typeof theme;
