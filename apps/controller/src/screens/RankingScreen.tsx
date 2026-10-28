import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, EmptyState, ErrorState, Loading } from '../components';
import type { ControllerApi, XpRankEntry } from '../services/api';
import { colors, radii, spacing, typography } from '../theme';

export interface RankingScreenProps {
  api: ControllerApi;
  refreshSignal: number;
}

export function RankingScreen({ api, refreshSignal }: RankingScreenProps): React.JSX.Element {
  const [entries, setEntries] = useState<XpRankEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRanking = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getXpRanking();
      setEntries(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar ranking de XP.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadRanking();
  }, [loadRanking, refreshSignal]);

  if (loading) {
    return <Loading message="Calculando pontuação de XP da temporada..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Erro no Ranking de XP"
        message={ error }
        onRetry={ () => {
          void loadRanking();
        } }
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Ranking de XP vazio"
        description="Ainda não há pontuação de experiência acumulada pelos membros nesta temporada."
        actionLabel="Recarregar Ranking"
        onAction={ () => {
          void loadRanking();
        } }
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={ styles.scrollContent }
      showsVerticalScrollIndicator={ false }
    >
      <Card
        accent
        title="Leaderboard de XP • Temporada S34"
        subtitle="Classificação sintética baseada em participação e comandos de clã"
        rightElement={ <Badge label={ `${entries.length} ranqueados` } tone="crimson" /> }
      >
        <View style={ styles.list }>
          { entries.map((entry) => {
            const progressRatio = Math.min(
              1,
              Math.max(0, entry.xp / Math.max(1, entry.nextLevelXp))
            );
            const progressPercent = Math.round(progressRatio * 100);
            const isTopThree = entry.rank <= 3;

            return (
              <View
                key={ entry.memberId }
                accessible
                accessibilityLabel={ `Posição ${entry.rank}: ${entry.nickname}, nível ${entry.level}, ${entry.xp} XP, função ${entry.mlbbRole}, elo ${entry.mythicTier}` }
                style={ [styles.rankRow, isTopThree && styles.rankRowHighlight] }
              >
                <View style={ [styles.rankBadge, isTopThree && styles.rankBadgeTop] }>
                  <Text style={ [styles.rankText, isTopThree && styles.rankTextTop] }>
                    #{ entry.rank }
                  </Text>
                </View>

                <View style={ styles.memberContent }>
                  <View style={ styles.topLine }>
                    <Text style={ styles.nickname }>{ entry.nickname }</Text>
                    <Badge
                      label={ `NV ${entry.level}` }
                      tone={ isTopThree ? 'crimson' : 'neutral' }
                    />
                  </View>

                  <Text style={ styles.roleLine }>
                    { entry.mlbbRole } • { entry.mythicTier }
                  </Text>

                  <View style={ styles.xpBarTrack }>
                    <View
                      style={ [styles.xpBarFill, { width: `${progressPercent}%` }] }
                    />
                  </View>

                  <View style={ styles.metaLine }>
                    <Text style={ styles.xpText }>
                      { entry.xp } / { entry.nextLevelXp } XP ({ progressPercent }%)
                    </Text>
                    <Text style={ styles.metaText }>
                      { entry.messagesSent } msgs • Ofensiva { entry.streakDays }d
                    </Text>
                  </View>
                </View>
              </View>
            );
          }) }
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl
  },
  list: {
    gap: spacing.sm
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md
  },
  rankRowHighlight: {
    borderColor: colors.primaryBorder
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rankBadgeTop: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder
  },
  rankText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  rankTextTop: {
    color: colors.primaryText
  },
  memberContent: {
    flex: 1,
    gap: 4
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  nickname: {
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  roleLine: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs
  },
  xpBarTrack: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: radii.pill,
    overflow: 'hidden',
    marginVertical: 4
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radii.pill
  },
  metaLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  xpText: {
    color: colors.primaryText,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs
  }
});
