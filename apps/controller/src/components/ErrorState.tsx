import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string | undefined;
  message: string;
  onRetry?: (() => void) | undefined;
}

export function ErrorState({
  title = 'Falha ao carregar dados',
  message,
  onRetry
}: ErrorStateProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={ `${title}: ${message}` }
      style={ styles.container }
    >
      <View style={ styles.iconBadge }>
        <Text style={ styles.iconText }>!</Text>
      </View>
      <Text style={ styles.title }>{ title }</Text>
      <Text style={ styles.message }>{ message }</Text>
      { onRetry ? (
        <Button
          label="Tentar novamente"
          onPress={ onRetry }
          variant="primary"
          size="sm"
          accessibilityLabel="Tentar carregar os dados novamente"
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
    borderColor: colors.primaryBorder,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  iconText: {
    color: colors.dangerText,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.xxs
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    textAlign: 'center',
    maxWidth: 340
  },
  button: {
    marginTop: spacing.md
  }
});
