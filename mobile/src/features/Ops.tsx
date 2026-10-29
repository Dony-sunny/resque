import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import type { AuditRow, AuthorityAlert, Config, InventoryView, OpsSummary, Priority, PriorityLevel, QueueItem, ReliefRequestView, Report, ResourceRow, Role, ShelterView, TeamView } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Chip, Empty, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, friendly, incidentName, type Language } from '../ui/words';
import { AlertComposer } from './Alerts';
import { reliefLabel } from './Tracker';

export const levelColor: Record<PriorityLevel, string> = { CRITICAL: colors.red, HIGH: colors.orange, MEDIUM: '#CA8A04', LOW: '#64748B' };
/** Text on a priority colour; orange and yellow need dark text for contrast. */
const levelText: Record<PriorityLevel, string> = { CRITICAL: '#FFFFFF', HIGH: colors.navy, MEDIUM: colors.navy, LOW: '#FFFFFF' };
const factorName = { severity: 'Severity', vulnerability: 'Vulnerability', people: 'People affected', waiting: 'Waiting time', confidence: 'Verification confidence' };

export function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return <Badge label="PRIORITY AFTER SYNC" />;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: levelColor[priority.level], borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start' }}>
    <Text style={{ color: levelText[priority.level], fontWeight: '900', fontSize: 12 }}>{priority.level}</Text><Text style={{ color: levelText[priority.level], fontWeight: '700', fontSize: 12 }}>{priority.score}</Text>
  </View>;
}

/** "Why this priority?" — every factor's value, weight and contribution. */
export function PriorityExplain({ priority }: { priority?: Priority }) {
  if (!priority) return <Notice tone="warning" text="Priority is calculated by the server once this report syncs." />;
  return <View style={ui.card}>
    <View style={ui.between}><Text style={ui.h3}>Why this priority?</Text><PriorityBadge priority={priority} /></View>
    {priority.breakdown.map(row => <View key={row.factor} style={{ gap: 4 }}>
      <View style={ui.between}><Text style={ui.label}>{factorName[row.factor]} · {Math.round(row.weight * 100)}%</Text><Text style={[ui.small, { fontWeight: '800', color: colors.navy }]}>{row.value} → +{row.contribution}</Text></View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' }}><View style={{ width: `${row.value}%`, height: 8, backgroundColor: levelColor[priority.level] }} /></View>
      <Text style={ui.small}>{row.explanation}</Text>
    </View>)}
    {priority.override ? <Notice tone="error" title="Life-safety override" text={priority.override} /> : null}
    <Text style={ui.small}>score = 0.40·severity + 0.25·vulnerability + 0.15·people + 0.15·waiting + 0.05·confidence. Prototype rule, not validated triage. Resource shortages never lower priority.</Text>
  </View>;
}

export function ResourceTable({ rows, onEscalate, busy }: { rows?: ResourceRow[]; onEscalate?: () => void; busy?: boolean }) {
  if (!rows?.length) return null;
  const short = rows.filter(r => r.shortfall > 0);
  return <View style={ui.card}>
    <Text style={ui.h3}>Resources needed</Text>
    <View style={[ui.between, { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 6 }]}><Text style={[ui.label, { flex: 2, marginBottom: 0 }]}>Resource</Text><Text style={[ui.label, { flex: 1, textAlign: 'right', marginBottom: 0 }]}>Required</Text><Text style={[ui.label, { flex: 1, textAlign: 'right', marginBottom: 0 }]}>Available</Text><Text style={[ui.label, { flex: 1, textAlign: 'right', marginBottom: 0 }]}>Shortfall</Text></View>
    {rows.filter(r => r.required > 0).map(r => <View key={r.key} style={ui.between}>
      <Text style={[ui.small, { flex: 2, color: colors.navy }]}>{r.label}</Text><Text style={[ui.small, { flex: 1, textAlign: 'right', color: colors.navy, fontWeight: '700' }]}>{r.required}</Text>
      <Text style={[ui.small, { flex: 1, textAlign: 'right' }]}>{r.available}</Text><Text style={[ui.small, { flex: 1, textAlign: 'right', fontWeight: '800', color: r.shortfall ? colors.red : colors.teal }]}>{r.shortfall || '—'}</Text>
    </View>)}
    {short.length ? <Notice tone="error" title="Resource shortage" text={`Short of ${short.map(r => `${r.shortfall} ${r.label.toLowerCase()}`).join(', ')}.`}>{onEscalate ? <Button title="Request additional support" icon="megaphone-outline" tone="danger" loading={busy} onPress={onEscalate} /> : null}</Notice> : <Text style={ui.small}>Current availability covers this estimate.</Text>}
    <Text style={ui.small}>Deterministic estimate (first 24 h). Availability counts free teams, stock and open shelter space across the district.</Text>
  </View>;
}

