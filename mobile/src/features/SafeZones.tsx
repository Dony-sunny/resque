import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { categoryMeta, filters, rankFacilities, type FacilityFilter, type RankedFacility, type TravelMode } from '../core/facilities';
import { formatDistance } from '../core/geo';
import type { FacilityView, LocationFix, Role } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Chip, Empty, Icon, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, word, type Language } from '../ui/words';
import { currentPosition, describeFix, openGoogleMapsDirections } from './location';
import { WebMap, type WebMapHandle, type WebPin } from './WebMap';

type GpsState = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';
// Kept at module level so filter, selection and travel mode survive leaving the screen (for example to Google Maps) and coming back.
const remembered: { filter: FacilityFilter; mode: TravelMode; selectedId?: string; search: string } = { filter: 'all', mode: 'driving', search: '' };
const position: { fix: LocationFix | null; state: GpsState } = { fix: null, state: 'idle' };

function useFacilities(role: Role, tick: unknown) {
  const [state, setState] = useState<service.Cached<FacilityView[]>>();
  const load = useCallback(async () => setState(await service.operations<FacilityView[]>(role, 'facilities', api => api.facilities())), [role]);
  useEffect(() => { void load(); }, [load, tick]);
  return [state, load] as const;
}

/** Current position shared by the dashboard preview and the Safe Zones screen; refreshed on request. */
function usePosition() {
  const [state, setState] = useState(position);
  const locate = useCallback(async () => {
    Object.assign(position, { state: 'locating' }); setState({ ...position });
    const { fix, denied } = await currentPosition();
    Object.assign(position, { fix: fix || position.fix, state: fix ? 'ok' : denied ? 'denied' : 'unavailable' });
    setState({ ...position });
  }, []);
  useEffect(() => { if (position.state === 'idle') void locate(); }, [locate]);
  return [state, locate] as const;
}

const pinOf = (f: RankedFacility, language: Language): WebPin => ({
  id: f.id, point: f, color: categoryMeta[f.category].color, glyph: categoryMeta[f.category].glyph, square: false,
  title: f.name, detail: `${word(language, categoryMeta[f.category].label, categoryMeta[f.category].ml)} · ${f.locality}${f.is_simulated ? ' · SIMULATED' : ''}`,
});

function useDirections(language: Language, fix: LocationFix | null) {
  const [note, setNote] = useState<{ tone: 'info' | 'warning' | 'error'; text: string }>();
  const [busy, setBusy] = useState('');
  async function go(f: FacilityView, mode: TravelMode) {
    setBusy(f.id); setNote(undefined);
    try {
      const result = await openGoogleMapsDirections(f, mode, fix);
      setNote(result.usedOrigin
        ? { tone: 'info', text: word(language, `Opened Google Maps from your current location to ${f.name}. Google calculates the road route; it is not a verified safe evacuation route.`, `നിങ്ങളുടെ സ്ഥലത്ത് നിന്ന് ${f.name} വരെ Google Maps തുറന്നു.`) }
        : { tone: 'warning', text: word(language, result.denied ? 'Location permission is off, so RESQ did not send a starting point. Google Maps will use your device location or ask you for a start.' : 'Your current location could not be found, so Google Maps will use your device location or ask you for a start.', 'സ്ഥലം ലഭ്യമല്ല; Google Maps ആരംഭസ്ഥലം ചോദിക്കും.') });
    } catch (e) { setNote({ tone: 'error', text: e instanceof Error ? e.message : 'Could not open Google Maps.' }); }
    finally { setBusy(''); }
  }
  return { go, note, busy };
}

