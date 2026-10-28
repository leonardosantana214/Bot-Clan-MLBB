import { AeroInput as TextInput } from '../components/AeroInput';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Switch,
  Platform,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { AeroMark, AeroWordmark } from '../components/AeroBrand';
import { Button, Card } from '../components';
import { MockAuthProvider, type AuthProvider, type AuthSession } from '../services/auth';
import { MockControllerApi, type ControllerApi } from '../services/api';
import { createRemote } from '../services/remote';
import { borders, colors, radii, spacing, typography } from '../theme';

export interface LoginScreenProps {
  onSessionExpired: () => void;
  onAuthenticated: (session: AuthSession, api: ControllerApi, auth: AuthProvider, demo: boolean) => void;
}

export function LoginScreen({
  onSessionExpired,
  onAuthenticated
}: LoginScreenProps): React.JSX.Element {
  const [demo, setDemo] = useState(false);
  const [address, setAddress] = useState(() => { try { return globalThis.localStorage?.getItem('aerobot-host') ?? 'http://127.0.0.1:8787'; } catch { return 'http://127.0.0.1:8787'; } });
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async (): Promise<void> => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const connection = demo ? { api: new MockControllerApi(), auth: new MockAuthProvider() } : createRemote(address.trim(), onSessionExpired);
      const result = await connection.auth.login(password);
      setPassword('');
      if (result.ok && result.session) {
        if (!demo) { try { globalThis.localStorage?.setItem('aerobot-host', address.trim()); } catch { /* Address persistence is optional. */ } }
        onAuthenticated(result.session, connection.api, connection.auth, demo);
      } else {
        setError(result.errorMessage ?? 'Não foi possível validar a credencial.');
      }
    } catch {
      setPassword('');
      setError('Endereço do Host inválido ou conexão indisponível.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={ Platform.OS === 'ios' ? 'padding' : undefined }
      style={ styles.screen }
    >
      <ScrollView contentContainerStyle={ styles.container } keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={ styles.brandHeader }>
          <AeroMark size={88} />
          <AeroWordmark size={58} />
          <Text style={styles.brandEyebrow}>CLÃ · MOBILE LEGENDS</Text>
          <Text style={ styles.brandSubtitle }>Precisão em cada comando.</Text>
        </View>

        <Card
          accent
          title="Acesso Administrativo"
          subtitle={demo ? "Modo demonstração • dados sintéticos" : "Conexão real com o Host"}
          accessibilityLabel="Formulário de login administrativo"
        >
          <Text style={styles.label}>Modo demonstração</Text>
          <Switch trackColor={{false: 'rgba(201, 162, 75, 0.35)', true: colors.primary}} thumbColor={colors.textPrimary} value={demo} disabled={loading} onValueChange={value => { setDemo(value); setPassword(''); setError(null); }} accessibilityLabel="Modo demonstração" />
          {!demo ? <View style={styles.fieldGroup}>
            <Text style={styles.label}>Endereço do Host</Text>
            <TextInput value={address} onChangeText={setAddress} editable={!loading} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.0.10:8787" placeholderTextColor={colors.textMuted} accessibilityLabel="Endereço do Host" style={styles.input} />
          </View> : null}
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
              {demo ? 'Modo demonstração: senha aeroclan-admin.' : 'Informe a senha definida no Host.'}
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
            {demo ? 'Demonstração local com dados sintéticos.' : 'Token somente em memória. HTTP apenas em rede confiável.'}
          </Text>
        </View>
      </ScrollView>
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center'
  },
  brandHeader: {
    marginBottom: spacing.xxl,
    paddingTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm
  },
  brandEyebrow: { color: colors.gold, fontFamily: typography.families.medium, fontSize: typography.sizes.eyebrow, letterSpacing: 2 },
  brandTitle: {
    color: colors.textPrimary,
    fontFamily: typography.families.display,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.medium,
    lineHeight: typography.lineHeights.xxl,
    marginTop: spacing.xs
  },
  brandSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  fieldGroup: {
    marginBottom: spacing.md
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: typography.tracking.label,
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.md,
    minHeight: 46
  },
  helperText: {
    color: colors.textMuted,
    fontFamily: typography.families.ui,
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
    borderWidth: borders.hairline,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md
  },
  errorText: {
    color: colors.dangerText,
    fontFamily: typography.families.ui,
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
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    textAlign: 'center'
  }
});
