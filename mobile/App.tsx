import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StatusBar, Text, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { AuthorityAlert, Config, ConnectionStatus, QueueItem, Report, Role } from './src/core/types';
import * as service from './src/core/services';
import { roleInfo, tabs, type Route } from './src/features/registry';
import { HomeScreen, RequestsScreen } from './src/features/Reports';
import { AssistantScreen } from './src/features/Assistant';
import { CreateReportScreen } from './src/features/CreateReport';
import { RelayScreen } from './src/features/Relay';
import { OutboxScreen } from './src/features/Outbox';
import { SettingsScreen } from './src/features/Settings';
import { ReportDetail } from './src/features/ReportDetail';
import { MapScreen } from './src/features/MapScreen';
import { AlertPopup } from './src/features/Alerts';
import { AuditScreen, GovernmentHome, ReliefHome, RescueHome, RescueUpdates, SheltersScreen, TeamsScreen } from './src/features/Ops';
import { SafetyScreen } from './src/features/Safety';
import { progressIndex, progressLabel } from './src/features/Tracker';
import { Button, Icon, Notice } from './src/ui/components';
import { colors, ui } from './src/ui/theme';
import { dateLabel, localizeMessage, word } from './src/ui/words';

const defaultConfig: Config = { apiUrl: 'http://127.0.0.1:8000', language: 'en', forceOffline: false };

