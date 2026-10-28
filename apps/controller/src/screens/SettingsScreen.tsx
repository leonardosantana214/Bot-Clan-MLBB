import { AeroInput as TextInput } from '../components/AeroInput';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import { Badge, Button, Card, ErrorState, Loading } from '../components';
import { RemoteControllerApi } from '../services/remote';
import type {
  BotSettings,
  ControllerApi,
  ExportDataset,
  ExportReceipt
} from '../services/api';
import type { AuthSession } from '../services/auth';
import { borders, colors, radii, spacing, typography } from '../theme';

export interface SettingsScreenProps {
  api: ControllerApi;
  session: AuthSession;
  refreshSignal: number;
  onLogout: () => void;
}

const EXPORT_OPTIONS: ReadonlyArray<{
  dataset: ExportDataset;
  label: string;
  subtitle: string;
}> = [
  {
    dataset: 'xp_ranking',
    label: 'Exportar Ranking de XP (CSV)',
    subtitle: 'Pontuação atual, nível e ofensiva dos membros'
  },
  {
    dataset: 'clan_members',
    label: 'Exportar Membros do Clã (CSV)',
    subtitle: 'Lista de nicknames sintéticos, funções e elos Míticos'
  },
  {
    dataset: 'command_logs',
    label: 'Exportar Logs de Comandos (CSV)',
    subtitle: 'Histórico recente de execuções nas rotas do clã'
  },
  {
    dataset: 'moderation_audit',
    label: 'Exportar Auditoria de Moderação (CSV)',
    subtitle: 'Eventos do escudo anti-spam e alterações de estado'
  }
];

