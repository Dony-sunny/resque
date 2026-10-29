import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AuthorityAlert, Config, Report, Role, QueueItem, ShelterView } from '../core/types';
import * as service from '../core/services';
import { QuickSos } from './QuickSos';
import { progressLabel } from './Tracker';
import type { Route } from './registry';
import { Badge, Button, Chip, Empty, Icon, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, friendly, incidentName, isSyntheticDescription, word, type Language } from '../ui/words';

/** Delivery state in plain words: saved on device → pending sync / failed → server received → acknowledged. */
export function DeliveryBadge({ report, language, queue = [], syncing }: { report: Report; language: Language; queue?: QueueItem[]; syncing?: boolean }) {
  if (report.source === 'seed') return <Badge label={word(language, 'SYNTHETIC EXAMPLE', 'കൃത്രിമ ഉദാഹരണം')} />;
  if (report.delivery_state === 'pending') {
    const item = queue.find(q => q.report_id === report.id && q.kind === 'report.create');
    if (syncing) return <Badge tone="warning" label={word(language, 'SYNCING…', 'സിങ്ക് ചെയ്യുന്നു…')} />;
    if (item && (item.status === 'blocked' || item.status === 'conflict' || item.attempts > 0)) return <Badge tone="danger" label={word(language, 'NOT SENT YET · WILL RETRY', 'അയച്ചിട്ടില്ല · വീണ്ടും ശ്രമിക്കും')} />;
    return <Badge tone="warning" label={word(language, 'SAVED ON DEVICE · PENDING SYNC', 'ഫോണിൽ സേവ് ചെയ്തു · സിങ്ക് കാത്തിരിക്കുന്നു')} />;
  }
  return <Badge tone="success" label={report.delivery_state === 'delivered' ? word(language, 'SERVER RECEIVED', 'സെർവറിൽ എത്തി') : word(language, 'ACKNOWLEDGED BY OFFICIALS', 'അധികൃതർ സ്വീകരിച്ചു')} />;
}

const icons: Record<string, IconName> = { flood: 'water-outline', medical: 'medkit-outline', fire: 'flame-outline', trapped: 'body-outline', supplies: 'cube-outline', landslide: 'trending-down-outline', earthquake: 'pulse-outline', cyclone: 'thunderstorm-outline', other: 'alert-circle-outline' };

