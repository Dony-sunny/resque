import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { Assistance, Details, Report, TeamView } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Chip, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { word, type Language } from '../ui/words';
import { Stepper } from './CreateReport';

const needLabels: Record<Assistance, [string, string]> = { rescue: ['Rescue', 'രക്ഷാപ്രവർത്തനം'], ambulance: ['Ambulance', 'ആംബുലൻസ്'], medical: ['Medical help', 'വൈദ്യസഹായം'], food: ['Food', 'ഭക്ഷണം'], water: ['Water', 'വെള്ളം'], medicine: ['Medicine', 'മരുന്ന്'], shelter: ['Shelter', 'അഭയം'] };
const empty: Details = { people: { trapped: 0, injured: 0, children: 0, elderly: 0, disabled: 0 }, life_threat: false, assistance: [] };

export function DetailsSummary({ report, language }: { report: Report; language: Language }) {
  const d = report.details;
  if (!d) return null;
  const p = d.people, parts = [[p.trapped, 'trapped', 'കുടുങ്ങിയവർ'], [p.injured, 'injured', 'പരിക്കേറ്റവർ'], [p.children, 'children', 'കുട്ടികൾ'], [p.elderly, 'elderly', 'വയോജനങ്ങൾ'], [p.disabled, 'with disabilities', 'ഭിന്നശേഷിക്കാർ']] as const;
  return <View style={ui.card}>
    <Text style={ui.h3}>{word(language, 'People at risk & needs', 'അപകടത്തിലുള്ളവരും ആവശ്യങ്ങളും')}</Text>
    {d.life_threat ? <Badge label={word(language, 'IMMEDIATE LIFE THREAT', 'ജീവന് ഭീഷണി')} tone="danger" /> : null}
    <Text style={ui.text}>{report.affected_count} {word(language, 'affected', 'ബാധിതർ')}{parts.filter(([n]) => n).map(([n, en, ml]) => ` · ${n} ${word(language, en, ml)}`).join('')}</Text>
    {d.assistance.length ? <View style={ui.row}>{d.assistance.map(a => <Badge key={a} label={word(language, needLabels[a][0], needLabels[a][1]).toUpperCase()} />)}</View> : null}
    {(report.support || []).map(s => <Text key={s.id} style={[ui.small, { color: colors.red }]}>⚑ {s.kind === 'escalation' ? 'Support escalated' : `Team requested ${s.kind}`}{s.note ? `: ${s.note}` : ''}{Object.keys(s.items || {}).length ? ` (${Object.entries(s.items).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')})` : ''}</Text>)}
  </View>;
}