function FacilityFacts({ f, language }: { f: RankedFacility; language: Language }) {
  const meta = categoryMeta[f.category];
  return <View style={{ gap: 6 }}>
    <View style={ui.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${meta.color}1A`, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }}><Icon name={meta.icon} color={meta.color} size={14} /><Text style={{ color: colors.navy, fontSize: 12, fontWeight: '800' }}>{word(language, meta.label, meta.ml).toUpperCase()}</Text></View>
      {f.availability_status !== 'unknown' ? <Badge label={`${f.availability_status.toUpperCase()}${f.is_simulated ? ' · DEMO STATUS' : ''}`} tone={f.availability_status === 'open' ? 'success' : 'danger'} /> : null}
      {f.is_simulated ? <Badge label="SIMULATED" /> : null}
    </View>
    <Text style={ui.small}>📍 {f.address}, {f.locality}, {f.district}</Text>
    {f.distanceKm !== null ? <Text style={[ui.small, { color: colors.navy, fontWeight: '700' }]}>{formatDistance(f.distanceKm)} {word(language, 'away (straight-line estimate)', 'അകലെ (നേർരേഖ ദൂരം)')}</Text> : null}
    {f.capacity !== null ? <Text style={ui.small}>{word(language, 'Available spaces', 'ലഭ്യമായ സ്ഥലം')}: <Text style={{ fontWeight: '800', color: colors.navy }}>{f.remaining} / {f.capacity}</Text></Text> : null}
    {f.services.length ? <Text style={ui.small}>{word(language, 'Services', 'സേവനങ്ങൾ')}: {f.services.join(', ')}</Text> : null}
    <Text style={ui.small}>{word(language, 'Updated', 'പുതുക്കിയത്')} {dateLabel(f.last_updated, language)}</Text>
  </View>;
}

function ModeToggle({ mode, onChange, language }: { mode: TravelMode; onChange: (m: TravelMode) => void; language: Language }) {
  return <View style={ui.row}>
    <Chip label={word(language, 'Driving', 'വാഹനം')} icon="car-outline" active={mode === 'driving'} onPress={() => onChange('driving')} />
    <Chip label={word(language, 'Walking', 'നടന്ന്')} icon="walk-outline" active={mode === 'walking'} onPress={() => onChange('walking')} />
  </View>;
}

/** Full Safe Zones map: real street map, category filters, synced cards, detail sheet and Google Maps directions. */
export function SafeZonesScreen({ role, language, tick }: { role: Role; language: Language; tick: unknown }) {
  const [data, reload] = useFacilities(role, tick);
  const [gps, locate] = usePosition();
  const [filter, setFilterState] = useState<FacilityFilter>(remembered.filter);
  const [mode, setModeState] = useState<TravelMode>(remembered.mode);
  const [search, setSearchState] = useState(remembered.search);
  const [selectedId, setSelectedState] = useState<string | undefined>(remembered.selectedId);
  const [sheet, setSheet] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const map = useRef<WebMapHandle>(null);
  const { go, note, busy } = useDirections(language, gps.fix);
  const setFilter = (v: FacilityFilter) => { remembered.filter = v; setFilterState(v); };
  const setMode = (v: TravelMode) => { remembered.mode = v; setModeState(v); };
  const setSearch = (v: string) => { remembered.search = v; setSearchState(v); };
  const select = (id?: string) => { remembered.selectedId = id; setSelectedState(id); };
  const ranked = useMemo(() => rankFacilities(data?.data || [], filter, gps.fix, search), [data, filter, gps.fix, search]);
  const pins = useMemo(() => ranked.map(f => pinOf(f, language)), [ranked, language]);
  const me = useMemo(() => gps.fix ? { latitude: gps.fix.latitude, longitude: gps.fix.longitude, accuracy: gps.fix.accuracy } : null, [gps.fix]);
  const selected = ranked.find(f => f.id === selectedId);
  function openCard(f: RankedFacility) { select(f.id); map.current?.focus(f.id); setSheet(true); }
  return <View style={{ gap: 12 }}>
    <View style={{ gap: 4 }}><Text style={ui.h2}>{word(language, 'Safe Zones', 'സുരക്ഷിത കേന്ദ്രങ്ങൾ')}</Text>
      <Text style={ui.small}>{word(language, 'Shelters, relief camps, hospitals and relief centres. Demo data: SIMULATED locations around Kottayam, not verified live facilities.', 'ഡെമോ: കോട്ടയം പ്രദേശത്തെ സാങ്കൽപ്പിക സ്ഥലങ്ങൾ.')}</Text></View>
    {gps.state === 'locating' ? <View style={ui.row}><ActivityIndicator color={colors.teal} /><Text style={ui.small}>{word(language, 'Finding your location…', 'സ്ഥലം കണ്ടെത്തുന്നു…')}</Text></View>
      : gps.state === 'ok' && gps.fix ? <Text style={ui.small}>📍 {word(language, 'Your location', 'നിങ്ങളുടെ സ്ഥലം')}: {describeFix(gps.fix, language)} · {word(language, 'nearest first', 'അടുത്തുള്ളവ ആദ്യം')}</Text>
      : gps.state === 'denied' || gps.state === 'unavailable' ? <Notice tone="warning" title={word(language, gps.state === 'denied' ? 'Location permission is off' : 'Location not available', 'സ്ഥലം ലഭ്യമല്ല')} text={word(language, 'Distances are hidden and the list is in name order. Search for a town below. Directions still work: Google Maps will ask for your starting point.', 'ദൂരം കാണിക്കില്ല. പട്ടണം തിരയുക. Google Maps ആരംഭസ്ഥലം ചോദിക്കും.')}><Button title={word(language, 'Try location again', 'വീണ്ടും ശ്രമിക്കുക')} tone="secondary" icon="locate-outline" onPress={() => void locate()} /></Notice> : null}
    <TextInput value={search} onChangeText={setSearch} placeholder={word(language, 'Search a place, town or service', 'സ്ഥലം അല്ലെങ്കിൽ പട്ടണം തിരയുക')} placeholderTextColor="#6B7A8C" style={ui.input} accessibilityLabel={word(language, 'Search safe zones', 'സുരക്ഷിത കേന്ദ്രങ്ങൾ തിരയുക')} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{filters.map(f => <Chip key={f.id} label={word(language, f.label, f.ml)} active={filter === f.id} onPress={() => setFilter(f.id)} />)}</ScrollView>
    {tileError ? <Notice tone="warning" title={word(language, 'Map could not load', 'മാപ്പ് ലോഡ് ആയില്ല')} text={word(language, 'Map tiles need internet. The list below still works, and directions open in Google Maps.', 'മാപ്പിന് ഇന്റർനെറ്റ് വേണം. താഴെയുള്ള പട്ടിക ഉപയോഗിക്കാം.')}><Button title={word(language, 'Retry map', 'വീണ്ടും ശ്രമിക്കുക')} tone="secondary" icon="refresh-outline" onPress={() => { setTileError(false); setMapKey(k => k + 1); }} /></Notice>
      : <View style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
        <WebMap key={mapKey} ref={map} height={320} pins={pins} me={me} selectedId={selectedId} onSelect={id => { select(id); setSheet(true); }} onTileError={() => setTileError(true)} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10 }}>
          <Button style={{ flex: 1 }} title={word(language, 'Locate me', 'എന്റെ സ്ഥലം')} icon="locate-outline" tone="secondary" loading={gps.state === 'locating'} onPress={() => void locate()} />
          <Button style={{ flex: 1 }} title={word(language, 'Recenter', 'മധ്യത്തിലാക്കുക')} icon="scan-outline" tone="quiet" onPress={() => map.current?.recenter()} />
        </View>
      </View>}
    <View style={ui.between}><Text style={ui.h3}>{ranked.length} {word(language, 'places', 'സ്ഥലങ്ങൾ')}</Text><ModeToggle mode={mode} onChange={setMode} language={language} /></View>
    {data?.stale ? <Notice tone="warning" text={data.at ? `${word(language, 'Offline: showing the list saved', 'ഓഫ്‌ലൈൻ: സേവ് ചെയ്ത പട്ടിക')} ${dateLabel(data.at, language)}.` : word(language, 'No saved safe-zone list on this phone yet. Connect once to download it, or call 1077.', 'സേവ് ചെയ്ത പട്ടിക ഇല്ല. 1077 വിളിക്കുക.')}>{!data.at ? <Button title={word(language, 'Retry', 'വീണ്ടും ശ്രമിക്കുക')} tone="secondary" icon="refresh-outline" onPress={() => void reload()} /> : null}</Notice> : null}
    {note ? <Notice tone={note.tone} text={note.text} /> : null}
    {!data ? <ActivityIndicator color={colors.teal} /> : ranked.length ? ranked.map(f => <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${f.name}, ${categoryMeta[f.category].label}. ${word(language, 'Show on map and open details', 'വിവരങ്ങൾ')}`} onPress={() => openCard(f)}
      style={({ pressed }) => [ui.card, { opacity: pressed ? 0.8 : 1, borderLeftWidth: 5, borderLeftColor: categoryMeta[f.category].color, borderColor: f.id === selectedId ? colors.teal : colors.line }]}>
      <Text style={ui.h3}>{f.name}</Text>
      <FacilityFacts f={f} language={language} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} title={word(language, 'View on map', 'മാപ്പിൽ')} icon="map-outline" tone="secondary" onPress={() => { select(f.id); map.current?.focus(f.id); }} />
        <Button style={{ flex: 1 }} title={word(language, 'Get directions', 'വഴി കാണിക്കുക')} icon="navigate" loading={busy === f.id} onPress={() => void go(f, mode)} />
      </View>
    </Pressable>) : <Empty title={word(language, 'No places match', 'ഒന്നും കണ്ടെത്തിയില്ല')} text={word(language, 'Try another category or clear the search.', 'മറ്റൊരു വിഭാഗം തിരഞ്ഞെടുക്കുക.')} icon="location-outline" />}
    {ranked.length === 0 && (filter !== 'all' || search) ? <Button title={word(language, 'Show all places', 'എല്ലാം കാണിക്കുക')} tone="quiet" onPress={() => { setFilter('all'); setSearch(''); }} /> : null}
    <Text style={ui.small}>{word(language, 'Distances are straight-line estimates. Google Maps calculates road distance and time. Routes are not verified as safe during a disaster; follow official instructions. Map data © OpenStreetMap contributors.', 'ദൂരം നേർരേഖയിൽ. ഔദ്യോഗിക നിർദേശങ്ങൾ പാലിക്കുക.')}</Text>
    <Modal visible={sheet && !!selected} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
      <Pressable accessibilityLabel={word(language, 'Close details', 'അടയ്ക്കുക')} style={{ flex: 1, backgroundColor: 'rgba(9,24,43,0.35)' }} onPress={() => setSheet(false)} />
      {selected ? <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, gap: 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line }} />
        <View style={ui.between}><Text style={[ui.h2, { flex: 1 }]}>{selected.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Close details', 'അടയ്ക്കുക')} onPress={() => setSheet(false)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color={colors.muted} size={26} /></Pressable></View>
        <FacilityFacts f={selected} language={language} />
        {selected.notes ? <Text style={ui.small}>{selected.notes}</Text> : null}
        <ModeToggle mode={mode} onChange={setMode} language={language} />
        <Button title={word(language, `Get directions (${mode})`, 'വഴി കാണിക്കുക')} icon="navigate" loading={busy === selected.id} onPress={() => void go(selected, mode)} />
        {selected.phone ? <Button title={`${word(language, 'Call', 'വിളിക്കുക')} ${selected.phone}`} icon="call-outline" tone="secondary" onPress={() => void Linking.openURL(`tel:${selected.phone}`)} /> : null}
        {note ? <Notice tone={note.tone} text={note.text} /> : null}
      </View> : null}
    </Modal>
  </View>;
}

