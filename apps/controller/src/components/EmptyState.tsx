import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
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
        <Text style={ styles.iconText }>∅</Text>
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
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  iconText: {
    color: colors.textMuted,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.xxs
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    textAlign: 'center',
    maxWidth: 320
  },
  button: {
    marginTop: spacing.md
  }
});
