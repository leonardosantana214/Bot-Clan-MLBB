import React, { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';

export function AeroInput({ style, onFocus, onBlur, ...props }: TextInputProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  return <TextInput {...props} placeholderTextColor={colors.textMuted}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[{ backgroundColor: colors.background, color: colors.textPrimary, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.sm, minHeight: 48, padding: spacing.sm, fontFamily: typography.families.ui }, style, focused && { borderColor: colors.gold, backgroundColor: colors.surfaceElevated }, props.editable === false && { opacity: 0.5 }]} />;
}
