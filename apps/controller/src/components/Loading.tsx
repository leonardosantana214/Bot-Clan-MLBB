import { AeroMark } from './AeroBrand';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';

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
      <AeroMark size={48} />
      <Text style={ styles.message }>{ message }</Text>
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
    marginVertical: spacing.sm,
    gap: spacing.sm
  },
  message: {
    color: colors.textSecondary,
    fontFamily: typography.families.medium,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular,
    textAlign: 'center'
  }
});
