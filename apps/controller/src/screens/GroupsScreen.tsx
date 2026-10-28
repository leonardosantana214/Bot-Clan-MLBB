import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Badge, Card, EmptyState, ErrorState, Loading } from '../components';
import type { ControllerApi, GroupRoute, ModuleKey } from '../services/api';
import { borders, colors, radii, spacing, typography } from '../theme';

export interface GroupsScreenProps {
  api: ControllerApi;
  refreshSignal: number;
}

const MODULE_META: ReadonlyArray<{
  key: ModuleKey;
  label: string;
  description: string;
}> = [
  {
    key: 'welcome',
    label: 'Boas-vindas & Regras',
    description: 'Recepciona novos recrutas com regras do clã e ID MLBB'
  },
  {
    key: 'xpSystem',
    label: 'Sistema de XP',
    description: 'Contabiliza atividade por mensagem e evolução de patente'
  },
  {
    key: 'mlbbCommands',
    label: 'Comandos MLBB (!elo, !winrate)',
    description: 'Habilita consultas de perfil sintético e meta de heróis'
  },
  {
    key: 'antiSpam',
    label: 'Escudo Anti-Spam',
    description: 'Bloqueia flood de figurinhas e links externos não autorizados'
  },
  {
    key: 'scrimAlerts',
    label: 'Alertas de Scrim & Torneio',
    description: 'Dispara lembretes de treinos e check-in de lineups'
  }
];

export function GroupsScreen({ api, refreshSignal }: GroupsScreenProps): React.JSX.Element {
  const [groups, setGroups] = useState<GroupRoute[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGroups();
      setGroups(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao listar rotas do clã.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups, refreshSignal]);

  const handleToggleModule = async (
    groupId: string,
    moduleKey: ModuleKey,
    nextValue: boolean
  ): Promise<void> => {
    try {
      const updated = await api.toggleGroupModule(groupId, moduleKey, nextValue);
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao alternar módulo.';
      setError(message);
    }
  };

  if (loading) {
    return <Loading message="Carregando grupos e rotas configuradas..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Erro ao carregar Grupos/Rotas"
        message={ error }
        onRetry={ () => {
          void loadGroups();
        } }
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Nenhum grupo vinculado"
        description="Não há rotas de WhatsApp registradas para o clã neste momento."
        actionLabel="Atualizar Lista"
        onAction={ () => {
          void loadGroups();
        } }
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={ styles.scrollContent }
      showsVerticalScrollIndicator={ false }
    >
      { groups.map((group) => {
        const activeCount = MODULE_META.filter((m) => group.modules[m.key]).length;
        return (
          <Card
            key={ group.id }
            title={ group.name }
            subtitle={ `${group.routeTag} • ${group.memberCount} membros • ${group.dailyMessages} msgs/dia` }
            rightElement={
              <Badge
                label={ `${activeCount}/${MODULE_META.length} ativos` }
                tone={ activeCount > 0 ? 'crimson' : 'neutral' }
              />
            }
            accessibilityLabel={ `Grupo ${group.name} com ${activeCount} módulos ativos` }
          >
            <View style={ styles.moduleList }>
              { MODULE_META.map((mod) => {
                const isEnabled = group.modules[mod.key];
                return (
                  <View key={ mod.key } style={ styles.moduleRow }>
                    <View style={ styles.moduleInfo }>
                      <Text style={ styles.moduleLabel }>{ mod.label }</Text>
                      <Text style={ styles.moduleDesc }>{ mod.description }</Text>
                    </View>
                    <Switch
                      value={ isEnabled }
                      onValueChange={ (val) => {
                        void handleToggleModule(group.id, mod.key, val);
                      } }
                      trackColor={ { false: colors.border, true: colors.primary } }
                      thumbColor={ colors.textPrimary }
                      accessibilityLabel={ `Alternar módulo ${mod.label} no grupo ${group.name}` }
                    />
                  </View>
                );
              }) }
            </View>
          </Card>
        );
      }) }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl
  },
  moduleList: {
    gap: spacing.xs
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.sm
  },
  moduleInfo: {
    flex: 1
  },
  moduleLabel: {
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular
  },
  moduleDesc: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs,
    marginTop: 2
  }
});
