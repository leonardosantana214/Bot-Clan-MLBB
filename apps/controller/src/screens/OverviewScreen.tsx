import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  ListItem,
  Loading
} from '../components';
import { RemoteControllerApi } from '../services/remote';
import type { ControllerApi, HostState, OverviewStats } from '../services/api';
import { colors, radii, spacing, typography } from '../theme';

export interface OverviewScreenProps {
  api: ControllerApi;
  refreshSignal: number;
  onHostUpdated: (host: HostState) => void;
}

type PendingAction = 'toggle_pause' | 'toggle_maintenance' | null;

export function OverviewScreen({
  api,
  refreshSignal,
  onHostUpdated
}: OverviewScreenProps): React.JSX.Element {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [host, setHost] = useState<HostState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [updatingHost, setUpdatingHost] = useState<boolean>(false);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, hostData] = await Promise.all([
        api instanceof RemoteControllerApi ? Promise.resolve(null) : api.getOverview(),
        api.getHostState()
      ]);
      setOverview(overviewData);
      setHost(hostData);
      onHostUpdated(hostData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar estado do clã.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api, onHostUpdated]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  const handleConfirmAction = async (): Promise<void> => {
    if (!host || !pendingAction) {
      return;
    }
    const actionToRun = pendingAction;
    setPendingAction(null);
    setUpdatingHost(true);
    try {
      const updated =
        actionToRun === 'toggle_pause'
          ? await api.setResponsesPaused(!host.responsesPaused)
          : await api.setMaintenanceMode(!host.maintenanceMode);
      setHost(updated);
      onHostUpdated(updated);
      const freshOverview = api instanceof RemoteControllerApi ? null : await api.getOverview();
      setOverview(freshOverview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar estado do Host.';
      setError(message);
    } finally {
      setUpdatingHost(false);
    }
  };

  if (loading) {
    return <Loading message="Carregando telemetria do Host e métricas do clã..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Indisponibilidade na Visão Geral"
        message={ error }
        onRetry={ () => {
          void loadData();
        } }
      />
    );
  }

  if (api instanceof RemoteControllerApi && host) {
    return <ScrollView contentContainerStyle={styles.scrollContent}>
      <Card title="Estado real do Host" subtitle={host.instanceAlias}>
        <Text style={styles.clanName}>{host.status}</Text>
        <Text style={styles.seasonLabel}>Conectado: {host.lastConnectedAt} • Uptime: {host.uptimeLabel}</Text>
        <Text style={styles.seasonLabel}>Fila: {host.pendingQueueCount} • Envios no último minuto: {host.processedPerMinute}</Text>
        <Text style={styles.seasonLabel}>Respostas: {host.responsesPaused ? 'pausadas' : 'ativas'}</Text>
        <Button label={host.responsesPaused ? 'Retomar respostas' : 'Pausar respostas'} loading={updatingHost} onPress={() => { setUpdatingHost(true); void api.setResponsesPaused(!host.responsesPaused).then(updated => { setHost(updated); onHostUpdated(updated); }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Falha no Host.')).finally(() => setUpdatingHost(false)); }} />
        <Text style={styles.seasonLabel}>Métricas agregadas e manutenção: indisponíveis neste Host.</Text>
        <Button label="Atualizar" onPress={() => { void loadData(); }} />
      </Card>
    </ScrollView>;
  }

  if (!overview || !host || overview.totalMembers === 0) {
    return (
      <EmptyState
        title="Nenhuma métrica registrada no período"
        description="O clã ainda não possui atividade sincronizada ou o modo de visualização vazia está ativo."
        actionLabel="Recarregar Visão Geral"
        onAction={ () => {
          void loadData();
        } }
      />
    );
  }

  const hostStatusLabel =
    host.status === 'online'
      ? 'Online'
      : host.status === 'degraded'
        ? 'Manutenção'
        : 'Offline';

  const hostStatusTone =
    host.status === 'online'
      ? 'success'
      : host.status === 'degraded'
        ? 'warning'
        : 'danger';

  const modalTitle =
    pendingAction === 'toggle_pause'
      ? host.responsesPaused
        ? 'Retomar respostas automáticas?'
        : 'Pausar respostas automáticas?'
      : host.maintenanceMode
        ? 'Encerrar Modo Manutenção?'
        : 'Ativar Modo Manutenção?';

  const modalDescription =
    pendingAction === 'toggle_pause'
      ? host.responsesPaused
        ? 'O AeroBot voltará a responder comandos e processar eventos nas rotas do clã imediatamente.'
        : 'As mensagens recebidas continuarão na fila, mas o bot não enviará respostas nos grupos até ser retomado.'
      : host.maintenanceMode
        ? 'O Host sairá do estado de manutenção e retomará a operação normal nos grupos.'
        : 'O bot pausará comandos gerais e responderá apenas com o aviso de manutenção programada.';

  return (
    <ScrollView
      contentContainerStyle={ styles.scrollContent }
      showsVerticalScrollIndicator={ false }
    >
      <View style={ styles.banner }>
        <View>
          <Text style={ styles.clanName }>{ overview.clanName }</Text>
          <Text style={ styles.seasonLabel }>{ overview.seasonLabel }</Text>
        </View>
        <Badge
          label={ `Host ${hostStatusLabel}` }
          tone={ hostStatusTone }
          showDot
          accessibilityLabel={ `Status atual do Host: ${hostStatusLabel}` }
        />
      </View>

      <View style={ styles.metricsGrid }>
        <View
          accessible
          accessibilityLabel={ `Membros totais: ${overview.totalMembers}` }
          style={ styles.metricCard }
        >
          <Text style={ styles.metricLabel }>Membros no Clã</Text>
          <Text style={ styles.metricValue }>{ overview.totalMembers }</Text>
          <Text style={ styles.metricMeta }>4 esquadrões ativos</Text>
        </View>

        <View
          accessible
          accessibilityLabel={ `Membros ativos hoje: ${overview.activeToday}` }
          style={ styles.metricCard }
        >
          <Text style={ styles.metricLabel }>Ativos Hoje</Text>
          <Text style={ [styles.metricValue, styles.metricCrimson] }>{ overview.activeToday }</Text>
          <Text style={ styles.metricMeta }>Participaram no chat/scrim</Text>
        </View>

        <View
          accessible
          accessibilityLabel={ `Mensagens processadas hoje: ${overview.messagesToday}` }
          style={ styles.metricCard }
        >
          <Text style={ styles.metricLabel }>Mensagens Hoje</Text>
          <Text style={ styles.metricValue }>{ overview.messagesToday }</Text>
          <Text style={ styles.metricMeta }>+{ host.processedPerMinute } msgs/min</Text>
        </View>

        <View
          accessible
          accessibilityLabel={ `Estado do Host: ${hostStatusLabel}` }
          style={ styles.metricCard }
        >
          <Text style={ styles.metricLabel }>Status do Host</Text>
          <Text
            style={ [
              styles.metricValue,
              host.status === 'online' ? styles.metricOnline : styles.metricWarning
            ] }
          >
            { hostStatusLabel }
          </Text>
          <Text style={ styles.metricMeta }>Uptime { host.uptimeLabel }</Text>
        </View>
      </View>

      <Card
        accent
        title="Estado do Host & Controle Operacional"
        subtitle={ host.instanceAlias }
        rightElement={
          <Badge
            label={ host.responsesPaused ? 'Respostas Pausadas' : 'Respondendo' }
            tone={ host.responsesPaused ? 'warning' : 'success' }
          />
        }
        accessibilityLabel="Painel de estado do Host e controles de operação"
      >
        <ListItem
          title="Conexão da Sessão"
          subtitle={ `Última sincronização: ${host.lastConnectedAt}` }
          rightElement={ <Badge label={ hostStatusLabel } tone={ hostStatusTone } showDot /> }
          accessibilityLabel={ `Conexão da sessão ${hostStatusLabel}. Última sincronização ${host.lastConnectedAt}` }
        />

        <ListItem
          title="Fila de Eventos do Clã"
          subtitle="Comandos !rank, !scrim e cálculos de XP aguardando despacho"
          rightElement={
            <Badge
              label={ `${host.pendingQueueCount} na fila` }
              tone={ host.pendingQueueCount > 5 ? 'warning' : 'info' }
            />
          }
          accessibilityLabel={ `Fila de eventos com ${host.pendingQueueCount} itens pendentes` }
        />

        <ListItem
          title="Modo Manutenção"
          subtitle={
            host.maintenanceMode
              ? 'Ativo: apenas administradores podem executar comandos'
              : 'Inativo: todos os módulos operam normalmente'
          }
          rightElement={
            <Badge
              label={ host.maintenanceMode ? 'Ativo' : 'Desativado' }
              tone={ host.maintenanceMode ? 'crimson' : 'neutral' }
            />
          }
          accessibilityLabel={ `Modo manutenção ${host.maintenanceMode ? 'ativo' : 'desativado'}` }
        />

        <View style={ styles.controlsRow }>
          <Button
            label={ host.responsesPaused ? 'Retomar Respostas' : 'Pausar Respostas' }
            onPress={ () => setPendingAction('toggle_pause') }
            variant={ host.responsesPaused ? 'primary' : 'secondary' }
            loading={ updatingHost }
            accessibilityLabel={
              host.responsesPaused
                ? 'Retomar envio de respostas do bot'
                : 'Pausar envio de respostas do bot'
            }
            style={ styles.controlBtn }
          />
          <Button
            label={ host.maintenanceMode ? 'Sair da Manutenção' : 'Modo Manutenção' }
            onPress={ () => setPendingAction('toggle_maintenance') }
            variant={ host.maintenanceMode ? 'outline' : 'danger' }
            loading={ updatingHost }
            accessibilityLabel={
              host.maintenanceMode
                ? 'Desativar modo manutenção do Host'
                : 'Ativar modo manutenção do Host'
            }
            style={ styles.controlBtn }
          />
        </View>
      </Card>

      <ConfirmModal
        visible={ pendingAction !== null }
        title={ modalTitle }
        description={ modalDescription }
        confirmLabel="Confirmar ação"
        destructive={ pendingAction === 'toggle_maintenance' && !host.maintenanceMode }
        onConfirm={ () => {
          void handleConfirmAction();
        } }
        onCancel={ () => setPendingAction(null) }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  clanName: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  seasonLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    marginVertical: spacing.xxs
  },
  metricCrimson: {
    color: colors.primaryText
  },
  metricOnline: {
    color: colors.successText
  },
  metricWarning: {
    color: colors.warningText
  },
  metricMeta: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  controlBtn: {
    flex: 1,
    minWidth: 150
  }
});
