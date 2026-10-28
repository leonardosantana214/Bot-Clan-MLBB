import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export interface LoadingProps {
  message?: string | undefined;
}

export function Loading({ message = 'Sincronizando dados do clã...' }: LoadingProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={ message }
      style={ styles.container }
    >
      <ActivityIndicator size="large" color={ colors.primary } />
      <Text style={ styles.message }>{ message }</Text>
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
    marginVertical: spacing.sm,
    gap: spacing.sm
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'center'
  }
});
