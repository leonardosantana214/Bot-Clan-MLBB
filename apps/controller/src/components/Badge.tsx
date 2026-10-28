import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'crimson' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone | undefined;
  showDot?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function Badge({
  label,
  tone = 'neutral',
  showDot = false,
  accessibilityLabel,
  style
}: BadgeProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={ accessibilityLabel ?? `Status: ${label}` }
      style={ [styles.container, styles[`bg_${tone}`], style] }
    >
      { showDot ? <View style={ [styles.dot, styles[`dot_${tone}`]] } /> : null }
      <Text style={ [styles.label, styles[`text_${tone}`]] }>{ label }</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    gap: 6
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: typography.tracking.label,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.regular,
    lineHeight: typography.lineHeights.xs
  },
  bg_success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success
  },
  bg_warning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning
  },
  bg_danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.primaryBorder
  },
  bg_info: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.border
  },
  bg_crimson: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder
  },
  bg_neutral: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border
  },
  dot_success: {
    backgroundColor: colors.success
  },
  dot_warning: {
    backgroundColor: colors.warning
  },
  dot_danger: {
    backgroundColor: colors.danger
  },
  dot_info: {
    backgroundColor: colors.info
  },
  dot_crimson: {
    backgroundColor: colors.primary
  },
  dot_neutral: {
    backgroundColor: colors.textMuted
  },
  text_success: {
    color: colors.successText
  },
  text_warning: {
    color: colors.warningText
  },
  text_danger: {
    color: colors.dangerText
  },
  text_info: {
    color: colors.infoText
  },
  text_crimson: {
    color: colors.primaryText
  },
  text_neutral: {
    color: colors.textSecondary
  }
});
