import React, { useCallback, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Badge } from './src/components';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OverviewScreen } from './src/screens/OverviewScreen';
import { RankingScreen } from './src/screens/RankingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  type ControllerApi,
  type HostState,
  type SimulationMode
} from './src/services/api';
import { type AuthProvider, type AuthSession } from './src/services/auth';
import { colors, radii, spacing, typography } from './src/theme';

type TabKey = 'overview' | 'groups' | 'ranking' | 'settings';

interface TabItem {
  key: TabKey;
  label: string;
  shortIcon: string;
  accessibilityLabel: string;
}

const TABS: ReadonlyArray<TabItem> = [
  {
    key: 'overview',
    label: 'Visão Geral',
    shortIcon: '◈',
    accessibilityLabel: 'Aba Visão Geral e Estado do Host'
  },
  {
    key: 'groups',
    label: 'Grupos',
    shortIcon: '⊞',
    accessibilityLabel: 'Aba Grupos e Rotas com Módulos'
  },
  {
    key: 'ranking',
    label: 'Ranking XP',
    shortIcon: '★',
    accessibilityLabel: 'Aba Ranking de XP do Clã'
  },
  {
    key: 'settings',
    label: 'Ajustes',
    shortIcon: '⚙',
    accessibilityLabel: 'Aba Exportações CSV e Configurações'
  }
];

const SIMULATION_MODES: ReadonlyArray<{ mode: SimulationMode; label: string }> = [
  { mode: 'normal', label: 'Dados Mock' },
  { mode: 'empty', label: 'Estado Vazio' },
  { mode: 'error', label: 'Estado Erro' }
];

export default function App(): React.JSX.Element {
  const [api, setApi] = useState<ControllerApi | null>(null);
  const [auth, setAuth] = useState<AuthProvider | null>(null);
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [simMode, setSimMode] = useState<SimulationMode>(
    'normal'
  );
  const [refreshSignal, setRefreshSignal] = useState<number>(0);
  const [hostSummary, setHostSummary] = useState<HostState | null>(null);

  const handleSelectSimMode = (mode: SimulationMode): void => {
    api?.setSimulationMode(mode);
    setSimMode(mode);
    setRefreshSignal((prev) => prev + 1);
  };

  const handleLogout = async (): Promise<void> => {
    await auth?.logout();
    setApi(null); setAuth(null); setHostSummary(null); setActiveTab('overview');
    setSession(null);
  };

  const handleHostUpdated = useCallback((updated: HostState): void => {
    setHostSummary(updated);
  }, []);

  if (!session || !api) {
    return (
      <SafeAreaView style={ styles.safeArea }>
        <StatusBar barStyle="light-content" backgroundColor={ colors.background } />
        <LoginScreen
          onSessionExpired={() => { setSession(null); setApi(null); setAuth(null); setHostSummary(null); setActiveTab('overview'); }}
          onAuthenticated={ (newSession, newApi, newAuth, isDemo) => {
            setApi(newApi); setAuth(newAuth); setDemo(isDemo); setSession(newSession);
          } }
        />
      </SafeAreaView>
    );
  }

  const hostBadgeLabel =
    !hostSummary || hostSummary.status === 'online'
      ? (!hostSummary ? 'Host não consultado' : 'Host Online')
      : hostSummary.status === 'degraded'
        ? 'Manutenção'
        : 'Host Offline';

  const hostBadgeTone =
    !hostSummary || hostSummary.status === 'online'
      ? (!hostSummary ? 'neutral' : 'success')
      : hostSummary.status === 'degraded'
        ? 'warning'
        : 'danger';

  return (
    <SafeAreaView style={ styles.safeArea }>
      <StatusBar barStyle="light-content" backgroundColor={ colors.background } />
      <View style={ styles.shell }>
        <View style={ styles.topBar }>
          <View style={ styles.titleRow }>
            <View>
              <Text accessibilityRole="header" style={ styles.appTitle }>
                AeroBot Controller
              </Text>
              <Text style={ styles.appSubtitle }>
                Clã Mobile Legends • { session.adminAlias }
              </Text>
            </View>
            <Badge label={ hostBadgeLabel } tone={ hostBadgeTone } showDot />
          </View>

          {demo ? <View
            accessible
            accessibilityLabel="Seletor de modo de simulação de estados da interface"
            style={ styles.simToolbar }
          >
            <Text style={ styles.simLabel }>Modo demonstração:</Text>
            <View style={ styles.simPills }>
              { SIMULATION_MODES.map((item) => {
                const selected = simMode === item.mode;
                return (
                  <Pressable
                    key={ item.mode }
                    accessibilityRole="button"
                    accessibilityLabel={ `Alternar simulação para ${item.label}` }
                    accessibilityState={ { selected } }
                    onPress={ () => handleSelectSimMode(item.mode) }
                    style={ [styles.simPill, selected && styles.simPillSelected] }
                  >
                    <Text
                      style={ [
                        styles.simPillText,
                        selected && styles.simPillTextSelected
                      ] }
                    >
                      { item.label }
                    </Text>
                  </Pressable>
                );
              }) }
            </View>
          </View> : <Text style={styles.simLabel}>Modo real • Host remoto</Text>}
        </View>

        <View style={ styles.mainContent }>
          { activeTab === 'overview' ? (
            <OverviewScreen
              api={ api }
              refreshSignal={ refreshSignal }
              onHostUpdated={ handleHostUpdated }
            />
          ) : null }

          { activeTab === 'groups' ? (
            <GroupsScreen
              api={ api }
              refreshSignal={ refreshSignal }
            />
          ) : null }

          { activeTab === 'ranking' ? (
            <RankingScreen
              api={ api }
              refreshSignal={ refreshSignal }
            />
          ) : null }

          { activeTab === 'settings' ? (
            <SettingsScreen
              api={ api }
              session={ session }
              refreshSignal={ refreshSignal }
              onLogout={ () => {
                void handleLogout();
              } }
            />
          ) : null }
        </View>

        <View
          accessibilityRole="tablist"
          accessibilityLabel="Navegação principal do AeroBot Controller"
          style={ styles.bottomTabBar }
        >
          { TABS.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <Pressable
                key={ tab.key }
                accessibilityRole="tab"
                accessibilityLabel={ tab.accessibilityLabel }
                accessibilityState={ { selected: isSelected } }
                onPress={ () => setActiveTab(tab.key) }
                style={ [styles.tabItem, isSelected && styles.tabItemSelected] }
              >
                <Text style={ [styles.tabIcon, isSelected && styles.tabIconSelected] }>
                  { tab.shortIcon }
                </Text>
                <Text style={ [styles.tabLabel, isSelected && styles.tabLabelSelected] }>
                  { tab.label }
                </Text>
                { isSelected ? <View style={ styles.tabIndicator } /> : null }
              </Pressable>
            );
          }) }
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    backgroundColor: colors.background
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  appTitle: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  appSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  simToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  simLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  simPills: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  simPill: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated
  },
  simPillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  simPillText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  simPillTextSelected: {
    color: colors.primaryText,
    fontWeight: typography.weights.bold
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    position: 'relative'
  },
  tabItemSelected: {
    backgroundColor: colors.primarySoft
  },
  tabIcon: {
    color: colors.textMuted,
    fontSize: typography.sizes.md,
    marginBottom: 2
  },
  tabIconSelected: {
    color: colors.primaryText
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  tabLabelSelected: {
    color: colors.textPrimary,
    fontWeight: typography.weights.bold
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 20,
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.primary
  }
});