export function ReportCard({ report, role, language, queue, syncing, onPress }: { report: Report; role: Role; language: Language; queue: QueueItem[]; syncing?: boolean; onPress: () => void }) {
  const pending = queue.filter(q => q.report_id === report.id).length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${incidentName(report.incident_type, language)}, ${report.location.label}, ${friendly(report.delivery_state, language)}. ${word(language, 'Open details', 'വിവരങ്ങൾ തുറക്കുക')}`} onPress={onPress} style={({ pressed }) => [ui.card, { opacity: pressed ? 0.75 : 1 }]}>
    <View style={ui.between}><DeliveryBadge report={report} language={language} queue={queue} syncing={syncing} /><Text style={ui.small}>#{report.id.slice(0, 8)}</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' }}><Icon name={icons[report.incident_type] || 'alert-circle-outline'} /></View><View style={{ flex: 1 }}><Text style={ui.h3}>{incidentName(report.incident_type, language)}</Text><Text style={ui.small}>{report.affected_count} {word(language, 'people affected', 'പേർക്ക് സഹായം വേണം')} · {dateLabel(report.created_at, language)}</Text></View><Icon name="chevron-forward" color={colors.muted} size={18} /></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}><Icon name="location-outline" size={17} color={colors.muted} /><Text style={[ui.subtitle, { flex: 1 }]} numberOfLines={2}>{report.location.label}</Text></View>
    <View style={ui.row}>
      {report.source !== 'seed' && isSyntheticDescription(report.description) ? <Badge label={word(language, 'SYNTHETIC DEMO DATA', 'കൃത്രിമ ഡെമോ ഡാറ്റ')} /> : null}
      {pending > 0 ? <Badge label={`${pending} ${word(language, 'change(s) waiting to sync', 'മാറ്റങ്ങൾ ക്യൂവിൽ')}`} tone="warning" /> : null}
      {(role === 'citizen' || role === 'volunteer') && report.source !== 'seed' && report.delivery_state !== 'pending' ? <Badge label={progressLabel(report, language).toUpperCase()} tone={report.mission_status === 'completed' ? 'success' : 'neutral'} /> : null}
    </View>
  </Pressable>;
}

function SyncCard({ language, queue, config, syncing, lastSync, onSync }: { language: Language; queue: QueueItem[]; config: Config; syncing: boolean; lastSync: string | null; onSync: () => void }) {
  return <View style={[ui.card, { backgroundColor: queue.length ? colors.amberLight : colors.greenLight, borderColor: 'transparent', padding: 14 }]}>
    <View style={ui.between}><View style={{ flex: 1, gap: 2 }}>
      <Text style={ui.h3}>{queue.length ? word(language, `${queue.length} item(s) waiting to sync`, `${queue.length} എണ്ണം സിങ്ക് കാത്തിരിക്കുന്നു`) : word(language, 'Everything is synced', 'എല്ലാം സിങ്ക് ചെയ്തു')}</Text>
      <Text style={ui.small}>{config.forceOffline ? word(language, 'Offline mode: saved on this phone, not sent yet.', 'ഓഫ്‌ലൈൻ: ഫോണിൽ സേവ് ചെയ്തു, അയച്ചിട്ടില്ല.') : lastSync ? `${word(language, 'Last server contact', 'അവസാന സെർവർ ബന്ധം')}: ${dateLabel(lastSync, language)}` : word(language, 'Not connected to the server yet. Reports stay on this phone.', 'സെർവറുമായി ബന്ധിപ്പിച്ചിട്ടില്ല.')}</Text>
    </View><Button title={word(language, 'Sync', 'സിങ്ക്')} icon="sync-outline" tone="secondary" loading={syncing} disabled={config.forceOffline} onPress={onSync} /></View>
  </View>;
}

/** Victim / volunteer home: SOS first, then live status, alerts, shelters and shortcuts. */
export function HomeScreen({ role, language, reports, queue, alerts, config, onOpen, onCreate, onRelay, onQuickCreated, onNavigate, onSync, syncing, lastSync, tick }: {
  role: Role; language: Language; reports: Report[]; queue: QueueItem[]; alerts: AuthorityAlert[]; config: Config; onOpen: (id: string) => void; onCreate: () => void; onRelay: () => void;
  onQuickCreated: (report: Report) => Promise<void>; onNavigate: (route: Route) => void; onSync: () => void; syncing: boolean; lastSync: string | null; tick: unknown;
}) {
  const [shelters, setShelters] = useState<service.Cached<ShelterView[]>>();
  useEffect(() => { void service.operations<ShelterView[]>(role, 'shelters', api => api.shelters()).then(setShelters); }, [role, tick]);
  const active = reports.filter(r => r.source !== 'seed' && r.mission_status !== 'completed').slice(0, 2);
  const open = (shelters?.data || []).filter(s => s.status === 'open' && s.remaining > 0).slice(0, 3);
  const victim = role === 'citizen';
  return <View style={{ gap: 14 }}>
    <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.navy, gap: 12 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800' }}>{word(language, victim ? 'In danger right now?' : 'Someone needs help?', 'ഇപ്പോൾ അപകടത്തിലാണോ?')}</Text>
      {victim ? <QuickSos role={role} language={language} onCreated={onQuickCreated} /> : null}
      <Button title={word(language, victim ? 'Report with details (4 quick steps)' : 'Collect an SOS', 'വിവരങ്ങളോടെ അറിയിക്കുക')} tone={victim ? 'secondary' : 'danger'} icon="create-outline" onPress={onCreate} />
      {!victim ? <Button title={word(language, 'Scan a relay QR', 'റിലേ QR സ്കാൻ ചെയ്യുക')} tone="secondary" icon="qr-code-outline" onPress={onRelay} /> : null}
      <Text style={{ color: '#C9D6E6', fontSize: 13, lineHeight: 19 }}>{word(language, 'Works without internet: the SOS is saved on this phone and sent when a connection returns.', 'ഇന്റർനെറ്റ് ഇല്ലാതെയും: ഫോണിൽ സേവ് ചെയ്ത് കണക്ഷൻ കിട്ടുമ്പോൾ അയയ്ക്കും.')}</Text>
    </View>
    <SyncCard language={language} queue={queue} config={config} syncing={syncing} lastSync={lastSync} onSync={onSync} />
    {active.length ? <View style={{ gap: 10 }}>
      <View style={ui.between}><Text style={ui.h2}>{word(language, 'Your active requests', 'നിങ്ങളുടെ അഭ്യർത്ഥനകൾ')}</Text><Pressable accessibilityRole="button" onPress={() => onNavigate('requests')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.teal, fontWeight: '700' }}>{word(language, 'See all', 'എല്ലാം')}</Text></Pressable></View>
      {active.map(r => <ReportCard key={r.id} report={r} role={role} language={language} queue={queue} syncing={syncing} onPress={() => onOpen(r.id)} />)}
    </View> : null}
    {alerts.length ? <Pressable accessibilityRole="button" onPress={() => onNavigate('safety')} style={[ui.card, { borderLeftWidth: 5, borderLeftColor: alerts[0].severity === 'danger' ? colors.red : colors.orange }]}>
      <View style={ui.row}><Icon name="megaphone-outline" color={colors.red} /><Text style={[ui.h3, { flex: 1 }]} numberOfLines={2}>{alerts[0].title}</Text></View>
      <Text style={ui.small} numberOfLines={2}>{alerts[0].body}</Text>
      <Text style={ui.small}>{alerts[0].area} · {dateLabel(alerts[0].created_at, language)}{alerts.length > 1 ? ` · +${alerts.length - 1} ${word(language, 'more', 'കൂടി')}` : ''}</Text>
    </Pressable> : null}
    <View style={ui.card}>
      <View style={ui.between}><Text style={ui.h3}>{word(language, 'Shelters with space', 'സ്ഥലമുള്ള ക്യാമ്പുകൾ')}</Text><Badge label="SIMULATED" /></View>
      {open.length ? open.map(s => <View key={s.id} style={ui.between}><Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>{s.name}</Text><Text style={[ui.small, { fontWeight: '700' }]}>{s.remaining} {word(language, 'places', 'സ്ഥലം')}</Text></View>)
        : <Text style={ui.small}>{shelters?.stale ? word(language, 'No saved shelter list on this phone yet. Call 1077 for camp information.', 'ക്യാമ്പ് വിവരങ്ങൾക്ക് 1077 വിളിക്കുക.') : word(language, 'Loading…', 'ലോഡ് ചെയ്യുന്നു…')}</Text>}
      {shelters?.stale && shelters.at ? <Text style={ui.small}>{word(language, 'Saved copy from', 'സേവ് ചെയ്തത്')} {dateLabel(shelters.at, language)}</Text> : null}
      <Button title={word(language, 'Open map', 'മാപ്പ് തുറക്കുക')} tone="quiet" icon="map-outline" onPress={() => onNavigate('map')} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{([
      ['shield-checkmark-outline', 'Safety guides', 'സുരക്ഷാ നിർദേശങ്ങൾ', () => onNavigate('safety')],
      ['call-outline', 'Emergency numbers', 'അടിയന്തര നമ്പറുകൾ', () => onNavigate('safety')],
      ['chatbubbles-outline', 'Ask RESQ Assistant', 'അസിസ്റ്റന്റ്', () => onNavigate('assistant')],
      ['qr-code-outline', 'Show QR to a volunteer', 'QR കാണിക്കുക', onRelay],
    ] as [IconName, string, string, () => void][]).map(([icon, en, ml, go]) => <Pressable key={en} accessibilityRole="button" accessibilityLabel={word(language, en, ml)} onPress={go} style={({ pressed }) => [ui.card, { flexBasis: '45%', flexGrow: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={22} /><Text style={[ui.small, { flex: 1, color: colors.navy, fontWeight: '700' }]}>{word(language, en, ml)}</Text>
    </Pressable>)}</View>
  </View>;
}

/** Every request this phone sent or collected, with its delivery and rescue status. */
export function RequestsScreen({ role, language, reports, queue, config, syncing, lastSync, onOpen, onSync, onCreate }: {
  role: Role; language: Language; reports: Report[]; queue: QueueItem[]; config: Config; syncing: boolean; lastSync: string | null; onOpen: (id: string) => void; onSync: () => void; onCreate: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'received'>('all');
  const mine = reports.filter(r => r.source !== 'seed');
  const shown = mine.filter(r => filter === 'all' || (filter === 'pending' ? r.delivery_state === 'pending' : r.delivery_state !== 'pending'));
  return <View style={{ gap: 14 }}>
    <SectionHeading title={word(language, role === 'volunteer' ? 'Collected & relayed' : 'My requests', 'എന്റെ അഭ്യർത്ഥനകൾ')} caption={word(language, 'Saved on device → sent to server → acknowledged → team assigned → on the way → on site → resolved.', 'ഫോണിൽ → സെർവർ → സ്വീകരിച്ചു → സംഘം → വഴിയിൽ → സ്ഥലത്ത് → പരിഹരിച്ചു.')} />
    <SyncCard language={language} queue={queue} config={config} syncing={syncing} lastSync={lastSync} onSync={onSync} />
    <View style={ui.row}>{([['all', 'All', 'എല്ലാം'], ['pending', 'Waiting to sync', 'സിങ്ക് കാത്തിരിക്കുന്നവ'], ['received', 'Received by server', 'ലഭിച്ചവ']] as const).map(([id, en, ml]) => <Chip key={id} label={word(language, en, ml)} active={filter === id} onPress={() => setFilter(id)} />)}</View>
    {shown.length ? shown.map(r => <ReportCard key={r.id} report={r} role={role} language={language} queue={queue} syncing={syncing} onPress={() => onOpen(r.id)} />)
      : <Empty title={word(language, 'No requests here', 'അഭ്യർത്ഥനകൾ ഇല്ല')} text={word(language, 'An SOS you send appears here at once, even offline.', 'നിങ്ങൾ അയയ്ക്കുന്ന SOS ഉടൻ ഇവിടെ കാണാം.')} />}
    {!shown.length ? <Button title={word(language, 'Send an SOS', 'SOS അയയ്ക്കുക')} tone="danger" icon="alert-circle-outline" onPress={onCreate} /> : null}
  </View>;
}
