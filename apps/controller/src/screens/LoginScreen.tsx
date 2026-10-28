import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Badge, Button, Card } from '../components';
import type { AuthProvider, AuthSession } from '../services/auth';
import { colors, radii, spacing, typography } from '../theme';

export interface LoginScreenProps {
  authProvider: AuthProvider;
  onAuthenticated: (session: AuthSession) => void;
}

export function LoginScreen({
  authProvider,
  onAuthenticated
}: LoginScreenProps): React.JSX.Element {
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const result = await authProvider.login(password);
      if (result.ok && result.session) {
        onAuthenticated(result.session);
      } else {
        setError(result.errorMessage ?? 'Não foi possível validar a credencial.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro inesperado na validação local.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={ Platform.OS === 'ios' ? 'padding' : undefined }
      style={ styles.screen }
    >
      <View style={ styles.container }>
        <View style={ styles.brandHeader }>
          <Badge label="MOBILE LEGENDS • CLAN OPS" tone="crimson" showDot />
          <Text accessibilityRole="header" style={ styles.brandTitle }>
            AeroBot Controller
          </Text>
          <Text style={ styles.brandSubtitle }>
            Console tático de administração do bot de WhatsApp do clã A3RO B4STA.
          </Text>
        </View>

        <Card
          accent
          title="Acesso Administrativo"
          subtitle="Validação local sintética (sem conexão externa)"
          accessibilityLabel="Formulário de login administrativo"
        >
          <View style={ styles.fieldGroup }>
            <Text style={ styles.label }>Senha de Administração</Text>
            <TextInput
              value={ password }
              onChangeText={ setPassword }
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={ false }
              placeholder="Digite a senha do painel"
              placeholderTextColor={ colors.textMuted }
              accessibilityLabel="Campo de senha de administração"
              accessibilityHint="Informe a senha administrativa para liberar o painel do clã"
              style={ styles.input }
              onSubmitEditing={ () => {
                void handleLogin();
              } }
            />
            <Text style={ styles.helperText }>
              Modo Demo: credencial padrão preenchida (<Text style={ styles.code }>aeroclan-admin</Text>).
            </Text>
          </View>

          { error ? (
            <View accessibilityRole="alert" style={ styles.errorBox }>
              <Text style={ styles.errorText }>{ error }</Text>
            </View>
          ) : null }

          <Button
            label="Entrar no Painel"
            onPress={ () => {
              void handleLogin();
            } }
            loading={ loading }
            variant="primary"
            size="lg"
            accessibilityLabel="Entrar no painel administrativo"
          />
        </Card>

        <View style={ styles.footerNote }>
          <Text style={ styles.footerText }>
            Ambiente 100% sintético • Nenhum dado real ou número de telefone armazenado.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.lg
  },
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center'
  },
  brandHeader: {
    marginBottom: spacing.xl,
    gap: spacing.xs
  },
  brandTitle: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    lineHeight: typography.lineHeights.xxl,
    marginTop: spacing.xs
  },
  brandSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  fieldGroup: {
    marginBottom: spacing.md
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
    minHeight: 46
  },
  helperText: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    marginTop: spacing.xs
  },
  code: {
    color: colors.primaryText,
    fontWeight: typography.weights.semibold
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md
  },
  errorText: {
    color: colors.dangerText,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    fontWeight: typography.weights.medium
  },
  footerNote: {
    marginTop: spacing.md,
    alignItems: 'center'
  },
  footerText: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textAlign: 'center'
  }
});