/** Progressive data collection after the SOS was sent. Queued offline like any other change. */
export function DetailsEditor({ report, language, onSave, disabled }: { report: Report; language: Language; onSave: (details: Details) => Promise<boolean>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Details>(report.details || empty);
  useEffect(() => { setDraft(report.details || empty); }, [report.id, report.version]);
  const people = (key: keyof Details['people'], value: number) => setDraft(d => ({ ...d, people: { ...d.people, [key]: value } }));
  if (!open) return <Button title={word(language, 'Add or update people & needs', 'ആളുകളും ആവശ്യങ്ങളും പുതുക്കുക')} icon="create-outline" tone="secondary" disabled={disabled} onPress={() => setOpen(true)} />;
  return <View style={ui.card}>
    <Text style={ui.h3}>{word(language, 'Update people & needs', 'വിവരങ്ങൾ പുതുക്കുക')}</Text>
    <Stepper label={word(language, 'Trapped', 'കുടുങ്ങിയവർ')} value={draft.people.trapped} onChange={n => people('trapped', n)} language={language} />
    <Stepper label={word(language, 'Injured', 'പരിക്കേറ്റവർ')} value={draft.people.injured} onChange={n => people('injured', n)} language={language} />
    <Stepper label={word(language, 'Children', 'കുട്ടികൾ')} value={draft.people.children} onChange={n => people('children', n)} language={language} />
    <Stepper label={word(language, 'Elderly', 'വയോജനങ്ങൾ')} value={draft.people.elderly} onChange={n => people('elderly', n)} language={language} />
    <Stepper label={word(language, 'With disabilities', 'ഭിന്നശേഷിക്കാർ')} value={draft.people.disabled} onChange={n => people('disabled', n)} language={language} />
    <View style={ui.between}><Text style={[ui.text, { flex: 1 }]}>{word(language, 'Immediate life threat', 'ജീവന് ഭീഷണി')}</Text><Switch value={draft.life_threat} onValueChange={v => setDraft(d => ({ ...d, life_threat: v }))} trackColor={{ false: '#ACBEB7', true: colors.red }} thumbColor="#FFFFFF" /></View>
    <View style={ui.row}>{(Object.keys(needLabels) as Assistance[]).map(a => <Chip key={a} label={word(language, needLabels[a][0], needLabels[a][1])} active={draft.assistance.includes(a)} onPress={() => setDraft(d => ({ ...d, assistance: d.assistance.includes(a) ? d.assistance.filter(x => x !== a) : [...d.assistance, a] }))} />)}</View>
    <Button title={word(language, 'Save update (sent on next sync)', 'പുതുക്കൽ സേവ് ചെയ്യുക')} icon="save-outline" disabled={disabled} onPress={() => { void onSave(draft).then(ok => { if (ok) setOpen(false); }); }} />
  </View>;
}

/** Recommended teams (capability, proximity, readiness, capacity); only free teams are offered. */
export function TeamPanel({ report, onAssign, disabled }: { report: Report; onAssign: (teamId: string) => Promise<boolean>; disabled: boolean }) {
  const [teams, setTeams] = useState<TeamView[]>();
  const [error, setError] = useState('');
  async function load() {
    setError('');
    const result = await service.operations<TeamView[]>('coordinator', `recommend:${report.id}`, api => api.recommendTeams(report.id));
    setTeams(result.data || []); if (result.stale) setError(result.error || 'Showing saved recommendations.');
  }
  useEffect(() => { void load(); }, [report.id, report.version]);
  return <View style={ui.card}>
    <Text style={ui.h3}>Assign a rescue team</Text>
    {report.team ? <Notice text={`Assigned: ${report.team.name} · ${report.mission_status.replace('_', ' ')}`} /> : null}
    {report.verification !== 'verified' ? <Text style={ui.small}>Verify the report (review above) before assigning a team.</Text> : null}
    {error ? <Notice tone="warning" text={error} /> : null}
    {teams?.length ? teams.map((t, i) => <View key={t.id} style={{ borderWidth: 1, borderColor: i === 0 ? colors.teal : colors.line, borderRadius: 12, padding: 11, gap: 5 }}>
      <View style={ui.between}><Text style={[ui.text, { fontWeight: '800', flex: 1 }]}>{t.name}</Text><Badge label={`${i === 0 ? 'BEST MATCH · ' : ''}${t.match_score}`} tone={i === 0 ? 'success' : 'neutral'} /></View>
      <Text style={ui.small}>{t.match_reason}{t.simulated ? ' · simulated team' : ''}</Text>
      <Button title={`Assign ${t.name.split(' · ')[0]}`} icon="send-outline" tone={i === 0 ? 'primary' : 'secondary'} disabled={disabled || report.verification !== 'verified'} onPress={() => void onAssign(t.id)} />
    </View>) : <Text style={ui.small}>{teams ? 'No team is free right now. Every team is on a mission or off duty; escalate for support.' : 'Loading recommendations…'}</Text>}
    <Button title="Refresh recommendations" tone="quiet" icon="refresh-outline" onPress={() => void load()} />
  </View>;
}

export function DuplicatePanel({ report, onLink, disabled }: { report: Report; onLink: (target: string | null) => Promise<boolean>; disabled: boolean }) {
  if (!report.duplicates?.length && !report.duplicate_of && !report.linked_duplicates?.length) return null;
  return <View style={ui.card}>
    <Text style={ui.h3}>Possible duplicates</Text>
    <Text style={ui.small}>Same hazard within 250 m and 30 minutes. Linking keeps both reports; nothing is discarded.</Text>
    {report.duplicate_of ? <><Notice text={`Linked as a duplicate of #${report.duplicate_of.slice(0, 8)}.`} /><Button title="Remove link" tone="quiet" disabled={disabled} onPress={() => void onLink(null)} /></> : null}
    {report.linked_duplicates?.length ? <Text style={ui.small}>Reports linked to this one: {report.linked_duplicates.map(id => `#${id.slice(0, 8)}`).join(', ')}</Text> : null}
    {!report.duplicate_of ? (report.duplicates || []).map(id => <Button key={id} title={`Link as duplicate of #${id.slice(0, 8)}`} icon="link-outline" tone="secondary" disabled={disabled} onPress={() => void onLink(id)} />) : null}
  </View>;
}

/** Quick relief allocation request from an incident (government) — reviewed by the relief manager. */
export function ReliefRequestPanel({ report, onRequest, disabled, title = 'Request relief supplies' }: { report: Report; onRequest: (items: Record<string, number>) => Promise<boolean>; disabled: boolean; title?: string }) {
  const people = report.priority?.people.affected ?? report.affected_count;
  const injured = report.priority?.people.injured ?? report.details?.people.injured ?? 0;
  const presets: [string, Record<string, number>][] = [
    [`Food & water for ${people}`, { food_packets: people * 3, water_bottles: people * 3 }],
    [`Medicine kits (${Math.max(2, injured * 2)})`, { medicine_kits: Math.max(2, injured * 2) }],
    [`Blankets & shelter kits`, { blankets: people, shelter_kits: Math.max(1, Math.ceil(people / 5)) }],
  ];
  return <View style={ui.card}>
    <Text style={ui.h3}>{title}</Text>
    {presets.map(([label, items]) => <Button key={label} title={label} icon="cube-outline" tone="secondary" disabled={disabled} onPress={() => void onRequest(items)} />)}
    <Text style={ui.small}>Requests go to Food & Relief for approval and dispatch; their status appears on this incident.</Text>
  </View>;
}
