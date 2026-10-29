import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { WebMap, type WebMapHandle } from './WebMap';
import type { LocationFix, Report, Role, ShelterView, TeamView } from '../core/types';
import * as service from '../core/services';
import { bearingDeg, compass, distanceKm, formatDistance, projector, type Point } from '../core/geo';
import { resources, type ResourceKind } from '../core/resources';
import { Button, Chip, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { incidentName, word, type Language } from '../ui/words';
import { describeFix, locateWithFallback, stepLabel } from './location';

const kindStyle: Record<ResourceKind, { color: string; icon: IconName; en: string; ml: string }> = {
  camp: { color: '#08796D', icon: 'home-outline', en: 'Relief camp', ml: 'ദുരിതാശ്വാസ ക്യാമ്പ്' },
  hospital: { color: '#2F6FB0', icon: 'medkit-outline', en: 'Hospital', ml: 'ആശുപത്രി' },
  police: { color: '#4B3F99', icon: 'shield-outline', en: 'Police', ml: 'പോലീസ്' },
  fire: { color: '#C2410C', icon: 'flame-outline', en: 'Fire & rescue', ml: 'ഫയർ & റെസ്ക്യൂ' },
  boat: { color: '#0E7490', icon: 'boat-outline', en: 'Boat pickup', ml: 'ബോട്ട് പോയിന്റ്' },
};
const urgencyColor = (r: Report) => r.delivery_state === 'pending' ? colors.amber : r.mission_status === 'completed' ? '#7C8F94' : ({ CRITICAL: colors.red, HIGH: '#E56A1F', MEDIUM: '#C99A06', LOW: '#2F6FB0' } as Record<string, string>)[r.priority?.level || ''] || '#7C8F94';

interface Pin { id: string; point: Point; color: string; title: string; detail: string; icon: IconName; kind: 'resource' | 'report' }

/** Google map when online; a to-scale offline drawing (no tiles needed) when the network is down. */
export function MapScreen({ language, role, reports, online, tick }: { language: Language; role: Role; reports: Report[]; online: boolean; tick?: unknown }) {
  const [shelters, setShelters] = useState<ShelterView[]>([]);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const staff = role === 'coordinator' || role === 'responder' || role === 'relief';
  useEffect(() => {
    void service.operations<ShelterView[]>(role, 'shelters', api => api.shelters()).then(r => setShelters(r.data || []));
    if (staff) void service.operations<TeamView[]>(role, 'teams', api => api.teams()).then(r => setTeams(r.data || []));
  }, [role, tick]);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 720);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [show, setShow] = useState<'all' | 'help' | 'reports'>('all');
  const [selected, setSelected] = useState<string>();
  const [mode, setMode] = useState<'google' | 'offline'>(online ? 'google' : 'offline');
  const map = useRef<WebMapHandle>(null);
  useEffect(() => { void service.loadLastFix().then(setFix).catch(() => undefined); }, []);
  async function locate() {
    setBusy(true);
    try { const next = await locateWithFallback(s => setStep(stepLabel(s, language))); if (next) setFix(next); setStep(next ? '' : word(language, 'No location available. Distances use the map centre.', 'സ്ഥലം ലഭ്യമല്ല.')); }
    finally { setBusy(false); }
  }
  const pins = useMemo<Pin[]>(() => [
    ...(show !== 'reports' ? shelters.map(s => ({ id: s.id, point: s, color: s.remaining ? '#08796D' : colors.red, title: s.name, detail: `${word(language, 'Shelter', 'ക്യാമ്പ്')} · ${s.remaining}/${s.capacity} ${word(language, 'places free', 'സ്ഥലം ഒഴിവ്')} · ${s.facilities.join(', ')}${s.simulated ? ' · SIMULATED' : ''}`, icon: 'home-outline' as IconName, kind: 'resource' as const })) : []),
    ...(show !== 'reports' ? teams.map(t => ({ id: t.id, point: t, color: t.available ? '#102E38' : '#7C5AA6', title: t.name, detail: `${t.available ? 'Available' : t.mission_id ? `On mission (${(t.mission_status || '').replace('_', ' ')})` : 'Off duty'} · base location${t.simulated ? ' · SIMULATED team' : ''}`, icon: 'people-outline' as IconName, kind: 'resource' as const })) : []),
    ...(show !== 'reports' ? resources.map(r => ({ id: r.id, point: r, color: kindStyle[r.kind].color, title: r.name, detail: `${word(language, kindStyle[r.kind].en, kindStyle[r.kind].ml)} · ${r.detail}`, icon: kindStyle[r.kind].icon, kind: 'resource' as const })) : []),
    ...(show !== 'help' ? reports.filter(r => r.location.latitude !== null && r.location.longitude !== null).map(r => ({ id: r.id, point: { latitude: r.location.latitude!, longitude: r.location.longitude! }, color: urgencyColor(r), title: `${incidentName(r.incident_type, language)} · ${r.affected_count}${r.priority ? ` · ${r.priority.level}` : ''}`, detail: r.location.label, icon: 'alert-circle-outline' as IconName, kind: 'report' as const })) : []),
  ], [reports, show, language, shelters, teams]);
  const me = fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
  const webPins = useMemo(() => pins.map(p => ({ id: p.id, point: p.point, color: p.color, title: p.title, detail: p.detail, square: p.kind === 'resource' })), [pins]);
  const webMe = useMemo(() => fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy } : null, [fix]);
  const all = [...pins.map(p => p.point), ...(me ? [me] : [])];
  const view = all.length ? projector(all, size, size) : null;
  const origin = me || (all.length ? all[0] : null);
  const ranked = origin ? [...pins].map(p => ({ ...p, km: distanceKm(origin, p.point), dir: compass(bearingDeg(origin, p.point)) })).sort((a, b) => a.km - b.km) : [];
  const scaleKm = view ? [0.5, 1, 2, 5, 10, 20, 50].find(km => km / view.kmPerPixel > size * 0.18) || 50 : 1;
  return <View style={{ gap: 16 }}>
    <SectionHeading title={word(language, 'Map', 'ഭൂപടം')} caption={word(language, 'Your position, SOS reports and help points. Switch to Offline when there is no internet.', 'നിങ്ങളുടെ സ്ഥലം, SOS, സഹായകേന്ദ്രങ്ങൾ. ഇന്റർനെറ്റ് ഇല്ലെങ്കിൽ ഓഫ്‌ലൈൻ കാഴ്ച ഉപയോഗിക്കുക.')} />
    <View style={ui.row}>
      <Chip label={word(language, 'Street map', 'സ്ട്രീറ്റ് മാപ്പ്')} icon="globe-outline" active={mode === 'google'} onPress={() => setMode('google')} />
      <Chip label={word(language, 'Offline view', 'ഓഫ്‌ലൈൻ കാഴ്ച')} icon="cloud-offline-outline" active={mode === 'offline'} onPress={() => setMode('offline')} />
    </View>
    {mode === 'google' && !online ? <Notice tone="warning" text={word(language, 'No internet: map tiles may be blank except areas viewed before. Offline view always works.', 'ഇന്റർനെറ്റ് ഇല്ല: മാപ്പ് ശൂന്യമാകാം. ഓഫ്‌ലൈൻ കാഴ്ച എപ്പോഴും പ്രവർത്തിക്കും.')} /> : null}
    <View style={ui.row}>
      <Chip label={word(language, 'All', 'എല്ലാം')} active={show === 'all'} onPress={() => setShow('all')} />
      <Chip label={word(language, 'Help points', 'സഹായകേന്ദ്രങ്ങൾ')} icon="home-outline" active={show === 'help'} onPress={() => setShow('help')} />
      <Chip label={word(language, 'SOS reports', 'SOS റിപ്പോർട്ടുകൾ')} icon="alert-circle-outline" active={show === 'reports'} onPress={() => setShow('reports')} />
    </View>
    {mode === 'google' ? <View style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
      <WebMap ref={map} height={Math.round(size * 1.15)} onSelect={setSelected} me={webMe} pins={webPins} />
    </View> : <View style={[ui.card, { padding: 0, overflow: 'hidden', alignItems: 'center', backgroundColor: '#EAF2EF' }]}>
      {view ? <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill="#EAF2EF" />
        {[1, 2, 3, 4].map(i => <G key={i}><Line x1={(size / 5) * i} y1={0} x2={(size / 5) * i} y2={size} stroke="#D3E2DD" strokeWidth={1} /><Line x1={0} y1={(size / 5) * i} x2={size} y2={(size / 5) * i} stroke="#D3E2DD" strokeWidth={1} /></G>)}
        {me && fix?.accuracy ? <Circle cx={view.project(me).x} cy={view.project(me).y} r={Math.min(size / 2, Math.max(8, fix.accuracy / 1000 / view.kmPerPixel))} fill="rgba(47,111,176,0.15)" stroke="rgba(47,111,176,0.4)" /> : null}
        {pins.map(p => { const { x, y } = view.project(p.point); const on = p.id === selected; return <G key={p.id}>
          {p.kind === 'resource' ? <Rect x={x - (on ? 9 : 7)} y={y - (on ? 9 : 7)} width={on ? 18 : 14} height={on ? 18 : 14} rx={4} fill={p.color} stroke="#FFFFFF" strokeWidth={2} /> : <Circle cx={x} cy={y} r={on ? 11 : 8} fill={p.color} stroke="#FFFFFF" strokeWidth={2} />}
          {on ? <SvgText x={x} y={y - 15} fontSize={12} fontWeight="bold" fill={colors.navy} textAnchor="middle">{p.title.slice(0, 32)}</SvgText> : null}
        </G>; })}
        {me ? <G><Circle cx={view.project(me).x} cy={view.project(me).y} r={10} fill="#2F6FB0" stroke="#FFFFFF" strokeWidth={3} /><SvgText x={view.project(me).x} y={view.project(me).y + 24} fontSize={12} fontWeight="bold" fill="#2F6FB0" textAnchor="middle">{word(language, 'YOU', 'നിങ്ങൾ')}</SvgText></G> : null}
        <SvgText x={size - 18} y={26} fontSize={16} fontWeight="bold" fill={colors.navy} textAnchor="middle">N</SvgText>
        <Line x1={size - 18} y1={32} x2={size - 18} y2={50} stroke={colors.navy} strokeWidth={2} />
        <Line x1={16} y1={size - 18} x2={16 + scaleKm / view.kmPerPixel} y2={size - 18} stroke={colors.navy} strokeWidth={3} />
        <SvgText x={16} y={size - 26} fontSize={12} fill={colors.navy}>{formatDistance(scaleKm)}</SvgText>
      </Svg> : <View style={{ padding: 30 }}><Text style={ui.subtitle}>{word(language, 'Nothing to show yet.', 'കാണിക്കാൻ ഒന്നുമില്ല.')}</Text></View>}
    </View>}
    <View style={[ui.row, { gap: 12 }]}>
      <View style={ui.row}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#2F6FB0' }} /><Text style={ui.small}>{word(language, 'You', 'നിങ്ങൾ')}</Text></View>
      <View style={ui.row}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.amber }} /><Text style={ui.small}>{word(language, 'Pending SOS', 'കാത്തിരിക്കുന്ന SOS')}</Text></View>
      <View style={ui.row}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red }} /><Text style={ui.small}>{word(language, 'Critical SOS', 'അതീവ അടിയന്തര SOS')}</Text></View>
      <View style={ui.row}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#08796D' }} /><Text style={ui.small}>{word(language, 'Help point', 'സഹായകേന്ദ്രം')}</Text></View>
    </View>
    <Button title={word(language, fix ? 'Update my location' : 'Show my location', fix ? 'എന്റെ സ്ഥലം പുതുക്കുക' : 'എന്റെ സ്ഥലം കാണിക്കുക')} icon="locate-outline" tone="secondary" loading={busy} onPress={() => void locate()} />
    {step ? <Text style={ui.small}>{step}</Text> : null}
    {fix ? <Text style={ui.small}>{word(language, 'Your position', 'നിങ്ങളുടെ സ്ഥലം')}: {describeFix(fix, language)}</Text> : <Notice tone="warning" text={word(language, 'Your position is unknown, so distances are measured from the first point on the map.', 'നിങ്ങളുടെ സ്ഥലം അറിയില്ല; ദൂരം ഭൂപടത്തിലെ ആദ്യ സ്ഥലത്തു നിന്നാണ്.')} />}
    <Text style={ui.h3}>{word(language, me ? 'Nearest to you' : 'Places on the map', me ? 'നിങ്ങൾക്ക് ഏറ്റവും അടുത്ത്' : 'ഭൂപടത്തിലെ സ്ഥലങ്ങൾ')}</Text>
    {ranked.slice(0, 12).map(p => <Pressable key={p.id} accessibilityRole="button" onPress={() => { setSelected(p.id === selected ? undefined : p.id); map.current?.focus(p.id); }} style={[ui.card, { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, borderColor: p.id === selected ? colors.teal : colors.line }]}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: p.color, alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} color="#FFFFFF" size={20} /></View>
      <View style={{ flex: 1 }}><Text style={[ui.text, { fontWeight: '700' }]} numberOfLines={1}>{p.title}</Text><Text style={ui.small} numberOfLines={2}>{p.detail}</Text></View>
      <View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.navy, fontWeight: '800' }}>{formatDistance(p.km)}</Text><Text style={ui.small}>{p.dir}</Text></View>
    </Pressable>)}
    <Text style={ui.small}>{word(language, 'Help points are bundled DEMO data for Kochi. A real deployment loads the district authority\'s verified list.', 'സഹായകേന്ദ്രങ്ങൾ കൊച്ചിയിലെ ഡെമോ വിവരങ്ങളാണ്.')}</Text>
  </View>;
}
