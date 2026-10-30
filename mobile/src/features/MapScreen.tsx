import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { WebMap, type WebMapHandle, type WebPin } from './WebMap';
import type { FacilityCategory, PriorityLevel, Report, Role, TeamView } from '../core/types';
import * as service from '../core/services';
import { categoryMeta, rankFacilities, validPoint } from '../core/facilities';
import { formatDistance, projector, type Point } from '../core/geo';
import { Badge, Button, Chip, Icon, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { incidentName, word, type Language } from '../ui/words';
import { ImpactLegend, MapModeToggle, demandHeat, useHeatFor, useImpact, useReliefDemand, type MapMode } from './ImpactLayer';
import { pinOf, useDirections, useFacilities, usePosition } from './SafeZones';
import { describeFix } from './location';

type Layer = 'incidents' | FacilityCategory | 'teams';
const levelColor: Record<PriorityLevel, string> = { CRITICAL: colors.red, HIGH: colors.orange, MEDIUM: '#CA8A04', LOW: '#64748B' };
const incidentColor = (r: Report) => r.delivery_state === 'pending' ? colors.amber : r.mission_status === 'completed' ? '#94A3B8' : r.priority ? levelColor[r.priority.level] : '#94A3B8';
// Mode, layers and filters survive leaving the map (per role), e.g. to open an incident or Google Maps.
const remembered: Partial<Record<Role, { mode: MapMode; layers: Layer[]; level: PriorityLevel | 'all'; verification: 'all' | 'verified' | 'unverified'; demand: boolean }>> = {};

const layerLabel: Record<Layer, [string, string]> = {
  incidents: ['Incidents', 'സംഭവങ്ങൾ'], shelter: ['Shelters', 'അഭയകേന്ദ്രങ്ങൾ'], relief_camp: ['Relief camps', 'ക്യാമ്പുകൾ'],
  hospital: ['Hospitals', 'ആശുപത്രികൾ'], relief_center: ['Relief centres', 'ദുരിതാശ്വാസ കേന്ദ്രങ്ങൾ'], teams: ['Rescue teams', 'രക്ഷാസംഘങ്ങൾ'],
};

/** Incident Impact Map shared by every role. Street Map by default, Impact Heatmap on request.
 * What each role may see is decided by the server: reports are role-scoped and heat points are precise or aggregated by role. */
export function MapScreen({ language, role, reports, online, tick, onOpen }: { language: Language; role: Role; reports: Report[]; online: boolean; tick?: unknown; onOpen: (id: string) => void }) {
  const staff = role === 'coordinator' || role === 'responder' || role === 'relief';
  const saved = remembered[role] || { mode: 'street' as MapMode, layers: ['incidents', 'shelter', 'relief_camp', 'hospital', 'relief_center', ...(staff ? ['teams' as Layer] : [])], level: 'all' as const, verification: 'all' as const, demand: false };
  const [mode, setModeState] = useState<MapMode>(saved.mode);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(saved.layers));
  const [level, setLevel] = useState<PriorityLevel | 'all'>(saved.level);
  const [verification, setVerification] = useState<'all' | 'verified' | 'unverified'>(saved.verification);
  const [demandOn, setDemandOn] = useState(saved.demand);
  const [offlineView, setOfflineView] = useState(!online);
  const [tileError, setTileError] = useState(false);
  const [heatError, setHeatError] = useState(false);
  const [selected, setSelected] = useState<string>();
  const map = useRef<WebMapHandle>(null);
  useEffect(() => { remembered[role] = { mode, layers: [...layers], level, verification, demand: demandOn }; }, [role, mode, layers, level, verification, demandOn]);
  const setMode = (m: MapMode) => { setModeState(m); setHeatError(false); };

  const [facilities] = useFacilities(role, tick);
  const [gps, locate] = usePosition();
  const [teams, setTeams] = useState<TeamView[]>([]);
  useEffect(() => { if (staff) void service.operations<TeamView[]>(role, 'teams', api => api.teams()).then(r => setTeams(r.data || [])); }, [role, tick, staff]);
  const [impact] = useImpact(role, tick, mode === 'impact');
  const demand = useReliefDemand(role, tick, demandOn && (role === 'relief' || role === 'coordinator'));
  const { go, note, busy } = useDirections(language, gps.fix);

  const incidents = useMemo(() => reports.filter(r => r.source !== 'seed' && validPoint({ latitude: r.location.latitude ?? undefined, longitude: r.location.longitude ?? undefined }))
    .filter(r => level === 'all' || r.priority?.level === level)
    .filter(r => verification === 'all' || (verification === 'verified' ? r.verification === 'verified' : r.verification !== 'verified'))
    .sort((a, b) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1)), [reports, level, verification]);
  const places = useMemo(() => rankFacilities(facilities?.data || [], 'all', gps.fix).filter(f => layers.has(f.category)), [facilities, gps.fix, layers]);
  const pins = useMemo<WebPin[]>(() => [
    ...places.map(f => pinOf(f, language)),
    ...(layers.has('teams') ? teams.filter(t => validPoint(t)).map(t => ({ id: `team:${t.id}`, point: t, color: colors.navy, glyph: 'T', square: false, title: t.name, detail: `${t.available ? 'Available' : t.mission_id ? `On mission (${(t.mission_status || '').replace('_', ' ')})` : 'Off duty'} · base location${t.simulated ? ' · SIMULATED' : ''}` })) : []),
    // In heatmap mode incidents are shown by the heat layer only, never twice.
    ...(mode === 'street' && layers.has('incidents') ? incidents.map(r => ({ id: `incident:${r.id}`, point: { latitude: r.location.latitude!, longitude: r.location.longitude! }, color: incidentColor(r), glyph: '!', square: false,
      title: `${incidentName(r.incident_type, language)} · ${r.priority ? `${r.priority.level} ${r.priority.score}` : 'priority after sync'}`, detail: `${r.location.label} · ${r.verification}${r.provenance?.source === 'community_relay' ? ' · QR relay' : ''}` })) : []),
  ], [places, teams, incidents, layers, mode, language]);
  const heat = useHeatFor(mode, impact);
  // Relief Demand replaces the impact layer while it is switched on, so demand is never confused with disaster intensity.
  const demandLayer = useMemo(() => mode === 'impact' && demandOn ? demandHeat(demand?.data) : null, [mode, demandOn, demand]);
  const me = useMemo(() => gps.fix ? { latitude: gps.fix.latitude, longitude: gps.fix.longitude, accuracy: gps.fix.accuracy } : null, [gps.fix]);
  const toggle = (l: Layer) => setLayers(prev => { const next = new Set(prev); if (next.has(l)) next.delete(l); else next.add(l); return next; });
  const available: Layer[] = ['incidents', 'shelter', 'relief_camp', 'hospital', 'relief_center', ...(staff ? ['teams' as Layer] : [])];
  const filterText = [mode === 'impact' ? 'Impact Heatmap' : 'Street Map', ...available.filter(l => layers.has(l)).map(l => layerLabel[l][0]), level !== 'all' ? level : '', verification !== 'all' ? verification : '', demandOn ? 'Relief Demand' : ''].filter(Boolean).join(' · ');
  function select(id: string) {
    if (id.startsWith('incident:')) { onOpen(id.slice(9)); return; }
    setSelected(id); map.current?.focus(id);
  }
  const selectedPlace = places.find(f => f.id === selected);
  const victimSide = role === 'citizen' || role === 'volunteer';

  return <View style={{ gap: 12 }}>
    <View style={{ gap: 4 }}><Text style={ui.h2}>{word(language, 'Incident Impact Map', 'സംഭവ ആഘാത മാപ്പ്')}</Text>
      <Text style={ui.small}>{victimSide ? word(language, 'Your own reports, public safe zones and generalised impact areas. Other people’s exact locations are never shown.', 'നിങ്ങളുടെ റിപ്പോർട്ടുകളും പൊതു വിവരങ്ങളും മാത്രം.') : role === 'responder' ? word(language, 'Your assigned missions, nearby facilities and impact areas.', 'നിങ്ങളുടെ ദൗത്യങ്ങൾ.') : role === 'relief' ? word(language, 'Supply sites, relief demand and grouped impact areas.', 'വിതരണ കേന്ദ്രങ്ങളും ആവശ്യവും.') : word(language, 'All authorised incidents, teams and facilities. Tap an incident to review, verify or assign.', 'എല്ലാ സംഭവങ്ങളും.')}</Text></View>
    <MapModeToggle mode={mode} onChange={setMode} language={language} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {available.map(l => <Chip key={l} label={word(language, layerLabel[l][0], layerLabel[l][1])} active={layers.has(l)} onPress={() => toggle(l)} />)}
      {role === 'relief' || role === 'coordinator' ? <Chip label={word(language, 'Relief Demand', 'ദുരിതാശ്വാസ ആവശ്യം')} icon="cube-outline" active={demandOn} onPress={() => { setDemandOn(v => !v); if (!demandOn) setMode('impact'); }} /> : null}
    </ScrollView>
    {role === 'coordinator' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {(['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(l => <Chip key={l} label={l === 'all' ? 'All levels' : l[0] + l.slice(1).toLowerCase()} active={level === l} onPress={() => setLevel(l)} />)}
      {(['all', 'verified', 'unverified'] as const).map(v => <Chip key={v} label={v === 'all' ? 'Verified + unverified' : v[0].toUpperCase() + v.slice(1)} active={verification === v} onPress={() => setVerification(v)} />)}
    </ScrollView> : null}
    {!online ? <Notice tone="warning" text={word(language, 'No internet: map tiles may be blank. Use the offline drawing or the list below.', 'ഇന്റർനെറ്റ് ഇല്ല. ഓഫ്‌ലൈൻ ചിത്രം ഉപയോഗിക്കുക.')}><Chip label={word(language, offlineView ? 'Show street map' : 'Offline drawing', offlineView ? 'സ്ട്രീറ്റ് മാപ്പ്' : 'ഓഫ്‌ലൈൻ ചിത്രം')} icon="cloud-offline-outline" active={offlineView} onPress={() => setOfflineView(v => !v)} /></Notice> : null}
    {heatError ? <Notice tone="warning" text={word(language, 'The heatmap layer could not load (needs internet). Markers and the list still work.', 'ഹീറ്റ്മാപ്പ് ലോഡ് ആയില്ല.')} /> : null}
    {offlineView || tileError ? <OfflineDrawing pins={pins} me={me} selected={selected} language={language} onSelect={select} tileError={tileError} onRetry={() => { setTileError(false); setOfflineView(false); }} />
      : <View style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
        <WebMap ref={map} height={340} pins={pins} me={me} selectedId={selected} heat={demandLayer || heat} onSelect={select} onTileError={() => setTileError(true)} onHeatError={() => setHeatError(true)} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10 }}>
          <Button style={{ flex: 1 }} title={word(language, 'Locate me', 'എന്റെ സ്ഥലം')} icon="locate-outline" tone="secondary" loading={gps.state === 'locating'} onPress={() => void locate()} />
          <Button style={{ flex: 1 }} title={word(language, 'Recenter', 'മധ്യത്തിലാക്കുക')} icon="scan-outline" tone="quiet" onPress={() => map.current?.recenter()} />
        </View>
      </View>}
    {gps.fix ? <Text style={ui.small}>📍 {describeFix(gps.fix, language)}</Text> : gps.state === 'denied' ? <Text style={ui.small}>{word(language, 'Location permission is off; distances are hidden.', 'സ്ഥലാനുമതി ഇല്ല.')}</Text> : null}
    {mode === 'impact' ? <ImpactLegend data={impact} language={language} filters={filterText} demand={demandOn ? demand?.data : undefined} /> : <Text style={ui.small}>{word(language, 'Filters', 'ഫിൽട്ടർ')}: {filterText}</Text>}
    {note ? <Notice tone={note.tone} text={note.text} /> : null}
    {selectedPlace ? <View style={[ui.card, { borderColor: colors.teal }]}>
      <View style={ui.between}><Text style={[ui.h3, { flex: 1 }]}>{selectedPlace.name}</Text><Badge label={word(language, categoryMeta[selectedPlace.category].label, categoryMeta[selectedPlace.category].ml).toUpperCase()} /></View>
      <Text style={ui.small}>{selectedPlace.address}{selectedPlace.distanceKm !== null ? ` · ${formatDistance(selectedPlace.distanceKm)} (straight-line)` : ''}{selectedPlace.capacity !== null ? ` · ${selectedPlace.remaining}/${selectedPlace.capacity} free` : ''}{selectedPlace.is_simulated ? ' · SIMULATED' : ''}</Text>
      <Button title={word(language, 'Get directions', 'വഴി കാണിക്കുക')} icon="navigate" loading={busy === selectedPlace.id} onPress={() => void go(selectedPlace, 'driving')} />
    </View> : null}
    {layers.has('incidents') && incidents.length ? <View style={{ gap: 8 }}>
      <Text style={ui.h3}>{victimSide ? word(language, 'Your reports on the map', 'നിങ്ങളുടെ റിപ്പോർട്ടുകൾ') : role === 'responder' ? word(language, 'Assigned missions', 'നിയോഗിച്ച ദൗത്യങ്ങൾ') : `${incidents.length} incidents · highest priority first`}</Text>
      {incidents.slice(0, 15).map(r => <View key={r.id} style={[ui.card, { padding: 12, gap: 6, borderLeftWidth: 5, borderLeftColor: incidentColor(r) }]}>
        <Pressable accessibilityRole="button" onPress={() => { setSelected(`incident:${r.id}`); map.current?.focus(`incident:${r.id}`); }} style={{ gap: 3 }}>
          <View style={ui.between}><Text style={[ui.text, { fontWeight: '800', flex: 1 }]}>{incidentName(r.incident_type, language)} · {r.affected_count} {word(language, 'people', 'പേർ')}</Text>{r.priority ? <Badge label={`${r.priority.level} ${r.priority.score}`} tone={r.priority.level === 'CRITICAL' ? 'danger' : r.priority.level === 'HIGH' ? 'warning' : 'neutral'} /> : null}</View>
          <Text style={ui.small} numberOfLines={1}>📍 {r.location.label} · {r.verification}{r.provenance?.source === 'community_relay' ? ' · via QR relay' : ''}{r.description.startsWith('[SIMULATED]') ? ' · SIMULATED' : ''}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} title={word(language, 'Details', 'വിവരങ്ങൾ')} tone="secondary" icon="document-text-outline" onPress={() => onOpen(r.id)} />
          {role === 'responder' || role === 'coordinator' ? <Button style={{ flex: 1 }} title={word(language, 'Navigate', 'വഴി')} icon="navigate" loading={busy === r.id} onPress={() => void go({ id: r.id, name: r.location.label, latitude: r.location.latitude!, longitude: r.location.longitude! }, 'driving')} /> : null}
        </View>
      </View>)}
    </View> : null}
    {places.length ? <View style={{ gap: 8 }}>
      <Text style={ui.h3}>{places.length} {word(language, 'facilities', 'കേന്ദ്രങ്ങൾ')}{gps.fix ? word(language, ' · nearest first', ' · അടുത്തുള്ളവ ആദ്യം') : ''}</Text>
      {places.slice(0, 12).map(f => <Pressable key={f.id} accessibilityRole="button" onPress={() => select(f.id)} style={[ui.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderColor: f.id === selected ? colors.teal : colors.line }]}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: categoryMeta[f.category].color, alignItems: 'center', justifyContent: 'center' }}><Icon name={categoryMeta[f.category].icon} color="#FFFFFF" size={18} /></View>
        <View style={{ flex: 1 }}><Text style={[ui.text, { fontWeight: '700' }]} numberOfLines={1}>{f.name}</Text><Text style={ui.small} numberOfLines={1}>{word(language, categoryMeta[f.category].label, categoryMeta[f.category].ml)} · {f.locality}{f.capacity !== null ? ` · ${f.remaining}/${f.capacity} free` : ''}</Text></View>
        {f.distanceKm !== null ? <Text style={{ color: colors.navy, fontWeight: '800' }}>{formatDistance(f.distanceKm)}</Text> : null}
      </Pressable>)}
    </View> : null}
    <Text style={ui.small}>{word(language, 'Facilities and simulated incidents are demo data around Kottayam. Distances are straight-line; Google Maps calculates real routes, which are not verified as safe. Map data © OpenStreetMap contributors.', 'ഡെമോ വിവരങ്ങൾ. ദൂരം നേർരേഖയിൽ.')}</Text>
  </View>;
}

