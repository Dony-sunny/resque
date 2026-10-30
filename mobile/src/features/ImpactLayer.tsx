import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ImpactData, ReliefDemandData, Role } from '../core/types';
import * as service from '../core/services';
import { Badge, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, word, type Language } from '../ui/words';
import { impactHeat } from '../core/heat';
export { demandHeat } from '../core/heat';

export type MapMode = 'street' | 'impact';

/** Impact Heatmap data from the server. Privacy is enforced there: officials get precise points, others aggregated cells. */
export function useImpact(role: Role, tick: unknown, enabled: boolean) {
  const [state, setState] = useState<service.Cached<ImpactData>>();
  const load = useCallback(async () => setState(await service.operations<ImpactData>(role, 'impact', api => api.impact())), [role]);
  useEffect(() => { if (enabled) void load(); }, [load, tick, enabled]);
  return [state, load] as const;
}

export function useReliefDemand(role: Role, tick: unknown, enabled: boolean) {
  const [state, setState] = useState<service.Cached<ReliefDemandData>>();
  useEffect(() => { if (enabled) void service.operations<ReliefDemandData>(role, 'relief-demand', api => api.reliefDemand()).then(setState); }, [role, tick, enabled]);
  return state;
}

export function MapModeToggle({ mode, onChange, language }: { mode: MapMode; onChange: (m: MapMode) => void; language: Language }) {
  const item = (id: MapMode, label: string) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} accessibilityLabel={label} onPress={() => onChange(id)}
    style={{ flex: 1, minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === id ? colors.navy : 'transparent' }}>
    <Text style={{ color: mode === id ? '#FFFFFF' : colors.navy, fontWeight: '800', fontSize: 14 }}>{label}</Text>
  </Pressable>;
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.blueLight, borderWidth: 1, borderColor: colors.line }}>
    {item('street', word(language, 'Street Map', 'സ്ട്രീറ്റ് മാപ്പ്'))}{item('impact', word(language, 'Impact Heatmap', 'ആഘാത ഹീറ്റ്മാപ്പ്'))}
  </View>;
}

const scale = ['#FDE68A', '#F59E0B', '#DC2626', '#7F1D1D'];

export function ImpactLegend({ data, language, filters, demand }: { data?: service.Cached<ImpactData>; language: Language; filters: string; demand?: ReliefDemandData }) {
  const d = data?.data;
  return <View style={[ui.card, { gap: 8 }]}>
    <View style={ui.between}><Text style={ui.h3}>{word(language, 'Impact Heatmap', 'ആഘാത ഹീറ്റ്മാപ്പ്')}</Text>{d?.simulated_reports ? <Badge label="INCLUDES SIMULATED DATA" /> : null}</View>
    <Text style={ui.small}>{word(language, 'Reported emergency impact based on available incident data.', 'ലഭ്യമായ സംഭവ റിപ്പോർട്ടുകളെ അടിസ്ഥാനമാക്കിയ ആഘാതം.')}</Text>
    {!data ? <Text style={ui.small}>{word(language, 'Loading…', 'ലോഡ് ചെയ്യുന്നു…')}</Text> : !d ? <Notice tone="warning" text={word(language, 'No saved heatmap data on this phone yet. Connect once to load it.', 'ഹീറ്റ്മാപ്പ് വിവരങ്ങൾ ഇല്ല.')} />
      : d.insufficient ? <Notice tone="warning" title={word(language, 'Insufficient incident data', 'ആവശ്യത്തിന് വിവരങ്ങൾ ഇല്ല')} text={word(language, 'Too few eligible reports to draw a heatmap. Nothing has been invented.', 'ഹീറ്റ്മാപ്പ് വരയ്ക്കാൻ റിപ്പോർട്ടുകൾ കുറവാണ്.')} /> : <>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>{scale.map(c => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}</View>
        <View style={ui.between}><Text style={ui.small}>{word(language, 'Lower', 'കുറവ്')}</Text><Text style={ui.small}>{word(language, 'Moderate', 'മിതം')}</Text><Text style={ui.small}>{word(language, 'Higher reported impact', 'കൂടിയ ആഘാതം')}</Text></View>
        <Text style={ui.small}>{d.contributing_reports} {word(language, 'contributing reports', 'റിപ്പോർട്ടുകൾ')} · {word(language, 'data from', 'വിവരം')} {dateLabel(d.generated_at, language)}{data.stale ? ` · ${word(language, 'saved copy', 'സേവ് ചെയ്ത പകർപ്പ്')}` : ''}</Text>
        <Text style={ui.small}>{word(language, 'Filters', 'ഫിൽട്ടർ')}: {filters}</Text>
        <Text style={ui.small}>{d.mode === 'precise' ? word(language, 'Exact incident locations (officials only). Dashed rings mark unverified reports.', 'കൃത്യമായ സ്ഥലങ്ങൾ (ഉദ്യോഗസ്ഥർക്ക് മാത്രം).') : d.mode === 'assigned-precise' ? word(language, 'Your assigned missions are exact; other reports are grouped into areas.', 'നിയോഗിച്ച ദൗത്യങ്ങൾ കൃത്യം; മറ്റുള്ളവ പ്രദേശങ്ങളായി.') : word(language, `Grouped into ~${d.cell_km} km areas so no one's exact location is shown.`, `~${d.cell_km} km പ്രദേശങ്ങളായി ഗ്രൂപ്പ് ചെയ്തു.`)}</Text>
      </>}
    {demand ? <View style={{ gap: 4 }}><View style={ui.row}><View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#7C3AED' }} /><Text style={[ui.small, { fontWeight: '700', color: colors.navy }]}>{word(language, 'Relief Demand (purple)', 'ദുരിതാശ്വാസ ആവശ്യം')}</Text></View>
      <Text style={ui.small}>{demand.points.length} {word(language, 'areas with pending requests', 'പ്രദേശങ്ങൾ')}{demand.shortages.length ? ` · ${word(language, 'demand exceeds free stock for', 'സ്റ്റോക്ക് കുറവ്')}: ${demand.shortages.map(s => s.replace(/_/g, ' ')).join(', ')}` : ` · ${word(language, 'free stock covers new requests', 'സ്റ്റോക്ക് മതി')}`}</Text></View> : null}
    <Text style={ui.small}>{word(language, 'Shows where emergencies were reported, not predicted hazard zones. Light or uncoloured areas are not guaranteed safe.', 'റിപ്പോർട്ട് ചെയ്ത സംഭവങ്ങൾ മാത്രം; നിറമില്ലാത്ത പ്രദേശം സുരക്ഷിതമെന്ന് ഉറപ്പില്ല.')}</Text>
  </View>;
}

export function useHeatFor(mode: MapMode, data: service.Cached<ImpactData> | undefined, verifiedOnly = false) {
  return useMemo(() => mode === 'impact' ? impactHeat(data?.data, verifiedOnly) : null, [mode, data, verifiedOnly]);
}
