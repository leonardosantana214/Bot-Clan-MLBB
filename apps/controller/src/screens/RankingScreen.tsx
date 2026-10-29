import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorState, Loading } from '../components';
import type { ControllerApi, XpRankEntry } from '../services/api';
import { borders, colors, radii, spacing, typography } from '../theme';

export interface RankingScreenProps {
  api: ControllerApi;
  refreshSignal: number;
}

export function RankingScreen({ api, refreshSignal }: RankingScreenProps): React.JSX.Element {
  const [period,setPeriod]=useState<'daily'|'weekly'|'monthly'|'all_time'>('all_time');
  const [entries, setEntries] = useState<XpRankEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadRanking = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getXpRanking(period);
      setEntries(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar ranking de XP.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api,period]);

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

  return (
    <ScrollView
      contentContainerStyle={ styles.scrollContent }
      showsVerticalScrollIndicator={ false }
    >
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{([['daily','Hoje'],['weekly','Semana'],['monthly','Mês'],['all_time','Geral']] as const).map(([key,label])=><Button key={key} label={label} variant={period===key?'secondary':'ghost'} onPress={()=>setPeriod(key)}/>)}</View>
      {entries.length === 0 ? <EmptyState title="Ranking vazio" description="Selecione outro período ou aguarde novas mensagens com XP." actionLabel="Atualizar" onAction={()=>void loadRanking()}/> : <Card
        accent
        title="Ranking"
        subtitle="Temporada S34 · Participação e experiência"
        rightElement={ <Badge label={ `${entries.length} ranqueados` } tone="crimson" /> }
      >
        <View style={ styles.list }>
          { entries.map((entry) => {
            const progressRatio = entry.progress ?? Math.min(
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
                  <Text style={ [styles.rankText, isTopThree && styles.rankTextTop, { color: entry.rank === 1 ? colors.gold : entry.rank === 2 ? colors.silver : entry.rank === 3 ? colors.bronze : colors.textMuted }] }>
                    { ['I', 'II', 'III'][entry.rank - 1] ?? entry.rank }
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
                      { entry.totalXp ?? entry.xp } / { entry.nextLevelXp } XP total ({ progressPercent }%) · { entry.xp } XP no período
                    </Text>
                    <Text style={ styles.metaText }>
                      { entry.messagesSent } msgs • Ofensiva { entry.streakDays === null ? 'indisponível' : `${entry.streakDays}d` }
                    </Text>
                  </View>
                </View>
              </View>
            );
          }) }
        </View>
      </Card>}
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
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderBottomWidth: borders.hairline,
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
    borderWidth: borders.hairline,
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
    fontFamily: typography.families.display,
    fontSize: typography.sizes.rank,
    fontWeight: typography.weights.medium
  },
  rankTextTop: {
    color: colors.primaryText
  },
  memberContent: {
    flex: 1,
    gap: 4
  },
  topLine: {
    flexWrap: 'wrap',
    gap: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  nickname: {
    color: colors.textPrimary,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.regular
  },
  roleLine: {
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs
  },
  xpBarTrack: {
    height: 2,
    backgroundColor: colors.background,
    borderRadius: radii.pill,
    overflow: 'hidden',
    marginVertical: 4
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: colors.gold,
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
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.regular
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: typography.families.ui,
    fontSize: typography.sizes.xs
  }
});
