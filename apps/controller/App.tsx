import { LeadershipScreen } from './src/screens/LeadershipScreen';
import { AeroPressable as Pressable } from './src/components/AeroPressable';
import React, { useCallback, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { AeroMark, AeroWordmark, AeroIcon } from './src/components/AeroBrand';
import { useFonts } from 'expo-font';
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Badge } from './src/components';
import { ConnectionScreen, WhatsAppGroupsScreen } from './src/screens/ConnectionScreen';
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
import { borders, colors, radii, spacing, typography } from './src/theme';

type TabKey = 'connection' | 'overview' | 'groups' | 'ranking' | 'settings';

interface TabItem {
  key: TabKey;
  label: string;
  accessibilityLabel: string;
}

const TABS: ReadonlyArray<TabItem> = [
  { key: 'connection', label: 'Conexão', accessibilityLabel: 'Aba Conexão WhatsApp' },
  {
    key: 'overview',
    label: 'Visão geral',
    accessibilityLabel: 'Aba Visão Geral e Estado do Host'
  },
  {
    key: 'groups',
    label: 'Grupos',
    accessibilityLabel: 'Aba Grupos e Rotas com Módulos'
  },
  {
    key: 'ranking',
    label: 'Ranking',
    accessibilityLabel: 'Aba Ranking de XP do Clã'
  },
  {
    key: 'settings',
    label: 'Mais',
    accessibilityLabel: 'Aba Exportações CSV e Configurações'
  }
];

const SIMULATION_MODES: ReadonlyArray<{ mode: SimulationMode; label: string }> = [
  { mode: 'normal', label: 'Padrão' },
  { mode: 'empty', label: 'Vazio' },
  { mode: 'error', label: 'Erro' }
];

export default function App(): React.JSX.Element {
  const [fontsLoaded, fontError] = useFonts({ CormorantGaramond_500Medium, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold });
  const [api, setApi] = useState<ControllerApi | null>(null);
  const [auth, setAuth] = useState<AuthProvider | null>(null);
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [simMode, setSimMode] = useState<SimulationMode>(
    'normal'
  );
  const [refreshSignal, setRefreshSignal] = useState<number>(0);
  const [moreLeadership, setMoreLeadership] = useState(true);
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

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={[styles.safeArea, { alignItems: 'center', justifyContent: 'center', gap: spacing.xl }]}><AeroMark size={80} /><Text style={{ color: colors.gold, letterSpacing: 8 }}>AERO</Text><Text style={{ color: colors.textSecondary }}>Preparando o painel…</Text></SafeAreaView>;
  }

  if (!session || !api) {
    return (
      <SafeAreaView style={ styles.safeArea }>
        <StatusBar barStyle="light-content" backgroundColor={ colors.background } />
        <LoginScreen
          onSessionExpired={() => { setSession(null); setApi(null); setAuth(null); setHostSummary(null); setActiveTab('overview'); }}
          onAuthenticated={ (newSession, newApi, newAuth, isDemo) => {
            setApi(newApi); setAuth(newAuth); setDemo(isDemo); setSession(newSession); setActiveTab('connection');
            void newApi.getConnection().then(state => { if (state.state === 'conectado') setActiveTab('overview'); }).catch(() => undefined);
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><AeroMark size={32} /><AeroWordmark size={30} /></View>
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
            <Badge label="DEMONSTRAÇÃO" tone="info" />
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
          { activeTab === 'connection' ? <ConnectionScreen api={api} /> : null }
          { activeTab === 'overview' ? (
            <OverviewScreen
              api={ api }
              refreshSignal={ refreshSignal }
              onHostUpdated={ handleHostUpdated }
            />
          ) : null }

          { activeTab === 'groups' ? (
            <WhatsAppGroupsScreen api={api} demo={demo} />
          ) : null }

          { activeTab === 'ranking' ? (
            <RankingScreen
              api={ api }
              refreshSignal={ refreshSignal }
            />
          ) : null }

          { activeTab === 'settings' ? <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}><Pressable onPress={() => setMoreLeadership(true)}><Text style={{color: colors.gold}}>Liderança</Text></Pressable><Pressable onPress={() => setMoreLeadership(false)}><Text style={{color: colors.gold}}>Ajustes e sair</Text></Pressable></View> : null }
          { activeTab === 'settings' && moreLeadership ? <LeadershipScreen api={api}/> : null }
          { activeTab === 'settings' && !moreLeadership ? (
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
          accessibilityLabel="Navegação principal do AERO"
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
                <AeroIcon name={tab.key} color={isSelected ? colors.gold : colors.textMuted} />
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
    maxWidth: 540,
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderLeftWidth: borders.hairline, borderRightWidth: borders.hairline, borderColor: colors.border
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm
  },
  titleRow: {
    flexWrap: 'wrap',
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  appSubtitle: {
    maxWidth: 240,
    color: colors.textSecondary,
    fontFamily: typography.families.ui,
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
    textTransform: 'uppercase',
    letterSpacing: typography.tracking.label,
    color: colors.textMuted,
    fontFamily: typography.families.bold,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.regular
  },
  simPills: {
    flexDirection: 'row',
    gap: spacing.xs
  },
  simPill: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated
  },
  simPillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  simPillText: {
    color: colors.textSecondary,
    fontFamily: typography.families.medium,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.regular
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
    borderTopWidth: borders.hairline,
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
  tabLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: colors.textSecondary,
    fontFamily: typography.families.medium,
    fontSize: typography.sizes.nav,
    fontWeight: typography.weights.regular
  },
  tabLabelSelected: {
    color: colors.textPrimary,
    fontWeight: typography.weights.bold
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 20,
    height: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.gold
  }
});
