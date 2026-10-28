import { AeroIcon } from './AeroBrand';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';
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
        <AeroIcon name="error" />
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
    borderWidth: borders.hairline,
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
    borderWidth: borders.hairline,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  iconText: {
    color: colors.dangerText,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.lg,
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
  message: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    textAlign: 'center',
    maxWidth: 340
  },
  button: {
    marginTop: spacing.md
  }
});
