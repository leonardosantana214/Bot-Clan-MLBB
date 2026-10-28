import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export interface ListItemProps {
  title: string;
  subtitle?: string | undefined;
  meta?: string | undefined;
  leftElement?: React.ReactNode | undefined;
  rightElement?: React.ReactNode | undefined;
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

export function ListItem({
  title,
  subtitle,
  meta,
  leftElement,
  rightElement,
  accessibilityLabel,
  style
}: ListItemProps): React.JSX.Element {
  return (
    <View
      accessible={ Boolean(accessibilityLabel) }
      accessibilityLabel={ accessibilityLabel ?? title }
      style={ [styles.container, style] }
    >
      { leftElement ? <View style={ styles.left }>{ leftElement }</View> : null }
      <View style={ styles.content }>
        <Text style={ styles.title }>{ title }</Text>
        { subtitle ? <Text style={ styles.subtitle }>{ subtitle }</Text> : null }
        { meta ? <Text style={ styles.meta }>{ meta }</Text> : null }
      </View>
      { rightElement ? <View style={ styles.right }>{ rightElement }</View> : null }
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: spacing.sm
  },
  left: {
    flexShrink: 0
  },
  content: {
    flex: 1
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    lineHeight: typography.lineHeights.sm
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2
  },
  right: {
    flexShrink: 0,
    alignItems: 'flex-end'
  }
});
