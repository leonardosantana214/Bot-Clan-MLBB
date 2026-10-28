import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

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
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ accessibilityLabel ?? label }
      accessibilityHint={ accessibilityHint }
      accessibilityState={ { disabled: isDisabled, busy: loading } }
      disabled={ isDisabled }
      onPress={ onPress }
      style={ ({ pressed }) => [
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style
      ] }
    >
      { loading ? (
        <ActivityIndicator
          size="small"
          color={ variant === 'primary' || variant === 'danger' ? colors.textOnPrimary : colors.primaryText }
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1
  },
  variant_primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  variant_secondary: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderColor: colors.primaryBorder
  },
  variant_danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.primaryBorder
  },
  variant_ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent'
  },
  size_sm: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 36
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
  pressed: {
    opacity: 0.85
  },
  disabled: {
    opacity: 0.5
  },
  textBase: {
    fontWeight: typography.weights.semibold,
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
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs
  },
  textSize_md: {
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  textSize_lg: {
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md
  }
});