function Stat({ value, label, color = colors.navy, icon }: { value: number | string; label: string; color?: string; icon: IconName }) {
  return <View style={[ui.card, { flexBasis: '47%', flexGrow: 1, padding: 13, gap: 4 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name={icon} size={17} color={color} /><Text style={{ color, fontSize: 26, fontWeight: '900' }}>{value}</Text></View>
    <Text style={ui.small}>{label}</Text>
  </View>;
}

function useOps<T>(role: Role, name: string, read: Parameters<typeof service.operations<T>>[2], tick: unknown) {
  const [state, setState] = useState<service.Cached<T>>();
  const load = useCallback(async () => setState(await service.operations<T>(role, name, read)), [role, name]);
  useEffect(() => { void load(); }, [load, tick]);
  return [state, load] as const;
}

function CacheNote({ state }: { state?: service.Cached<unknown> }) {
  if (!state) return <Text style={ui.small}>Loading live data…</Text>;
  return state.stale ? <Notice tone="warning" text={`${state.at ? `Showing data saved ${dateLabel(state.at)}.` : 'No saved copy yet.'} ${state.error || ''}`} /> : <Text style={ui.small}>Live · updated {dateLabel(state.at || new Date().toISOString())}</Text>;
}

const isOpen = (r: Report) => r.mission_status !== 'completed' && r.verification !== 'rejected';
const waiting = (r: Report) => r.priority ? `${r.priority.waiting_minutes} min` : '';

export function IncidentRow({ report, onPress, pending }: { report: Report; onPress: () => void; pending?: number }) {
  const p = report.priority;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [ui.card, { gap: 7, padding: 14, opacity: pressed ? 0.75 : 1, borderLeftWidth: 5, borderLeftColor: p ? levelColor[p.level] : colors.line }]}>
    <View style={ui.between}><PriorityBadge priority={p} /><Text style={ui.small}>#{report.id.slice(0, 8)} · {waiting(report)}</Text></View>
    <Text style={ui.h3}>{incidentName(report.incident_type, 'en')} · {p?.people.affected ?? report.affected_count} people{p?.people.trapped ? ` · ${p.people.trapped} trapped` : ''}{p?.people.injured ? ` · ${p.people.injured} injured` : ''}</Text>
    <Text style={ui.small} numberOfLines={1}>📍 {report.location.label}</Text>
    <View style={ui.row}>
      <Badge label={friendly(report.verification)} tone={report.verification === 'verified' ? 'success' : report.verification === 'rejected' ? 'danger' : 'neutral'} />
      <Badge label={report.team ? `${report.team.name.split(' · ')[0]} · ${friendly(report.mission_status)}` : friendly(report.mission_status)} tone={report.assigned_to ? 'success' : 'warning'} />
      {p?.life_threat ? <Badge label="LIFE THREAT" tone="danger" /> : null}
      {report.duplicates?.length ? <Badge label={`${report.duplicates.length} POSSIBLE DUPLICATE`} tone="warning" /> : null}
      {report.duplicate_of ? <Badge label="LINKED DUPLICATE" /> : null}
      {report.description.startsWith('[SIMULATED]') ? <Badge label="SIMULATED" /> : null}
      {pending ? <Badge label={`${pending} queued`} tone="warning" /> : null}
    </View>
  </Pressable>;
}

/** Government official: KPIs, alerts, demo controls and the explainable priority queue. */
export function GovernmentHome({ view, language, reports, queue, config, tick, onOpen, onRefresh, onSync, onIncidents }: {
  view: 'overview' | 'incidents'; language: Language; reports: Report[]; queue: QueueItem[]; config: Config; tick: unknown; onOpen: (id: string) => void; onRefresh: () => Promise<void>; onSync: () => void; onIncidents: () => void;
}) {
  const [summary, reload] = useOps<OpsSummary>('coordinator', 'summary', api => api.summary(), tick);
  const [filter, setFilter] = useState<'open' | 'critical' | 'unassigned' | 'unverified' | 'duplicates' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const ranked = useMemo(() => reports.filter(r => r.source !== 'seed')
    .filter(r => filter === 'all' || (filter === 'open' ? isOpen(r) : filter === 'critical' ? isOpen(r) && r.priority?.level === 'CRITICAL' : filter === 'unassigned' ? isOpen(r) && !r.assigned_to : filter === 'unverified' ? r.verification === 'unverified' : !!r.duplicates?.length))
    .filter(r => !search.trim() || `${r.id} ${r.location.label} ${r.incident_type} ${r.description}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.priority?.score ?? -1) - (a.priority?.score ?? -1) || a.created_at.localeCompare(b.created_at)), [reports, filter, search]);
  async function demo(kind: 'simulate' | 'reset') {
    setBusy(kind); setMessage('');
    try {
      const result: unknown = await service.act<unknown>('coordinator', api => kind === 'simulate' ? api.demoSimulate() : api.demoReset());
      setMessage(kind === 'simulate' ? `Simulation: ${(result as { created: string[] }).created.length} new SIMULATED SOS calls; simulated teams advanced one step.` : 'Demo reset: simulated Kottayam scenario restored. Real reports were kept.');
      onSync(); await reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Demo action failed'); }
    finally { setBusy(''); }
  }
  const s = summary?.data;
  if (view === 'incidents') return <View style={{ gap: 14 }}>
    <SectionHeading title="Incident queue" caption={`${ranked.length} incident(s) · highest priority first · deterministic score`} />
    <TextInput value={search} onChangeText={setSearch} placeholder="Search ID, place or type" placeholderTextColor="#6B7A8C" style={ui.input} accessibilityLabel="Search incidents" />
    <View style={ui.row}>{(['open', 'critical', 'unassigned', 'unverified', 'duplicates', 'all'] as const).map(f => <Chip key={f} label={f === 'open' ? 'Unresolved' : f[0].toUpperCase() + f.slice(1)} active={filter === f} onPress={() => setFilter(f)} />)}</View>
    {ranked.length ? ranked.map(r => <IncidentRow key={r.id} report={r} pending={queue.filter(q => q.report_id === r.id).length} onPress={() => onOpen(r.id)} />) : <Empty title="No incidents match" text="Sync to load incidents, or run the simulation." />}
  </View>;
  const critical = reports.filter(r => r.source !== 'seed' && isOpen(r) && r.priority?.level === 'CRITICAL' && !r.assigned_to).sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0)).slice(0, 3);
  return <View style={{ gap: 14 }}>
    <SectionHeading title="Command centre" caption="Kottayam district · live operational picture" />
    <CacheNote state={summary} />
    {s ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Stat value={s.active_sos} label="Active SOS" icon="alert-circle-outline" />
      <Stat value={s.critical} label="Critical" color={colors.red} icon="flame-outline" />
      <Stat value={s.unassigned} label="Unassigned" color="#D9601A" icon="help-circle-outline" />
      <Stat value={`${s.teams_available}/${s.teams_total}`} label="Teams available" color={colors.teal} icon="people-outline" />
      <Stat value={s.pending_relief} label="Pending relief requests" color="#B7860B" icon="cube-outline" />
      <Stat value={s.open_shelters} label={`Open shelters · ${s.shelter_space} places free`} color={colors.teal} icon="home-outline" />
    </View> : null}
    {s?.shortages.length ? <Notice tone="error" title="District resource shortages" text={s.shortages.map(x => `${x.key.replace(/_/g, ' ')}: need ${x.required}, have ${x.available}`).join(' · ')} /> : null}
    {s?.low_stock.length ? <Notice tone="warning" title="Low stock" text={s.low_stock.map(i => `${i.name} (${i.available} left)`).join(', ')} /> : null}
    <View style={ui.between}><Text style={ui.h2}>Critical · needs a team</Text><Pressable accessibilityRole="button" onPress={onIncidents} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.teal, fontWeight: '700' }}>Full queue ›</Text></Pressable></View>
    {critical.length ? critical.map(r => <IncidentRow key={r.id} report={r} pending={queue.filter(q => q.report_id === r.id).length} onPress={() => onOpen(r.id)} />) : <Text style={ui.small}>No unassigned critical incidents.</Text>}
    <View style={ui.card}><Text style={ui.h3}>Demo controls</Text>
      <Text style={ui.small}>Simulation data is clearly labelled SIMULATED. Reset restores the known Kottayam scenario without deleting real reports.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}><Button style={{ flex: 1 }} title="Run simulation" icon="play-outline" tone="secondary" loading={busy === 'simulate'} onPress={() => void demo('simulate')} /><Button style={{ flex: 1 }} title="Reset demo" icon="refresh-outline" tone="quiet" loading={busy === 'reset'} onPress={() => void demo('reset')} /></View>
      {message ? <Notice text={message} /> : null}
    </View>
    <AlertComposer language={language} config={config} onPublished={onRefresh} />
  </View>;
}

/** All rescue teams with live mission state. Officials can change availability; busy teams cannot go off duty. */
export function TeamsScreen({ role, tick, onOpen }: { role: Role; tick: unknown; onOpen: (id: string) => void }) {
  const [teams, reload] = useOps<TeamView[]>(role, 'teams', api => api.teams(), tick);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function toggle(team: TeamView, onDuty: boolean) {
    setBusy(team.id); setError('');
    try { await service.act(role, api => api.setAvailability(team.id, onDuty)); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change availability'); }
    finally { setBusy(''); }
  }
  return <View style={{ gap: 14 }}>
    <SectionHeading title="Rescue teams" caption="A team on a mission is never offered for another assignment." />
    <CacheNote state={teams} />
    {error ? <Notice tone="error" text={error} /> : null}
    {(teams?.data || []).map(t => <View key={t.id} style={ui.card}>
      <View style={ui.between}><Text style={[ui.h3, { flex: 1 }]}>{t.name}</Text><Badge label={t.mission_id ? 'ON MISSION' : t.on_duty ? 'AVAILABLE' : 'OFF DUTY'} tone={t.mission_id ? 'warning' : t.on_duty ? 'success' : 'neutral'} /></View>
      <Text style={ui.small}>{t.capacity} members · {t.capabilities.join(', ')} · readiness {t.readiness}% · base {t.base}{t.simulated ? ' · SIMULATED' : ''}</Text>
      {t.mission_id ? <Pressable accessibilityRole="button" onPress={() => onOpen(t.mission_id!)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.teal, fontWeight: '700' }}>Mission #{t.mission_id.slice(0, 8)} · {friendly(t.mission_status || '')} ›</Text></Pressable> : null}
      {role === 'coordinator' ? <View style={ui.between}><Text style={ui.small}>On duty</Text><Switch value={t.on_duty} disabled={busy === t.id || !!t.mission_id} onValueChange={v => void toggle(t, v)} accessibilityLabel={`${t.name} on duty`} trackColor={{ false: '#9AA8B8', true: colors.teal }} thumbColor="#FFFFFF" /></View> : null}
    </View>)}
  </View>;
}

/** Chronological record of every operational change, with previous and new status. */
export function AuditScreen({ role, tick }: { role: Role; tick: unknown }) {
  const [rows] = useOps<AuditRow[]>(role, 'audit', api => api.auditLog(), tick);
  return <View style={{ gap: 10 }}>
    <SectionHeading title="Audit log" caption="Who changed what, and when. Latest first." />
    <CacheNote state={rows} />
    {(rows?.data || []).slice(0, 60).map(r => <View key={r.id} style={[ui.card, { padding: 12, gap: 4 }]}>
      <View style={ui.between}><Text style={[ui.small, { fontWeight: '800', color: colors.navy }]}>{r.action}</Text><Text style={ui.small}>{dateLabel(r.created_at)}</Text></View>
      <Text style={ui.small}>{r.actor} · {r.entity} {r.entity_id.slice(0, 12)}{r.previous_status || r.new_status ? ` · ${r.previous_status || '—'} → ${r.new_status || '—'}` : ''}{r.detail ? ` · ${r.detail}` : ''}</Text>
    </View>)}
  </View>;
}

/** Rescue team: own team status, availability and missions ranked by priority. */
export function RescueUpdates({ reports, alerts, onOpen }: { reports: Report[]; alerts: AuthorityAlert[]; onOpen: (id: string) => void }) {
  const done = reports.filter(r => r.source !== 'seed' && r.mission_status === 'completed');
  return <View style={{ gap: 14 }}>
    <SectionHeading title="Updates" caption="Official alerts and this team's mission history." />
    {alerts.length ? alerts.map(a => <Notice key={a.id} tone={a.severity === 'danger' ? 'error' : 'warning'} title={a.title} text={`${a.body} · ${a.area} · ${dateLabel(a.created_at)}`} />) : <Text style={ui.small}>No active official alerts.</Text>}
    <Text style={ui.h3}>Completed missions</Text>
    {done.length ? done.map(r => <IncidentRow key={r.id} report={r} onPress={() => onOpen(r.id)} />) : <Text style={ui.small}>No completed missions yet.</Text>}
  </View>;
}

export function RescueHome({ reports, queue, tick, onOpen }: { reports: Report[]; queue: QueueItem[]; tick: unknown; onOpen: (id: string) => void }) {
  const [teams, reload] = useOps<TeamView[]>('responder', 'teams', api => api.teams(), tick);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mine = teams?.data?.find(t => t.lead_user_id === 'demo-responder');
  const missions = reports.filter(r => r.source !== 'seed' && isOpen(r)).sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0));
  async function availability(onDuty: boolean) {
    if (!mine) return;
    setSaving(true); setError('');
    try { await service.act('responder', api => api.setAvailability(mine.id, onDuty)); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change availability'); }
    finally { setSaving(false); }
  }
  return <View style={{ gap: 16 }}>
    <SectionHeading title="Team missions" caption="Accept, update and request support. Updates work offline and sync in order." />
    <CacheNote state={teams} />
    {mine ? <View style={[ui.card, { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>{mine.name}</Text>
      <Text style={{ color: '#CFE0E0' }}>{mine.capacity} members · {mine.capabilities.join(', ')} · readiness {mine.readiness}% · base {mine.base}</Text>
      <View style={ui.between}><Text style={{ color: '#FFFFFF', fontWeight: '700', flex: 1 }}>{mine.mission_id ? `On mission #${mine.mission_id.slice(0, 8)} · ${friendly(mine.mission_status || '')}` : mine.on_duty ? 'Available for assignment' : 'Off duty'}</Text>
        <Switch value={mine.on_duty} disabled={saving} onValueChange={value => void availability(value)} accessibilityLabel="Team on duty" trackColor={{ false: '#4B6670', true: colors.teal }} thumbColor="#FFFFFF" /></View>
      {error ? <Text style={{ color: '#FFD2D5' }}>{error}</Text> : null}
    </View> : null}
    {missions.length ? missions.map(r => <View key={r.id} style={{ gap: 6 }}>
      <IncidentRow report={r} pending={queue.filter(q => q.report_id === r.id).length} onPress={() => onOpen(r.id)} />
      {isOpen(r) && r.resources ? <Text style={[ui.small, { paddingHorizontal: 6 }]}>Equipment: {r.resources.filter(x => x.required && ['rescue_personnel', 'boats', 'ambulances', 'medicine_kits', 'medical_personnel'].includes(x.key)).map(x => `${x.required} ${x.label.toLowerCase()}`).join(' · ') || 'standard kit'}</Text> : null}
    </View>) : <Empty title="No missions assigned" text="When the government assigns this team, the mission appears here on the next sync." />}
  </View>;
}

const nextAction: Partial<Record<string, { action: 'approve' | 'pack' | 'dispatch' | 'deliver'; label: string; icon: IconName }>> = {
  requested: { action: 'approve', label: 'Approve & allocate stock', icon: 'checkmark-done-outline' },
  approved: { action: 'pack', label: 'Mark packed', icon: 'cube-outline' },
  packed: { action: 'dispatch', label: 'Dispatch', icon: 'car-outline' },
  dispatched: { action: 'deliver', label: 'Mark delivered', icon: 'checkmark-circle-outline' },
};

/** Food & relief: inventory with reservations, request pipeline and dispatch. */
const reliefViews = {
  requests: { title: 'Relief requests', caption: 'Approve to reserve stock. Stock can never go negative.', filters: ['requested', 'approved', 'cancelled'] },
  dispatch: { title: 'Dispatch', caption: 'Pack, dispatch and confirm delivery. Each request is dispatched once.', filters: ['approved', 'packed', 'dispatched', 'delivered'] },
} as const;

export function ReliefHome({ view, role = 'relief', reports, tick, onOpen }: { view: 'requests' | 'inventory' | 'dispatch'; role?: Role; reports: Report[]; tick: unknown; onOpen: (id: string) => void }) {
  const [stock, reloadStock] = useOps<InventoryView[]>(role, 'inventory', api => api.inventory(), tick);
  const [requests, reloadRequests] = useOps<ReliefRequestView[]>(role, 'requests', api => api.reliefRequests(), tick);
  const [filter, setFilter] = useState<string>(view === 'dispatch' ? 'packed' : 'requested');
  useEffect(() => setFilter(view === 'dispatch' ? 'packed' : 'requested'), [view]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(id: string, action: 'approve' | 'pack' | 'dispatch' | 'deliver' | 'cancel') {
    setBusy(`${id}:${action}`); setError(''); setMessage('');
    try { const row = await service.act('relief', api => api.reliefAction(id, action)); setMessage(`Request #${id.slice(0, 8)} is now ${reliefLabel(row.status, 'en').toLowerCase()}.`); await Promise.all([reloadStock(), reloadRequests()]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(''); }
  }
  async function restock(key: string) {
    setBusy(`restock:${key}`); setError('');
    try { await service.act('relief', api => api.restock(key, 100)); await reloadStock(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Restock failed'); }
    finally { setBusy(''); }
  }
  const rows = (requests?.data || []).filter(r => r.status === filter);
  const supplies = (stock?.data || []).filter(i => i.kind === 'supply'), assets = (stock?.data || []).filter(i => i.kind === 'asset');
  const count = (status: string) => (requests?.data || []).filter(r => r.status === status).length;
  if (view === 'inventory') return <View style={{ gap: 14 }}>
    <SectionHeading title="Inventory" caption="Total, reserved for approved requests, and free to allocate." />
    <CacheNote state={stock} />
    {error ? <Notice tone="error" text={error} /> : null}
    <View style={ui.card}><Text style={ui.h3}>Stock</Text>
      {supplies.map(i => <View key={i.key} style={{ gap: 4, paddingVertical: 4 }}>
        <View style={ui.between}><Text style={[ui.text, { fontWeight: '700', flex: 1 }]}>{i.name}</Text>{i.low ? <Badge label="LOW STOCK" tone="danger" /> : null}</View>
        <Text style={ui.small}>Total {i.total} · reserved {i.reserved} · available {i.available} {i.unit}</Text>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', flexDirection: 'row' }}><View style={{ width: `${i.total ? (i.reserved / i.total) * 100 : 0}%`, backgroundColor: '#B7860B' }} /><View style={{ width: `${i.total ? (i.available / i.total) * 100 : 0}%`, backgroundColor: colors.teal }} /></View>
        {role === 'relief' ? <Button title="+100 received" tone="quiet" icon="add-outline" loading={busy === `restock:${i.key}`} onPress={() => void restock(i.key)} /> : null}
      </View>)}
      {assets.length ? <Text style={ui.small}>Assets: {assets.map(a => `${a.name} ${a.available}`).join(' · ')}</Text> : null}
    </View>
  </View>;
  const copy = reliefViews[view];
  return <View style={{ gap: 14 }}>
    <SectionHeading title={copy.title} caption={copy.caption} />
    <CacheNote state={requests} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Stat value={count('requested')} label="New requests" color={colors.amber} icon="mail-unread-outline" />
      <Stat value={count('approved') + count('packed')} label="Allocated / packed" color={colors.navy} icon="cube-outline" />
      <Stat value={count('dispatched')} label="On the way" color={colors.teal} icon="car-outline" />
      <Stat value={supplies.filter(i => i.low).length} label="Low-stock items" color={colors.red} icon="warning-outline" />
    </View>
    {error ? <Notice tone="error" text={error} /> : null}{message ? <Notice text={message} /> : null}
    <View style={ui.row}>{copy.filters.map(f => <Chip key={f} label={`${f[0].toUpperCase() + f.slice(1)} (${count(f)})`} active={filter === f} onPress={() => setFilter(f)} />)}</View>
    {rows.length ? rows.map(r => {
      const incident = reports.find(x => x.id === r.incident_id), next = nextAction[r.status];
      return <View key={r.id} style={ui.card}>
        <View style={ui.between}><Text style={ui.h3}>#{r.id.slice(0, 8)}</Text><Badge label={reliefLabel(r.status, 'en').toUpperCase()} tone={r.status === 'delivered' ? 'success' : r.status === 'cancelled' ? 'danger' : 'warning'} /></View>
        <Text style={ui.text}>{Object.entries(r.items).map(([k, q]) => `${k.replace(/_/g, ' ')} × ${q}`).join(' · ')}</Text>
        <Text style={ui.small}>From {r.requester_role} · {dateLabel(r.created_at)}{r.simulated ? ' · SIMULATED' : ''}{r.note ? ` · ${r.note}` : ''}</Text>
        {incident ? <Pressable onPress={() => onOpen(incident.id)}><Text style={[ui.small, { color: colors.teal, fontWeight: '700' }]}>📍 {incidentName(incident.incident_type, 'en')} · {incident.location.label} ›</Text></Pressable> : null}
        <Text style={ui.small}>{r.history.map(h => `${h.status} (${h.actor})`).join(' → ')}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {next ? <Button style={{ flex: 2 }} title={next.label} icon={next.icon} loading={busy === `${r.id}:${next.action}`} onPress={() => void run(r.id, next.action)} /> : null}
          {['requested', 'approved', 'packed'].includes(r.status) ? <Button style={{ flex: 1 }} title="Cancel" tone="quiet" loading={busy === `${r.id}:cancel`} onPress={() => void run(r.id, 'cancel')} /> : null}
        </View>
      </View>;
    }) : <Empty title="No requests here" text="Victims, rescue teams and officials create relief requests from their SOS and mission screens." icon="cube-outline" />}
  </View>;
}

/** Shelters: capacity, occupancy and facilities. Relief managers and officials can update occupancy. */
export function SheltersScreen({ role, tick }: { role: Role; tick: unknown }) {
  const [shelters, reload] = useOps<ShelterView[]>(role, 'shelters', api => api.shelters(), tick);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const canEdit = role === 'relief' || role === 'coordinator';
  async function change(row: ShelterView, delta: number) {
    setBusy(row.id); setError('');
    try { await service.act(role, api => api.setOccupancy(row.id, row.occupancy + delta)); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update'); }
    finally { setBusy(''); }
  }
  return <View style={{ gap: 16 }}>
    <SectionHeading title="Shelters & relief camps" caption="SIMULATED Kottayam camps for the demonstration." />
    <CacheNote state={shelters} />
    {error ? <Notice tone="error" text={error} /> : null}
    {(shelters?.data || []).map(row => <View key={row.id} style={ui.card}>
      <View style={ui.between}><Text style={[ui.h3, { flex: 1 }]}>{row.name}</Text><Badge label={row.status.toUpperCase()} tone={row.status === 'open' ? 'success' : 'danger'} /></View>
      <Text style={ui.small}>📍 {row.area} · {row.facilities.join(', ')}</Text>
      <Text style={ui.text}>{row.occupancy} / {row.capacity} people · {row.remaining} places free</Text>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' }}><View style={{ width: `${(row.occupancy / row.capacity) * 100}%`, height: 10, backgroundColor: row.remaining ? colors.teal : colors.red }} /></View>
      {canEdit ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} title="−10" tone="quiet" disabled={row.occupancy < 10 || busy === row.id} onPress={() => void change(row, -10)} />
        <Button style={{ flex: 1 }} title="−1" tone="quiet" disabled={row.occupancy < 1 || busy === row.id} onPress={() => void change(row, -1)} />
        <Button style={{ flex: 1 }} title="+1" tone="secondary" disabled={!row.remaining || busy === row.id} onPress={() => void change(row, 1)} />
        <Button style={{ flex: 1 }} title="+10" tone="secondary" disabled={row.remaining < 10 || busy === row.id} onPress={() => void change(row, 10)} />
      </View> : null}
    </View>)}
  </View>;
}