export function SettingsScreen({
  api,
  session,
  refreshSignal,
  onLogout
}: SettingsScreenProps): React.JSX.Element {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(null);
  const [exportingDataset, setExportingDataset] = useState<ExportDataset | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const loadSettings = useCallback(async (): Promise<void> => {
    if (api instanceof RemoteControllerApi) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar configurações.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, refreshSignal]);

  const handleExport = async (dataset: ExportDataset): Promise<void> => {
    setExportingDataset(dataset);
    setError(null);
    try {
      const receipt = await api.exportCsv(dataset);
      setExportReceipt(receipt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na exportação sintética.';
      setError(message);
    } finally {
      setExportingDataset(null);
    }
  };

  const handleSaveSettings = async (patch: Partial<BotSettings>): Promise<void> => {
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
      setSavedBanner('Configurações atualizadas localmente (Mock).');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configuração.';
      setError(message);
    }
  };

  if (api instanceof RemoteControllerApi) {
    return <ScrollView contentContainerStyle={styles.scrollContent}>
      <Card title="Exportações do Host" subtitle="Prévia CSV limitada a 8192 caracteres; configurações globais indisponíveis.">
        {EXPORT_OPTIONS.map(opt => <Button key={opt.dataset} label={opt.label} loading={exportingDataset === opt.dataset} onPress={() => { void handleExport(opt.dataset); }} />)}
        {error ? <Text style={styles.receiptMeta}>{error}</Text> : null}
        {exportReceipt ? <View><Text style={styles.receiptTitle}>{exportReceipt.fileName} • {exportReceipt.rowCount} linhas</Text><Text selectable style={styles.csvCode}>{exportReceipt.previewCsv}</Text></View> : null}
      </Card>
      <Button label="Encerrar sessão" onPress={onLogout} />
    </ScrollView>;
  }
  if (loading) {
    return <Loading message="Carregando preferências e módulo de exportação..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Erro em Configurações & Exportação"
        message={ error }
        onRetry={ () => {
          void loadSettings();
        } }
      />
    );
  }

  if (!settings) {
    return <Loading message="Inicializando configurações..." />;
  }

  return (
    <ScrollView
      contentContainerStyle={ styles.scrollContent }
      showsVerticalScrollIndicator={ false }
    >
      <Card
        accent
        title="Exportações de Dados (CSV Mock)"
        subtitle="Geração local instantânea sem tráfego de rede ou dados pessoais reais"
        rightElement={ <Badge label="Apenas Mock" tone="crimson" /> }
      >
        <View style={ styles.exportList }>
          { EXPORT_OPTIONS.map((opt) => (
            <View key={ opt.dataset } style={ styles.exportRow }>
              <View style={ styles.exportInfo }>
                <Text style={ styles.exportTitle }>{ opt.label }</Text>
                <Text style={ styles.exportSubtitle }>{ opt.subtitle }</Text>
              </View>
              <Button
                label="Gerar CSV"
                size="sm"
                variant="outline"
                loading={ exportingDataset === opt.dataset }
                onPress={ () => {
                  void handleExport(opt.dataset);
                } }
                accessibilityLabel={ opt.label }
              />
            </View>
          )) }
        </View>

        { exportReceipt ? (
          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={ `Arquivo gerado: ${exportReceipt.fileName} com ${exportReceipt.rowCount} linhas` }
            style={ styles.receiptBox }
          >
            <View style={ styles.receiptHeader }>
              <Text style={ styles.receiptTitle }>{ exportReceipt.fileName }</Text>
              <Badge label={ `${exportReceipt.rowCount} linhas` } tone="success" />
            </View>
            <Text style={ styles.receiptMeta }>Gerado em: { exportReceipt.generatedAt }</Text>
            <View style={ styles.csvPreview }>
              <Text style={ styles.csvCode }>{ exportReceipt.previewCsv }</Text>
            </View>
          </View>
        ) : null }
      </Card>

      <Card
        title="Parâmetros AERO"
        subtitle="Ajustes globais de comandos, ganho de XP e segurança"
      >
        { savedBanner ? (
          <View style={ styles.savedBanner }>
            <Text style={ styles.savedBannerText }>{ savedBanner }</Text>
          </View>
        ) : null }

        <View style={ styles.settingBlock }>
          <Text style={ styles.settingLabel }>Prefixo de Comandos</Text>
          <View style={ styles.prefixRow }>
            { (['!', '/', '.'] as const).map((prefix) => {
              const active = settings.commandPrefix === prefix;
              return (
                <Button
                  key={ prefix }
                  label={ `Prefixo "${prefix}"` }
                  size="sm"
                  variant={ active ? 'primary' : 'secondary' }
                  onPress={ () => {
                    void handleSaveSettings({ commandPrefix: prefix });
                  } }
                  accessibilityLabel={ `Selecionar prefixo de comando ${prefix}` }
                  style={ styles.prefixBtn }
                />
              );
            }) }
          </View>
        </View>

        <View style={ styles.settingBlock }>
          <Text style={ styles.settingLabel }>
            XP por Mensagem Válida ({ settings.xpPerMessage } XP • Cooldown { settings.xpCooldownSeconds }s)
          </Text>
          <View style={ styles.prefixRow }>
            { ([10, 15, 25] as const).map((xpVal) => {
              const active = settings.xpPerMessage === xpVal;
              return (
                <Button
                  key={ xpVal }
                  label={ `+${xpVal} XP` }
                  size="sm"
                  variant={ active ? 'primary' : 'secondary' }
                  onPress={ () => {
                    void handleSaveSettings({ xpPerMessage: xpVal });
                  } }
                  accessibilityLabel={ `Definir ${xpVal} XP por mensagem` }
                  style={ styles.prefixBtn }
                />
              );
            }) }
          </View>
        </View>

        <View style={ styles.settingBlock }>
          <Text style={ styles.settingLabel }>Mensagem Automática de Manutenção</Text>
          <TextInput
            value={ settings.maintenanceAutoReply }
            onChangeText={ (text) => {
              setSettings({ ...settings, maintenanceAutoReply: text });
            } }
            onBlur={ () => {
              void handleSaveSettings({ maintenanceAutoReply: settings.maintenanceAutoReply });
            } }
            multiline
            accessibilityLabel="Mensagem automática exibida durante o modo manutenção"
            style={ styles.textArea }
          />
        </View>

        <View style={ styles.switchRow }>
          <View style={ styles.switchInfo }>
            <Text style={ styles.settingLabel }>Resumo Diário de Atividade</Text>
            <Text style={ styles.settingSub }>
              Publica relatório automático às 23:59 no grupo de administração
            </Text>
          </View>
          <Switch
            value={ settings.dailyDigestEnabled }
            onValueChange={ (val) => {
              void handleSaveSettings({ dailyDigestEnabled: val });
            } }
            trackColor={ { false: colors.border, true: colors.primary } }
            thumbColor={ colors.textPrimary }
            accessibilityLabel="Alternar envio de resumo diário de atividade"
          />
        </View>

        <View style={ styles.switchRow }>
          <View style={ styles.switchInfo }>
            <Text style={ styles.settingLabel }>Bloqueio Estrito de Links Externos</Text>
            <Text style={ styles.settingSub }>
              Remove convites de outros grupos e URLs desconhecidas
            </Text>
          </View>
          <Switch
            value={ settings.strictAntiLink }
            onValueChange={ (val) => {
              void handleSaveSettings({ strictAntiLink: val });
            } }
            trackColor={ { false: colors.border, true: colors.primary } }
            thumbColor={ colors.textPrimary }
            accessibilityLabel="Alternar bloqueio estrito de links externos"
          />
        </View>
      </Card>

      <Card
        title="Sessão Administrativa"
        subtitle={ `Autenticado como ${session.adminAlias}` }
        rightElement={ <Badge label={ new Date(session.authenticatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) } tone="neutral" /> }
      >
        <Button
          label="Encerrar Sessão Administrativa"
          variant="danger"
          onPress={ onLogout }
          accessibilityLabel="Encerrar sessão administrativa e voltar para a tela de login"
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl
  },
  exportList: {
    gap: spacing.xs
  },
  exportRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm
  },
  exportInfo: {
    minWidth: 130,
    flex: 1
  },
  exportTitle: {
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular
  },
  exportSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  receiptBox: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    borderWidth: borders.hairline,
    borderColor: colors.primaryBorder,
    padding: spacing.md
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  receiptTitle: {
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular
  },
  receiptMeta: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    marginBottom: spacing.xs
  },
  csvPreview: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xs,
    padding: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.border
  },
  csvCode: {
    color: colors.primaryText,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs
  },
  savedBanner: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderWidth: borders.hairline,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md
  },
  savedBannerText: {
    color: colors.successText,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.regular
  },
  settingBlock: {
    marginBottom: spacing.md
  },
  settingLabel: {
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular,
    marginBottom: spacing.xs
  },
  settingSub: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs
  },
  prefixRow: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  prefixBtn: {
    flex: 1
  },
  textArea: {
    backgroundColor: colors.background,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.textPrimary,
    padding: spacing.sm,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.sm,
    minHeight: 68,
    textAlignVertical: 'top'
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    gap: spacing.sm
  },
  switchInfo: {
    flex: 1
  }
});