/** Dashboard card: small non-interactive map of the nearest safe zones plus the nearest one with directions. */
export function SafeZonesPreview({ role, language, tick, onOpen }: { role: Role; language: Language; tick: unknown; onOpen: () => void }) {
  const [data] = useFacilities(role, tick);
  const [gps] = usePosition();
  const [tileError, setTileError] = useState(false);
  const { go, note, busy } = useDirections(language, gps.fix);
  const ranked = useMemo(() => rankFacilities(data?.data || [], 'all', gps.fix).slice(0, 5), [data, gps.fix]);
  const pins = useMemo(() => ranked.map(f => pinOf(f, language)), [ranked, language]);
  const me = useMemo(() => gps.fix ? { latitude: gps.fix.latitude, longitude: gps.fix.longitude, accuracy: null } : null, [gps.fix]);
  const nearest = ranked[0];
  return <View style={[ui.card, { padding: 0, overflow: 'hidden', gap: 0 }]}>
    <View style={[ui.between, { padding: 14, paddingBottom: 10 }]}><View style={{ flex: 1 }}><Text style={ui.h3}>{word(language, 'Nearby Safe Zones', 'അടുത്തുള്ള സുരക്ഷിത കേന്ദ്രങ്ങൾ')}</Text><Text style={ui.small}>{gps.fix ? word(language, 'Nearest first · straight-line distance', 'അടുത്തുള്ളവ ആദ്യം') : word(language, 'Location off · no distances', 'സ്ഥലം ലഭ്യമല്ല')}</Text></View><Badge label="SIMULATED" /></View>
    {!tileError && pins.length ? <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Open the Safe Zones map', 'സുരക്ഷിത കേന്ദ്ര മാപ്പ് തുറക്കുക')} onPress={onOpen}>
      <View pointerEvents="none"><WebMap height={170} pins={pins} me={me} interactive={false} onSelect={() => undefined} onTileError={() => setTileError(true)} /></View>
    </Pressable> : null}
    <View style={{ padding: 14, gap: 10 }}>
      {tileError ? <Text style={ui.small}>{word(language, 'Map preview needs internet; the nearest places are listed below.', 'മാപ്പിന് ഇന്റർനെറ്റ് വേണം.')}</Text> : null}
      {!data ? <ActivityIndicator color={colors.teal} /> : nearest ? <View style={{ gap: 8 }}>
        <Text style={[ui.text, { fontWeight: '800' }]}>{nearest.name}</Text>
        <Text style={ui.small}>{word(language, categoryMeta[nearest.category].label, categoryMeta[nearest.category].ml)} · {nearest.locality}{nearest.distanceKm !== null ? ` · ${formatDistance(nearest.distanceKm)} (${word(language, 'straight-line', 'നേർരേഖ')})` : ''}{nearest.capacity !== null ? ` · ${nearest.remaining}/${nearest.capacity} ${word(language, 'free', 'ഒഴിവ്')}` : ''}</Text>
        <Button title={word(language, 'Get directions', 'വഴി കാണിക്കുക')} icon="navigate" loading={busy === nearest.id} onPress={() => void go(nearest, remembered.mode)} />
      </View> : <Text style={ui.small}>{data.stale ? word(language, 'No saved safe-zone list yet. Call 1077 for camp information.', '1077 വിളിക്കുക.') : word(language, 'No safe zones in the system yet.', 'വിവരങ്ങൾ ഇല്ല.')}</Text>}
      {note ? <Notice tone={note.tone} text={note.text} /> : null}
      <Button title={word(language, 'View all safe zones', 'എല്ലാ സുരക്ഷിത കേന്ദ്രങ്ങളും')} icon="map-outline" tone="secondary" onPress={onOpen} />
    </View>
  </View>;
}