function RelayApp() {
  const [role, setRole] = useState<Role>('citizen');
  const [route, setRoute] = useState<Route>('home');
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [reports, setReports] = useState<Report[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [alerts, setAlerts] = useState<AuthorityAlert[]>([]);
  // Last seen progress per report, so SOS updates are announced once.
  const seenProgress = useRef<{ role: Role; steps: Map<string, number> } | null>(null);
  // Official alerts the person has already read; null until loaded so nothing pops early.
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  const dismissedRef = useRef<Set<string> | null>(null);
  dismissedRef.current = dismissed;
  const popup = dismissed ? alerts.find(alert => !dismissed.has(alert.id)) : undefined;
  useEffect(() => { void service.loadReadAlerts().then(ids => setDismissed(new Set(ids))).catch(() => setDismissed(new Set())); }, []);
  useEffect(() => { if (popup) Vibration.vibrate(popup.severity === 'danger' ? [0, 600, 200, 600, 200, 600] : [0, 300, 150, 300]); }, [popup?.id]);
  function readAlert(id: string) {
    const next = new Set(dismissedRef.current || []); next.add(id); setDismissed(next);
    void service.saveReadAlerts([...next].slice(-200)).catch(() => undefined);
  }
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: 'never', last_attempt_at: null, last_success_at: null, error: null, backend_id: null });
  const [message, setMessage] = useState('Reports are saved locally first.');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [relayId, setRelayId] = useState<string>();
  const roleRef = useRef(role);
  const configRef = useRef(config);
  const syncLock = useRef(false);
  const settingsLock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const language = config.language;
  roleRef.current = role;
  configRef.current = config;

  const refresh = useCallback(async () => {
    const current = roleRef.current;
    const address = configRef.current.apiUrl;
    const [nextReports, nextQueue, nextConnection, nextAlerts] = await Promise.all([service.loadReports(current), service.loadQueue(current), service.loadConnectionStatus(), service.loadAlerts()]);
    if (roleRef.current === current && configRef.current.apiUrl === address) { setReports(nextReports); setQueue(nextQueue); setConnection(nextConnection); setAlerts(nextAlerts); announce(current, nextReports, nextAlerts); }
  }, []);
  /** Delivery acknowledgement for the person who asked for help, plus new official alerts. */
  function announce(current: Role, nextReports: Report[], nextAlerts: AuthorityAlert[]) {
    const lang = configRef.current.language;
    // An unread official alert pops up on its own; don't stack an SOS update dialog over it.
    const alertPending = nextAlerts.some(alert => !dismissedRef.current?.has(alert.id));
    const steps = new Map(nextReports.filter(r => r.source !== 'seed').map(r => [r.id, progressIndex(r)]));
    const previous = seenProgress.current?.role === current ? seenProgress.current.steps : null;
    seenProgress.current = { role: current, steps };
    if (!previous || (current !== 'citizen' && current !== 'volunteer')) return;
    const advanced = nextReports.filter(r => previous.has(r.id) && (steps.get(r.id) ?? 0) > (previous.get(r.id) ?? 0));
    if (!advanced.length || alertPending) return;
    const r = advanced[0];
    Vibration.vibrate([0, 250, 120, 250]);
    setMessage(`Update: ${progressLabel(r, 'en')} — ${r.location.label}`);
    Alert.alert(word(lang, 'Your SOS was updated', 'നിങ്ങളുടെ SOS പുതുക്കി'), `${progressLabel(r, lang)}

📍 ${r.location.label}`);
  }
  const sync = useCallback(async () => {
    if (syncLock.current || settingsLock.current) return;
    const current = roleRef.current;
    if (configRef.current.forceOffline) { setMessage('Offline practice: reports and changes remain on this device.'); return; }
    syncLock.current = true; setSyncing(true);
    try {
      const result = await service.runSync(current, configRef.current.apiUrl);
      if (roleRef.current === current) setMessage(result.message);
      await refresh();
    } catch (e) {
      if (roleRef.current === current) setMessage(e instanceof Error ? e.message : 'Sync unavailable. Pending reports remain on this device.');
      try { await refresh(); } catch { /* Keep the last visible local snapshot. */ }
    } finally { syncLock.current = false; setSyncing(false); }
  }, [refresh]);

  useEffect(() => { let active = true; void (async () => { try {
    const saved = await service.loadConfig();
    if (!active) return;
    configRef.current = saved; setConfig(saved); await refresh(); setReady(true);
  } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not open local storage.'); } })(); return () => { active = false; }; }, [refresh]);
  useEffect(() => {
    if (!ready) return;
    let active = true; setWorkspaceLoading(true);
    void refresh().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load workspace'); }).finally(() => { if (active) setWorkspaceLoading(false); });
    void sync(); return () => { active = false; };
  }, [role, ready, refresh, sync]);
  useEffect(() => { if (!ready) return; const timer = setInterval(() => void sync(), 10000); const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); }); return () => { clearInterval(timer); listener.remove(); }; }, [ready, sync]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [route, role]);

  function navigate(next: Route) { if (settingsLock.current) return; setRoute(next); setError(''); }
  async function updateConfig(partial: Partial<Config>) {
    if (syncLock.current || settingsLock.current) throw new Error(word(configRef.current.language, 'Wait for the current server check to finish, then try again.', 'നിലവിലെ സെർവർ പരിശോധന പൂർത്തിയായ ശേഷം വീണ്ടും ശ്രമിക്കുക.'));
    settingsLock.current = true; setConfigSaving(true);
    try {
      await service.setConfig(partial);
      const next = await service.loadConfig(); configRef.current = next; setConfig(next);
      if (partial.apiUrl !== undefined) { setSelectedId(undefined); setRelayId(undefined); setMessage('Server checked and settings saved. Pending reports still require sync for delivery.'); }
      await refresh();
    } finally { settingsLock.current = false; setConfigSaving(false); }
    if (partial.forceOffline === false || partial.apiUrl !== undefined) void sync();
  }
  function switchRole(next: Role) { if (settingsLock.current || roleRef.current === next) return; roleRef.current = next; setRole(next); setReports([]); setQueue([]); setSelectedId(undefined); setContextId(undefined); setRelayId(undefined); navigate('home'); setMessage('Loading this demo workspace...'); }
  async function created(report: Report) { if (report.origin_id !== service.demoUser(roleRef.current).id) return; await refresh(); navigate('home'); setSelectedId(report.id); setMessage('SOS saved on this device. It has not been delivered to the server.'); void sync(); }
  function showRelay(id: string) { setSelectedId(undefined); setRelayId(id); navigate('relay'); }
  // The incident an official last opened gives the assistant context for "Explain priority".
  const [contextId, setContextId] = useState<string>();
  function open(id: string) { setSelectedId(id); setContextId(id); }
  const selected = reports.find(r => r.id === selectedId);
  const tick = connection.last_attempt_at;
  const connectionState = config.forceOffline ? 'paused' : syncing || configSaving ? 'checking' : connection.state;
  const connectionLabel = word(language, ({ never: 'Server not checked', checking: 'Checking server', reachable: 'Last check succeeded', unreachable: 'Server check failed', paused: 'Sync paused' })[connectionState], ({ never: 'സെർവർ പരിശോധിച്ചിട്ടില്ല', checking: 'സെർവർ പരിശോധിക്കുന്നു', reachable: 'അവസാന പരിശോധന വിജയിച്ചു', unreachable: 'സെർവർ പരിശോധന പരാജയപ്പെട്ടു', paused: 'സിങ്ക് നിർത്തി' })[connectionState]);

  const victim = role === 'citizen' || role === 'volunteer';
  const headerButton = (label: string, icon: React.ComponentProps<typeof Icon>['name'], onPress: () => void, disabled?: boolean, busy?: boolean) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.navySoft, opacity: pressed || disabled ? 0.5 : 1 })}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name={icon} size={22} color="#FFFFFF" />}
    </Pressable>;
  const moreLinks: [Route, string, React.ComponentProps<typeof Icon>['name']][] = [['shelters', 'Shelters & camps', 'home-outline'], ['audit', 'Audit log', 'document-text-outline'], ['queue', `Outbox (${queue.length} queued)`, 'swap-vertical-outline'], ['assistant', 'RESQ Assistant', 'chatbubbles-outline']];

  return <SafeAreaView style={[ui.page, { backgroundColor: colors.navy }]} edges={['top']}>
    <StatusBar barStyle="light-content" backgroundColor={colors.navy} />
    <View style={{ backgroundColor: colors.navy }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, maxWidth: 800, width: '100%', alignSelf: 'center', gap: 4 }}>
        <View style={ui.between}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.red, justifyContent: 'center', alignItems: 'center' }}><Icon name="pulse" color="#FFFFFF" size={24} /></View>
            <View style={{ flex: 1 }}><Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '900', letterSpacing: 0.5 }}>RESQ</Text><Text numberOfLines={1} style={{ color: '#A9BBD1', fontSize: language === 'ml' ? 9 : 10, fontWeight: '700', letterSpacing: language === 'ml' ? 0.1 : 1.4 }}>{word(language, 'COLLECT FASTER. RESPOND SMARTER.', 'വേഗം ശേഖരിക്കുക. മികച്ച പ്രതികരണം.')}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {route !== 'assistant' ? headerButton(word(language, 'Open RESQ Assistant', 'RESQ അസിസ്റ്റന്റ് തുറക്കുക'), 'chatbubbles-outline', () => navigate('assistant')) : null}
            {headerButton(word(language, 'Sync with server now', 'സെർവറുമായി സിങ്ക് ചെയ്യുക'), 'sync-outline', () => void sync(), !ready || syncing || configSaving || config.forceOffline, syncing)}
          </View>
        </View>
        <View style={[ui.between, { flexWrap: 'wrap' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Change demo role', 'ഡെമോ ഉപയോക്തൃവിഭാഗം മാറ്റുക')} onPress={() => navigate('settings')} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44, flexShrink: 1 }}><Icon name={roleInfo[role].icon} size={16} color="#C9D6E6" /><Text style={{ color: '#E2EAF4', fontSize: 12, fontWeight: '700' }}>{word(language, `DEMO · ${roleInfo[role].title}`, `ഡെമോ · ${roleInfo[role].ml}`)}</Text><Icon name="chevron-down-outline" size={13} color="#C9D6E6" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${connectionLabel}. ${word(language, 'Open outbox', 'ഔട്ട്ബോക്സ് തുറക്കുക')}`} onPress={() => navigate('queue')} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connectionState === 'reachable' ? colors.green : connectionState === 'unreachable' ? colors.red : colors.orange }} /><Text style={{ color: '#C9D6E6', fontSize: 12 }}>{config.forceOffline ? word(language, 'Offline mode', 'ഓഫ്‌ലൈൻ') : connectionLabel}{queue.length ? ` · ${queue.length} ${word(language, 'queued', 'ക്യൂവിൽ')}` : ''}</Text></Pressable>
        </View>
      </View>
    </View>
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    {!ready ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>{error ? <Notice tone="error" title={word(language, 'Local storage unavailable', 'ലോക്കൽ സംഭരണം ലഭ്യമല്ല')} text={localizeMessage(language, error)} /> : <><ActivityIndicator size="large" color={colors.teal} /><Text style={ui.subtitle}>{word(language, 'Opening your local workspace...', 'നിങ്ങളുടെ ലോക്കൽ വർക്ക്‌സ്‌പേസ് തുറക്കുന്നു...')}</Text></>}</View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={colors.teal} enabled={!config.forceOffline} />} contentContainerStyle={ui.content}>
        {config.forceOffline || configSaving || error || (victim && route === 'home') ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, backgroundColor: config.forceOffline ? colors.amberLight : colors.blueLight, borderRadius: 11 }}><Icon name={config.forceOffline ? 'cloud-offline-outline' : 'phone-portrait-outline'} size={16} color={colors.muted} /><Text numberOfLines={3} style={[ui.small, { flex: 1 }]}>{configSaving ? word(language, 'Checking the server identity and saving settings. Your existing reports are kept.', 'സെർവർ തിരിച്ചറിയൽ പരിശോധിച്ച് ക്രമീകരണം സേവ് ചെയ്യുന്നു.') : config.forceOffline ? word(language, 'Offline mode is on. New reports stay on this phone until you turn it off.', 'ഓഫ്‌ലൈൻ മോഡ് ഓൺ. റിപ്പോർട്ടുകൾ ഫോണിൽ തന്നെ.') : localizeMessage(language, message)}</Text></View> : null}
        {error ? <Notice tone="error" text={localizeMessage(language, error)}><Button title={word(language, 'Dismiss', 'അടയ്ക്കുക')} tone="quiet" onPress={() => setError('')} /></Notice> : null}
        {workspaceLoading ? <View accessibilityLiveRegion="polite" style={ui.row}><ActivityIndicator color={colors.teal} /><Text style={ui.subtitle}>{word(language, 'Loading this role’s data...', 'ലോഡ് ചെയ്യുന്നു...')}</Text></View> : null}
        {route === 'home' && victim ? <HomeScreen key={role} role={role} language={language} reports={reports} queue={queue} alerts={alerts} config={config} onOpen={open} onCreate={() => navigate('create')} onRelay={() => navigate('relay')} onQuickCreated={created} onNavigate={navigate} onSync={() => void sync()} syncing={syncing} lastSync={connection.last_success_at} tick={tick} /> : null}
        {route === 'requests' && victim ? <RequestsScreen role={role} language={language} reports={reports} queue={queue} config={config} syncing={syncing} lastSync={connection.last_success_at} onOpen={open} onSync={() => void sync()} onCreate={() => navigate('create')} /> : null}
        {route === 'create' && victim ? <CreateReportScreen key={role} role={role} language={language} onCreated={created} /> : null}
        {route === 'relay' && victim ? <RelayScreen key={`${role}:${relayId || ''}`} role={role} language={language} reports={reports} onImported={refresh} initialReportId={relayId} /> : null}
        {(route === 'home' || route === 'incidents') && role === 'coordinator' ? <GovernmentHome view={route === 'home' ? 'overview' : 'incidents'} language={language} reports={reports} queue={queue} config={config} tick={tick} onOpen={open} onRefresh={refresh} onSync={() => void sync()} onIncidents={() => navigate('incidents')} /> : null}
        {route === 'teams' ? <TeamsScreen role={role} tick={tick} onOpen={open} /> : null}
        {route === 'audit' ? <AuditScreen role={role} tick={tick} /> : null}
        {route === 'more' ? <View style={{ gap: 10 }}>{moreLinks.map(([id, label, icon]) => <Pressable key={id} accessibilityRole="button" onPress={() => navigate(id)} style={({ pressed }) => [ui.card, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, opacity: pressed ? 0.7 : 1 }]}><Icon name={icon} /><Text style={[ui.h3, { flex: 1 }]}>{label}</Text><Icon name="chevron-forward" color={colors.muted} size={18} /></Pressable>)}</View> : null}
        {route === 'home' && role === 'responder' ? <RescueHome reports={reports} queue={queue} tick={tick} onOpen={open} /> : null}
        {route === 'updates' ? <RescueUpdates reports={reports} alerts={alerts} onOpen={open} /> : null}
        {route === 'resources' ? <View style={{ gap: 20 }}><ReliefHome view="inventory" role={role} reports={reports} tick={tick} onOpen={open} /><SheltersScreen role={role} tick={tick} /></View> : null}
        {(route === 'home' || route === 'inventory' || route === 'dispatch') && role === 'relief' ? <ReliefHome view={route === 'home' ? 'requests' : route} reports={reports} tick={tick} onOpen={open} /> : null}
        {route === 'shelters' ? <SheltersScreen role={role} tick={tick} /> : null}
        {route === 'safety' ? <SafetyScreen language={language} alerts={alerts} /> : null}
        {route === 'assistant' ? <AssistantScreen key={role} role={role} language={language} reportId={role === 'coordinator' ? contextId : undefined} onNavigate={navigate} /> : null}
        {route === 'map' ? <MapScreen language={language} role={role} reports={reports} tick={tick} online={!config.forceOffline && connection.state !== 'unreachable'} /> : null}
        {route === 'queue' ? <OutboxScreen role={role} language={language} queue={queue} onRefresh={refresh} onSync={() => void sync()} syncing={syncing} offline={config.forceOffline} /> : null}
        {route === 'settings' || route === 'more' ? <SettingsScreen role={role} config={config} language={language} onRole={switchRole} onConfig={updateConfig} syncing={syncing || configSaving} queuedCount={queue.length} connection={connection} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>}
    <SafeAreaView edges={['bottom']} style={{ borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: colors.paper }}><View style={{ flexDirection: 'row', width: '100%', maxWidth: 800, alignSelf: 'center' }}>{tabs[role].map(item => {
      const active = route === item.id, sos = item.id === 'create' && role === 'citizen';
      const tint = sos ? colors.red : active ? colors.teal : colors.muted;
      return <Pressable key={item.id} disabled={configSaving} accessibilityRole="tab" accessibilityLabel={word(language, item.label, item.ml)} accessibilityState={{ selected: active }} onPress={() => navigate(item.id)} style={({ pressed }) => ({ flex: 1, minHeight: 64, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.6 : 1, borderTopWidth: 3, borderTopColor: active ? tint : 'transparent' })}>
        <View>{sos ? <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}><Icon name="alert" color="#FFFFFF" size={22} /></View> : <Icon name={item.icon} color={tint} size={23} />}{item.id === 'requests' && queue.length > 0 ? <View style={{ position: 'absolute', top: -6, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{queue.length > 9 ? '9+' : queue.length}</Text></View> : null}</View>
        <Text style={{ color: tint, fontSize: 11, fontWeight: active || sos ? '800' : '600', textAlign: 'center' }}>{word(language, item.label, item.ml)}</Text>
      </Pressable>;
    })}</View></SafeAreaView>
    </View>
    {popup ? <AlertPopup alert={popup} language={language} onClose={() => readAlert(popup.id)} /> : null}
    <ReportDetail report={selected} role={role} language={language} queue={queue} config={config} onClose={() => setSelectedId(undefined)} onRefresh={refresh} onRelay={showRelay} />
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><RelayApp /></SafeAreaProvider>; }

