import { AeroIcon } from './AeroBrand';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction
}: EmptyStateProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={ `${title}. ${description}` }
      style={ styles.container }
    >
      <View style={ styles.iconBadge }>
        <AeroIcon name="empty" />
      </View>
      <Text style={ styles.title }>{ title }</Text>
      <Text style={ styles.description }>{ description }</Text>
      { actionLabel && onAction ? (
        <Button
          label={ actionLabel }
          onPress={ onAction }
          variant="outline"
          size="sm"
          accessibilityLabel={ actionLabel }
          style={ styles.button }
        />
      ) : null }
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  iconText: {
    color: colors.textMuted,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.regular
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.families.display,
    fontSize: typography.sizes.section,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
    marginBottom: spacing.xxs
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    textAlign: 'center',
    maxWidth: 320
  },
  button: {
    marginTop: spacing.md
  }
});
