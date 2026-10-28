import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export interface CardProps {
  title?: string | undefined;
  subtitle?: string | undefined;
  rightElement?: React.ReactNode | undefined;
  accent?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  accessibilityLabel?: string | undefined;
  children: React.ReactNode;
}

export function Card({
  title,
  subtitle,
  rightElement,
  accent = false,
  style,
  accessibilityLabel,
  children
}: CardProps): React.JSX.Element {
  return (
    <View
      accessible={ Boolean(accessibilityLabel) }
      accessibilityLabel={ accessibilityLabel }
      style={ [styles.card, accent && styles.cardAccent, style] }
    >
      { (title || subtitle || rightElement) ? (
        <View style={ styles.header }>
          <View style={ styles.headerTitles }>
            { title ? <Text style={ styles.title }>{ title }</Text> : null }
            { subtitle ? <Text style={ styles.subtitle }>{ subtitle }</Text> : null }
          </View>
          { rightElement ? <View style={ styles.rightElement }>{ rightElement }</View> : null }
        </View>
      ) : null }
      { children }
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  cardAccent: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceElevated
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm
  },
  headerTitles: {
    flex: 1
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    lineHeight: typography.lineHeights.md
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2
  },
  rightElement: {
    flexShrink: 0
  }
});
