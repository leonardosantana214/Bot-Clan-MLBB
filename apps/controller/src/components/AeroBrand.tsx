import React from 'react';
import { Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, typography } from '../theme';

interface BrandProps { size?: number; color?: string }
/** Split wing / open apex: original AERO monogram, drawn on a 64-unit grid. */
export function AeroMark({ size = 64, color = colors.gold }: BrandProps): React.JSX.Element {
  return <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Monograma AERO" role="img">
    <Path d="M9 53 30 10 35 20 20 51M35 20 55 53 39 44M22 39 43 39M9 53 25 46M34 29 39 39" fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="miter" />
  </Svg>;
}
export function AeroWordmark({ size = 40, color = colors.textPrimary }: BrandProps): React.JSX.Element {
  return <Text accessibilityRole="header" style={{fontFamily: typography.families.display, fontSize: size, color, letterSpacing: typography.tracking.wordmark, lineHeight: size * 1.15}}>AERO</Text>;
}
export function AeroIcon({ name, color = colors.gold, size = 22 }: BrandProps & { name: string }): React.JSX.Element {
  const paths: Record<string, string> = {
    overview: 'M3 3h6v8H3zM15 3h6v5h-6zM3 16h6v5H3zM15 13h6v8h-6z',
    connection: 'M8 9V6a4 4 0 0 1 8 0v3M5 9h14v12H5zM12 13v4',
    groups: 'M3 20v-3a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v3M18 13a4 4 0 0 1 3 4v3M12 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M17 3a3 3 0 0 1 0 6',
    ranking: 'M8 3h8v5a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 5 4M16 5h4v3a4 4 0 0 1-5 4M12 12v6M7 21h10M9 18h6',
    settings: 'M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6',
    empty: 'M4 7h16v14H4zM8 7V3h8v4M9 13h6',
    error: 'M12 3 2 21h20zM12 9v5M12 17v1'
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><Path d={paths[name] ?? 'M3 3h18v18H3z'} fill="none" stroke={color} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
