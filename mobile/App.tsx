import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Config, ConnectionStatus, QueueItem, Report, Role } from './src/core/types';
import * as service from './src/core/services';
import { modules, roleInfo, type Route } from './src/features/registry';
import { ReportsScreen } from './src/features/Reports';
import { CreateReportScreen } from './src/features/CreateReport';
import { RelayScreen } from './src/features/Relay';
import { OutboxScreen } from './src/features/Outbox';
import { SettingsScreen } from './src/features/Settings';
import { ReportDetail } from './src/features/ReportDetail';
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
    const [nextReports, nextQueue, nextConnection] = await Promise.all([service.loadReports(current), service.loadQueue(current), service.loadConnectionStatus()]);
    if (roleRef.current === current && configRef.current.apiUrl === address) { setReports(nextReports); setQueue(nextQueue); setConnection(nextConnection); }
  }, []);
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
  useEffect(() => { if (!ready) return; const timer = setInterval(() => void sync(), 20000); const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); }); return () => { clearInterval(timer); listener.remove(); }; }, [ready, sync]);
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
  function switchRole(next: Role) { if (settingsLock.current || roleRef.current === next) return; roleRef.current = next; setRole(next); setReports([]); setQueue([]); setSelectedId(undefined); setRelayId(undefined); navigate('home'); setMessage('Loading this demo workspace...'); }
  async function created(report: Report) { if (report.origin_id !== service.demoUser(roleRef.current).id) return; await refresh(); navigate('home'); setSelectedId(report.id); setMessage('SOS saved on this device. It has not been delivered to the server.'); }
  function showRelay(id: string) { setSelectedId(undefined); setRelayId(id); navigate('relay'); }
  async function seed() { try { await service.seedDemo(roleRef.current); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load samples.'); } }
  const selected = reports.find(r => r.id === selectedId);
  const connectionState = config.forceOffline ? 'paused' : syncing || configSaving ? 'checking' : connection.state;
  const connectionLabel = word(language, ({ never: 'Server not checked', checking: 'Checking server', reachable: 'Last check succeeded', unreachable: 'Server check failed', paused: 'Sync paused' })[connectionState], ({ never: 'സെർവർ പരിശോധിച്ചിട്ടില്ല', checking: 'സെർവർ പരിശോധിക്കുന്നു', reachable: 'അവസാന പരിശോധന വിജയിച്ചു', unreachable: 'സെർവർ പരിശോധന പരാജയപ്പെട്ടു', paused: 'സിങ്ക് നിർത്തി' })[connectionState]);

  return <SafeAreaView style={ui.page} edges={['top', 'bottom']}>
    <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
    <View style={{ backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, maxWidth: 800, width: '100%', alignSelf: 'center', gap: 12 }}>
        <View style={ui.between}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}><View style={{ width: 43, height: 43, borderRadius: 14, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center' }}><Icon name="radio-outline" color="#FFFFFF" size={28} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.navy, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 }}>ResQ Relay</Text><Text style={{ color: colors.muted, fontSize: language === 'ml' ? 9 : 10, fontWeight: '700', letterSpacing: language === 'ml' ? 0.1 : 1.8 }}>{word(language, 'HELP MOVES WITH PEOPLE', 'മനുഷ്യരിലൂടെ സഹായം എത്തുന്നു')}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Sync with backend now', 'സെർവറുമായി സിങ്ക് ചെയ്യുക')} disabled={!ready || syncing || configSaving || config.forceOffline} onPress={() => void sync()} style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.tealLight, opacity: pressed || config.forceOffline ? 0.5 : 1 })}>{syncing ? <ActivityIndicator color={colors.teal} /> : <Icon name="sync-outline" size={23} />}</Pressable></View>
        <View style={[ui.between, { flexWrap: 'wrap' }]}><Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Change demo role', 'ഡെമോ ഉപയോക്തൃവിഭാഗം മാറ്റുക')} onPress={() => navigate('settings')} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44, flexShrink: 1 }}><Icon name={roleInfo[role].icon} size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{word(language, `DEMO · ${roleInfo[role].title}`, `ഡെമോ · ${roleInfo[role].ml}`)}</Text><Icon name="chevron-down-outline" size={13} color={colors.muted} /></Pressable><View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connectionState === 'reachable' ? colors.teal : connectionState === 'unreachable' ? colors.red : colors.amber }} /><Text style={ui.small}>{connectionLabel}</Text></View></View>
      </View>
    </View>
    {!ready ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>{error ? <Notice tone="error" title={word(language, 'Local storage unavailable', 'ലോക്കൽ സംഭരണം ലഭ്യമല്ല')} text={localizeMessage(language, error)} /> : <><ActivityIndicator size="large" color={colors.teal} /><Text style={ui.subtitle}>{word(language, 'Opening your local workspace...', 'നിങ്ങളുടെ ലോക്കൽ വർക്ക്‌സ്‌പേസ് തുറക്കുന്നു...')}</Text></>}</View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={colors.teal} enabled={!config.forceOffline} />} contentContainerStyle={ui.content}>
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 11, backgroundColor: config.forceOffline ? colors.amberLight : '#EDF2F0', borderRadius: 11 }}><Icon name={config.forceOffline ? 'cloud-offline-outline' : syncing ? 'sync-outline' : 'phone-portrait-outline'} size={16} color={colors.muted} /><Text numberOfLines={4} style={[ui.small, { flex: 1 }]}>{configSaving ? word(language, 'Checking the server identity and saving settings. Your existing reports are kept.', 'സെർവർ തിരിച്ചറിയൽ പരിശോധിച്ച് ക്രമീകരണം സേവ് ചെയ്യുന്നു. പഴയ റിപ്പോർട്ടുകൾ നിലനിൽക്കും.') : syncing ? word(language, 'Checking the server. Pending reports remain local until confirmed.', 'സെർവർ പരിശോധിക്കുന്നു. സ്ഥിരീകരണം വരെ റിപ്പോർട്ടുകൾ ഉപകരണത്തിൽ തന്നെ.') : config.forceOffline ? word(language, 'Offline practice is on. New sync attempts are paused.', 'ഓഫ്‌ലൈൻ പരിശീലനം ഓൺ. പുതിയ സിങ്ക് ശ്രമങ്ങൾ നിൽക്കും.') : localizeMessage(language, message)}</Text></View>
        {error ? <Notice tone="error" text={localizeMessage(language, error)}><Button title={word(language, 'Dismiss', 'അടയ്ക്കുക')} tone="quiet" onPress={() => setError('')} /></Notice> : null}
        {connection.last_success_at ? <Text style={ui.small}>{word(language, 'Last successful server contact', 'അവസാനം സെർവറുമായി ബന്ധിപ്പിച്ചത്')}: {dateLabel(connection.last_success_at, language)} · {queue.length} {word(language, 'queued', 'ക്യൂവിൽ')}</Text> : <Text style={ui.small}>{word(language, 'No server contact confirmed yet. Local reports remain on this device.', 'സെർവറുമായുള്ള ബന്ധം ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല. റിപ്പോർട്ടുകൾ ഈ ഉപകരണത്തിൽ നിലനിൽക്കും.')}</Text>}
        {workspaceLoading ? <View accessibilityLiveRegion="polite" style={ui.row}><ActivityIndicator color={colors.teal} /><Text style={ui.subtitle}>{word(language, 'Loading this role’s saved reports...', 'ഈ ഉപയോക്തൃവിഭാഗത്തിന്റെ റിപ്പോർട്ടുകൾ തുറക്കുന്നു...')}</Text></View> : null}
        {route === 'home' ? <ReportsScreen key={role} role={role} language={language} reports={reports} queue={queue} onOpen={setSelectedId} onCreate={() => navigate('create')} onRelay={() => navigate('relay')} onSeed={() => void seed()} /> : null}
        {route === 'create' && (role === 'citizen' || role === 'volunteer') ? <CreateReportScreen key={role} role={role} language={language} onCreated={created} /> : null}
        {route === 'relay' && (role === 'citizen' || role === 'volunteer') ? <RelayScreen key={`${role}:${relayId || ''}`} role={role} language={language} reports={reports} onImported={refresh} initialReportId={relayId} /> : null}
        {route === 'queue' ? <OutboxScreen role={role} language={language} queue={queue} onRefresh={refresh} onSync={() => void sync()} syncing={syncing} offline={config.forceOffline} /> : null}
        {route === 'settings' ? <SettingsScreen role={role} config={config} language={language} onRole={switchRole} onConfig={updateConfig} syncing={syncing || configSaving} queuedCount={queue.length} connection={connection} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>}
    <View style={{ borderTopColor: colors.line, borderTopWidth: 1, backgroundColor: colors.paper }}><View style={{ flexDirection: 'row', width: '100%', maxWidth: 800, alignSelf: 'center' }}>{modules.filter(m => m.roles.includes(role)).map(item => <Pressable key={item.id} disabled={configSaving} accessibilityRole="tab" accessibilityLabel={word(language, item.label, item.ml)} accessibilityState={{ selected: route === item.id }} onPress={() => navigate(item.id)} style={({ pressed }) => ({ flex: 1, minHeight: 72, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? 0.6 : 1, borderTopWidth: 3, borderTopColor: route === item.id ? colors.teal : 'transparent' })}><View><Icon name={item.icon} color={route === item.id ? colors.teal : colors.muted} size={23} />{item.id === 'queue' && queue.length > 0 ? <View style={{ position: 'absolute', top: -6, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{queue.length > 9 ? '9+' : queue.length}</Text></View> : null}</View><Text style={{ color: route === item.id ? colors.teal : colors.muted, fontSize: 10, fontWeight: route === item.id ? '800' : '600', textAlign: 'center' }}>{word(language, item.label, item.ml)}</Text></Pressable>)}</View></View>
    <ReportDetail report={selected} role={role} language={language} queue={queue} config={config} onClose={() => setSelectedId(undefined)} onRefresh={refresh} onRelay={showRelay} />
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><RelayApp /></SafeAreaProvider>; }

