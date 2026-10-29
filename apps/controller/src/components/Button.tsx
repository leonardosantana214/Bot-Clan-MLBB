import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  accessibilityHint?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  style
}: ButtonProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ accessibilityLabel ?? label }
      accessibilityHint={ accessibilityHint }
      accessibilityState={ { disabled: isDisabled, busy: loading } }
      disabled={ isDisabled }
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={ onPress }
      style={ ({ pressed }) => [
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        hovered && !isDisabled && styles.hovered,
        focused && styles.focused,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style
      ] }
    >
      { loading ? (
        <Text accessibilityLiveRegion="polite" style={[styles.textBase, styles[`text_${variant}`]]}>Aguarde…</Text>
      ) : (
        <Text style={ [styles.textBase, styles[`text_${variant}`], styles[`textSize_${size}`]] }>
          { label }
        </Text>
      ) }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: borders.hairline
  },
  variant_primary: {
    backgroundColor: colors.primary,
    borderColor: colors.gold
  },
  variant_secondary: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border
  },
  variant_outline: {
    backgroundColor: colors.transparent,
    borderColor: colors.primaryBorder
  },
  variant_danger: {
    backgroundColor: colors.transparent,
    borderColor: colors.primaryBorder
  },
  variant_ghost: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent
  },
  size_sm: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 44
  },
  size_md: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44
  },
  size_lg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 50
  },
  hovered: { borderColor: colors.gold, backgroundColor: colors.surfaceHighlight },
  focused: { borderColor: colors.textPrimary, borderWidth: borders.focus },
  pressed: {
    opacity: 0.72,
    backgroundColor: colors.primarySoft
  },
  disabled: {
    opacity: 0.5
  },
  textBase: {
    fontFamily: typography.families.bold,
    fontWeight: typography.weights.regular,
    textAlign: 'center'
  },
  text_primary: {
    color: colors.textOnPrimary
  },
  text_secondary: {
    color: colors.textPrimary
  },
  text_outline: {
    color: colors.primaryText
  },
  text_danger: {
    color: colors.dangerText
  },
  text_ghost: {
    color: colors.textSecondary
  },
  textSize_sm: {
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs
  },
  textSize_md: {
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  textSize_lg: {
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md
  }
});