/** To-scale drawing with no tiles, for when the network or tile server is unavailable. */
function OfflineDrawing({ pins, me, selected, language, onSelect, tileError, onRetry }: { pins: WebPin[]; me: Point | null; selected?: string; language: Language; onSelect: (id: string) => void; tileError: boolean; onRetry: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 720);
  const all = [...pins.map(p => p.point), ...(me ? [me] : [])];
  const view = all.length ? projector(all, size, size) : null;
  return <View style={[ui.card, { padding: 0, overflow: 'hidden', alignItems: 'center', backgroundColor: '#EAF2EF' }]}>
    {tileError ? <View style={{ padding: 12, alignSelf: 'stretch' }}><Notice tone="warning" text={word(language, 'Street map tiles could not load, so this offline drawing is shown instead.', 'മാപ്പ് ലോഡ് ആയില്ല; ഓഫ്‌ലൈൻ ചിത്രം.')}><Button title={word(language, 'Retry street map', 'വീണ്ടും ശ്രമിക്കുക')} tone="secondary" icon="refresh-outline" onPress={onRetry} /></Notice></View> : null}
    {view ? <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill="#EAF2EF" />
      {[1, 2, 3, 4].map(i => <G key={i}><Line x1={(size / 5) * i} y1={0} x2={(size / 5) * i} y2={size} stroke="#D3E2DD" strokeWidth={1} /><Line x1={0} y1={(size / 5) * i} x2={size} y2={(size / 5) * i} stroke="#D3E2DD" strokeWidth={1} /></G>)}
      {pins.map(p => { const { x, y } = view.project(p.point); const on = p.id === selected; return <G key={p.id} onPress={() => onSelect(p.id)}>
        <Circle cx={x} cy={y} r={on ? 12 : 9} fill={p.color} stroke="#FFFFFF" strokeWidth={2} />
        {p.glyph ? <SvgText x={x} y={y + 4} fontSize={10} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{p.glyph}</SvgText> : null}
        {on ? <SvgText x={x} y={y - 16} fontSize={12} fontWeight="bold" fill={colors.navy} textAnchor="middle">{p.title.slice(0, 32)}</SvgText> : null}
      </G>; })}
      {me ? <G><Circle cx={view.project(me).x} cy={view.project(me).y} r={10} fill="#1A73E8" stroke="#FFFFFF" strokeWidth={3} /><SvgText x={view.project(me).x} y={view.project(me).y + 24} fontSize={12} fontWeight="bold" fill="#1A73E8" textAnchor="middle">{word(language, 'YOU', 'നിങ്ങൾ')}</SvgText></G> : null}
      <SvgText x={size - 18} y={26} fontSize={16} fontWeight="bold" fill={colors.navy} textAnchor="middle">N</SvgText>
    </Svg> : <View style={{ padding: 30 }}><Text style={ui.subtitle}>{word(language, 'Nothing to show yet.', 'കാണിക്കാൻ ഒന്നുമില്ല.')}</Text></View>}
  </View>;
}
