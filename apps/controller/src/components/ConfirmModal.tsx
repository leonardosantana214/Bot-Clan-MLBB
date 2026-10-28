import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { borders, colors, radii, spacing, typography } from '../theme';
import { Button } from './Button';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string | undefined;
  destructive?: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmModalProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={ visible }
      animationType="none"
      onRequestClose={ onCancel }
    >
      <View style={ styles.backdrop }>
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={ `${title}. ${description}` }
          style={ styles.dialog }
        >
          <Text style={ styles.title }>{ title }</Text>
          <Text style={ styles.description }>{ description }</Text>
          <View style={ styles.actions }>
            <Button
              label={ cancelLabel }
              onPress={ onCancel }
              variant="secondary"
              size="md"
              accessibilityLabel={ cancelLabel }
              style={ styles.actionBtn }
            />
            <Button
              label={ confirmLabel }
              onPress={ onConfirm }
              variant={ destructive ? 'primary' : 'outline' }
              size="md"
              accessibilityLabel={ confirmLabel }
              style={ styles.actionBtn }
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: borders.hairline,
    borderColor: colors.primaryBorder,
    padding: spacing.lg
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.families.display,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.xs
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginBottom: spacing.lg
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm
  },
  actionBtn: {
    flex: 1
  }
});
