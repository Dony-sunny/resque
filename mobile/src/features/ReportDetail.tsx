import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import type { Config, EventKind, MissionStatus, QueueItem, Report, Role, Urgency, User } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Chip, Field, Icon, Notice, SectionHeading } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, friendly, incidentName, isSyntheticDescription, localizeMessage, word, type Language } from '../ui/words';
import { DeliveryBadge } from './Reports';

export function ReportDetail({ report, role, language, queue, config, onClose, onRefresh, onRelay }: {
  report: Report | undefined; role: Role; language: Language; queue: QueueItem[]; config: Config;
  onClose: () => void; onRefresh: () => Promise<void>; onRelay: (id: string) => void;
}) {
  const [verification, setVerification] = useState<Report['verification']>('unverified');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [reasons, setReasons] = useState('');
  const [acknowledge, setAcknowledge] = useState(true);
  const [responders, setResponders] = useState<User[]>([]);
  const [responderId, setResponderId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(0);
  function reloadReview() {
    if (!report) return;
    setVerification(report.verification); setUrgency(report.urgency || 'medium'); setReasons(report.urgency_reasons.join('\n')); setResponderId(report.assigned_to || ''); setReviewVersion(report.version); setError('');
  }
  useEffect(() => { reloadReview(); setError(''); setMessage(''); setNote(''); setResponders([]); }, [report?.id]);
  if (!report) return null;
  const r = report;
  const localQueue = queue.filter(q => q.report_id === r.id);
  const seed = r.source === 'seed';
  const pendingReview = localQueue.some(q => q.kind === 'report.review');
  const pendingAssign = localQueue.some(q => q.kind === 'report.assign');
  const hasBlockedChange = localQueue.some(q => q.status === 'blocked' || q.status === 'conflict');
  const reviewChanged = r.version !== reviewVersion;
  const queuedStatuses = localQueue.filter(q => q.kind === 'mission.status' && (q.status === 'pending' || q.status === 'retry'));
  const projectedStatus = queuedStatuses.length ? queuedStatuses[queuedStatuses.length - 1].payload.status as MissionStatus : undefined;
  async function enqueue(kind: EventKind, payload: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try { await service.enqueueAction(role, kind, r.id, payload); await onRefresh(); setMessage(word(language, 'Change saved on this device. Sync is required before the server confirms it.', 'മാറ്റം ഈ ഉപകരണത്തിൽ സേവ് ചെയ്തു. സെർവർ സ്ഥിരീകരണത്തിന് സിങ്ക് വേണം.')); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save change.'); return false; }
    finally { setBusy(false); }
  }
  async function review() {
    const list = reasons.split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length || list.length > 10 || list.some(s => s.length < 3 || s.length > 200)) { setError(word(language, 'Write 1–10 clear urgency reasons, each 3–200 characters.', 'അടിയന്തരതയുടെ 1–10 കാരണങ്ങൾ നൽകുക. ഓരോന്നും 3–200 അക്ഷരങ്ങൾ ആയിരിക്കണം.')); return; }
    await enqueue('report.review', { verification, urgency, urgency_reasons: list, acknowledge, expected_version: reviewVersion });
  }
  async function fetchResponders() {
    if (config.forceOffline) { setError(word(language, 'Turn off offline practice to load responders.', 'പ്രവർത്തകരെ ലോഡ് ചെയ്യാൻ ഓഫ്‌ലൈൻ പരിശീലനം നിർത്തുക.')); return; }
    setBusy(true); setError('');
    try { const users = await service.loadResponders(config.apiUrl); setResponders(users); if (users.length && !responderId) setResponderId(users[0].id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load responders.'); }
    finally { setBusy(false); }
  }
  const next: Partial<Record<MissionStatus, { status: MissionStatus; label: string; ml: string }>> = { assigned: { status: 'accepted', label: 'Accept mission', ml: 'ദൗത്യം സ്വീകരിക്കുക' }, accepted: { status: 'en_route', label: 'Mark en route', ml: 'യാത്ര ആരംഭിച്ചു' }, en_route: { status: 'on_scene', label: 'Mark arrived on scene', ml: 'സ്ഥലത്തെത്തി' }, on_scene: { status: 'completed', label: 'Mark mission completed', ml: 'ദൗത്യം പൂർത്തിയായി' } };
  const nextStep = next[projectedStatus || r.mission_status];
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={ui.page} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper }}><View style={ui.between}><Text style={ui.h3}>{word(language, 'Report details', 'റിപ്പോർട്ട് വിവരങ്ങൾ')}</Text><Button title={word(language, 'Close', 'അടയ്ക്കുക')} icon="close-outline" tone="quiet" onPress={onClose} /></View></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
        <DeliveryBadge report={r} language={language} />
        {!seed && isSyntheticDescription(r.description) ? <Notice title={word(language, 'Synthetic server demo · interactive', 'കൃത്രിമ സെർവർ ഡെമോ')} text={word(language, 'This is seeded demonstration data, not a real incident. Reviews, assignments, and mission updates work against the demo backend for this example.', 'ഇത് യഥാർത്ഥ സംഭവം അല്ല. ഡെമോ സെർവറിൽ പരിശോധനയും നിയോഗവും ദൗത്യ മാറ്റങ്ങളും പരീക്ഷിക്കാം.')} /> : null}
        <Text style={ui.title}>{incidentName(r.incident_type, language)}</Text><Text style={ui.subtitle}>{r.affected_count} {word(language, 'people affected', 'പേർക്ക് സഹായം വേണം')} · {dateLabel(r.created_at, language)}</Text>
        {seed ? <Notice title={word(language, 'Synthetic example · read-only', 'കൃത്രിമ ഉദാഹരണം')} text={word(language, 'This sample did not come from a person or a rescue team. It is never uploaded. Sync with the seeded backend to run the interactive scenario.', 'ഇത് യഥാർത്ഥ വ്യക്തിയിൽ നിന്നുള്ള റിപ്പോർട്ട് അല്ല. ഡെമോ സെർവറുമായി സിങ്ക് ചെയ്യുക.')} /> : r.delivery_state === 'pending' ? <Notice tone="warning" title={word(language, 'Not delivered to the server', 'സെർവറിൽ എത്തിയിട്ടില്ല')} text={word(language, 'This SOS is saved on this device. QR handoff creates another local copy. Sync is needed to confirm server receipt.', 'ഈ SOS ഉപകരണത്തിൽ സേവ് ചെയ്തിട്ടുണ്ട്. സെർവറിൽ എത്താൻ സിങ്ക് ചെയ്യണം.')} /> : <Notice title={word(language, r.delivery_state === 'acknowledged' ? 'A coordinator has acknowledged this report' : 'The backend has received this report', r.delivery_state === 'acknowledged' ? 'ഏകോപകൻ സ്വീകരിച്ചു' : 'സെർവറിൽ ലഭിച്ചു')} text={word(language, 'Receipt does not guarantee that a rescue team is on the way. Mission status and verification are shown separately below.', 'സ്വീകരിച്ചത് രക്ഷാസംഘം പുറപ്പെട്ടു എന്നുറപ്പില്ല. ദൗത്യസ്ഥിതി താഴെ കാണാം.')} />}
        <View style={ui.card}><Text style={ui.h3}>{word(language, 'Incident information', 'സംഭവവിവരങ്ങൾ')}</Text><Text style={ui.text}>{r.description}</Text><View style={ui.divider} /><View style={ui.row}><Icon name="location-outline" /><Text style={[ui.text, { flex: 1 }]}>{r.location.label}</Text></View>{r.location.latitude !== null && r.location.longitude !== null ? <Text selectable style={ui.small}>{r.location.latitude}, {r.location.longitude}</Text> : <Text style={ui.small}>{word(language, 'Manual landmark · no coordinates', 'സ്ഥലം നേരിട്ട് നൽകിയതാണ്')}</Text>}<Text selectable style={ui.small}>ID: {r.id}</Text></View>
        <View style={ui.card}><Text style={ui.h3}>{word(language, 'Last confirmed state', 'അവസാനം സ്ഥിരീകരിച്ച സ്ഥിതി')}</Text><View style={ui.row}><Badge label={friendly(r.verification, language)} tone={r.verification === 'verified' ? 'success' : r.verification === 'rejected' ? 'danger' : 'neutral'} />{r.urgency ? <Badge label={`${friendly(r.urgency, language)} ${word(language, 'urgency', 'അടിയന്തരത')}`} tone={r.urgency === 'critical' || r.urgency === 'high' ? 'danger' : 'neutral'} /> : <Badge label={word(language, 'URGENCY NOT REVIEWED', 'അടിയന്തരത പരിശോധിച്ചിട്ടില്ല')} />}</View>
          {r.urgency_reasons.length ? <><Text style={ui.label}>{word(language, 'Human-reviewed urgency reasons', 'പരിശോധിച്ച കാരണങ്ങൾ')}</Text>{r.urgency_reasons.map((reason, i) => <Text key={i} style={ui.text}>• {reason}</Text>)}</> : <Text style={ui.small}>{word(language, 'A coordinator must assess urgency; no automatic priority claim is made.', 'ഏകോപകൻ അടിയന്തരത വിലയിരുത്തണം.')}</Text>}
          <Text style={ui.text}>{word(language, 'Mission', 'ദൗത്യം')}: {friendly(r.mission_status, language)}</Text>{r.assigned_to ? <Text style={ui.small}>{word(language, 'Assigned responder', 'നിയോഗിച്ച പ്രവർത്തകൻ')}: {r.assigned_to}</Text> : null}
          {localQueue.length ? <Notice tone="warning" text={word(language, `${localQueue.length} local change(s) are waiting in Outbox. The confirmed state above has not changed yet.`, `${localQueue.length} മാറ്റങ്ങൾ ഔട്ട്ബോക്സിൽ കാത്തിരിക്കുന്നു.`)} /> : null}
        </View>
        {(role === 'citizen' || role === 'volunteer') && !seed ? <Button title={word(language, 'Show relay QR for this report', 'ഈ റിപ്പോർട്ടിന്റെ QR കാണിക്കുക')} icon="qr-code-outline" tone="secondary" onPress={() => onRelay(r.id)} /> : null}
        {role === 'coordinator' ? <>
          {reviewChanged ? <Notice tone="warning" title={word(language, 'Server information changed', 'സെർവർ വിവരങ്ങൾ മാറി')} text={word(language, 'Review the latest confirmed state above, then reload the fields before saving a review or assignment. Your draft has been kept.', 'മുകളിലെ പുതിയ സ്ഥിരീകരിച്ച വിവരങ്ങൾ പരിശോധിക്കുക. പരിശോധനയോ നിയോഗമോ സേവ് ചെയ്യും മുമ്പ് ഫീൽഡുകൾ വീണ്ടും ലോഡ് ചെയ്യുക. നിങ്ങളുടെ കരട് നിലനിൽക്കുന്നു.')}><Button title={word(language, 'Reload review fields', 'പരിശോധന ഫീൽഡുകൾ വീണ്ടും ലോഡ് ചെയ്യുക')} tone="secondary" onPress={reloadReview} /></Notice> : null}
          <View style={ui.card}><SectionHeading title={word(language, 'Review this incident', 'സംഭവം പരിശോധിക്കുക')} caption={word(language, 'Select urgency from your assessment and record the reasons.', 'വിലയിരുത്തലും കാരണങ്ങളും രേഖപ്പെടുത്തുക.')} /><Text style={ui.label}>{word(language, 'Verification', 'സ്ഥിരീകരണം')}</Text><View style={ui.row}>{(['unverified', 'verified', 'rejected'] as const).map(value => <Chip key={value} label={friendly(value, language)} active={verification === value} onPress={() => setVerification(value)} />)}</View><Text style={ui.label}>{word(language, 'Urgency', 'അടിയന്തരത')}</Text><View style={ui.row}>{(['low', 'medium', 'high', 'critical'] as const).map(value => <Chip key={value} label={friendly(value, language)} active={urgency === value} onPress={() => setUrgency(value)} />)}</View><Field label={word(language, 'Reason for your decision', 'തീരുമാനത്തിനുള്ള കാരണം')} value={reasons} onChangeText={setReasons} multiline maxLength={1000} placeholder={word(language, 'One reason per line. Explain what you verified.', 'ഒരു വരിയിൽ ഒരു കാരണം നൽകുക.')} />
            <View style={ui.between}><Text style={[ui.label, { flex: 1 }]}>{word(language, 'Acknowledge receipt', 'സ്വീകരിച്ചത് സ്ഥിരീകരിക്കുക')}</Text><Switch value={acknowledge} onValueChange={setAcknowledge} accessibilityLabel={word(language, 'Acknowledge receipt', 'സ്വീകരിച്ചത് സ്ഥിരീകരിക്കുക')} trackColor={{ false: '#ACBEB7', true: colors.teal }} thumbColor="#FFFFFF" /></View>
            <Button title={word(language, pendingReview ? 'Review waiting for sync' : 'Save review to outbox', pendingReview ? 'പരിശോധന സിങ്ക് കാത്തിരിക്കുന്നു' : 'പരിശോധന സേവ് ചെയ്യുക')} icon="checkmark-done-outline" disabled={seed || r.delivery_state === 'pending' || pendingReview || reviewChanged || hasBlockedChange} loading={busy} onPress={() => void review()} />
          </View>
          <View style={ui.card}><Text style={ui.h3}>{word(language, 'Assign a field responder', 'രക്ഷാപ്രവർത്തകനെ നിയോഗിക്കുക')}</Text><Text style={ui.small}>{word(language, 'Verify and sync the report first. Assignment is confirmed after the server accepts it.', 'ആദ്യം റിപ്പോർട്ട് പരിശോധിച്ച് സിങ്ക് ചെയ്യുക.')} </Text><Button title={word(language, 'Load available responders', 'പ്രവർത്തകരെ ലോഡ് ചെയ്യുക')} icon="people-outline" tone="secondary" disabled={seed || config.forceOffline} loading={busy} onPress={() => void fetchResponders()} />
            <View style={ui.row}>{responders.map(user => <Chip key={user.id} label={user.name} active={responderId === user.id} onPress={() => setResponderId(user.id)} />)}</View><Button title={word(language, pendingAssign ? 'Assignment waiting for sync' : 'Save assignment to outbox', 'നിയോഗം സേവ് ചെയ്യുക')} disabled={seed || !responderId || r.verification !== 'verified' || pendingAssign || pendingReview || reviewChanged || hasBlockedChange} loading={busy} onPress={() => void enqueue('report.assign', { responder_id: responderId, expected_version: r.version })} />
          </View>
        </> : null}
        {role === 'responder' ? <>
          <View style={ui.card}><Text style={ui.h3}>{word(language, 'Mission progress', 'ദൗത്യ പുരോഗതി')}</Text><View style={ui.row}>{(['assigned', 'accepted', 'en_route', 'on_scene', 'completed'] as const).map(status => <Badge key={status} label={friendly(status, language)} tone={r.mission_status === status ? 'success' : 'neutral'} />)}</View>{projectedStatus ? <Notice tone="warning" title={word(language, `On-device progress: ${friendly(projectedStatus, language)}`, `ഈ ഉപകരണത്തിലെ സ്ഥിതി: ${friendly(projectedStatus, language)}`)} text={word(language, 'This progress is saved in your outbox. The server-confirmed mission status above stays unchanged until sync.', 'ഈ പുരോഗതി ഔട്ട്ബോക്സിൽ സേവ് ചെയ്തിട്ടുണ്ട്. സിങ്ക് വരെ സെർവർ സ്ഥിതി മാറില്ല.')} /> : null}{nextStep ? <Button title={word(language, nextStep.label, nextStep.ml)} disabled={seed || hasBlockedChange} loading={busy} icon="arrow-forward-outline" onPress={() => void enqueue('mission.status', { status: nextStep.status, expected_version: r.version })} /> : <Text style={ui.small}>{word(language, projectedStatus === 'completed' ? 'Completion is recorded on this device and waiting for sync.' : 'No next status action available.', projectedStatus === 'completed' ? 'പൂർത്തീകരണം ഉപകരണത്തിൽ സേവ് ചെയ്തു. സിങ്ക് കാത്തിരിക്കുന്നു.' : 'അടുത്ത സ്ഥിതി മാറ്റം ലഭ്യമല്ല.')}</Text>}<Text style={ui.small}>{word(language, 'You can record progress and notes offline. Changes are delivered in order; a server conflict pauses later changes for review.', 'ഓഫ്‌ലൈനിൽ പുരോഗതിയും നോട്ടുകളും നൽകാം. മാറ്റങ്ങൾ ക്രമത്തിൽ എത്തും. വൈരുദ്ധ്യങ്ങൾ പരിശോധിക്കാൻ സിങ്ക് നിൽക്കും.')}</Text></View>
          <View style={ui.card}><Text style={ui.h3}>{word(language, 'Add a field note', 'ഫീൽഡ് നോട്ട് നൽകുക')}</Text><Field label={word(language, 'Your observation', 'നിങ്ങളുടെ നിരീക്ഷണം')} value={note} onChangeText={setNote} multiline maxLength={1000} placeholder={word(language, 'Access route, needs, or progress...', 'വഴി, ആവശ്യം, പുരോഗതി...')} /><Button title={word(language, 'Save note offline', 'നോട്ട് ഓഫ്‌ലൈനായി സേവ് ചെയ്യുക')} icon="create-outline" disabled={seed || !note.trim() || hasBlockedChange} loading={busy} onPress={() => { void (async () => { if (await enqueue('mission.note', { id: Crypto.randomUUID(), text: note.trim(), created_at: new Date().toISOString() })) setNote(''); })(); }} /></View>
        </> : null}
        {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}{message ? <Notice text={message} /> : null}
        {(r.notes.length > 0 || localQueue.some(q => q.kind === 'mission.note')) ? <View style={ui.card}><Text style={ui.h3}>{word(language, 'Field notes', 'ഫീൽഡ് നോട്ടുകൾ')}</Text>{r.notes.map(n => <View key={n.id} style={{ gap: 3 }}><Text style={ui.text}>{n.text}</Text><Text style={ui.small}>{n.author_id} · {dateLabel(n.created_at, language)}</Text><View style={ui.divider} /></View>)}{localQueue.filter(q => q.kind === 'mission.note').map(q => <View key={q.id} style={{ backgroundColor: colors.amberLight, padding: 12, borderRadius: 12, gap: 5 }}><Badge label={word(language, 'LOCAL NOTE · NOT YET DELIVERED', 'ലോക്കൽ നോട്ട് · എത്തിയിട്ടില്ല')} tone="warning" /><Text style={ui.text}>{String(q.payload.text || '')}</Text></View>)}</View> : null}
        <View style={ui.card}><Text style={ui.h3}>{word(language, 'Audit history', 'ഓഡിറ്റ് ചരിത്രം')}</Text>{r.audit.length ? r.audit.map(entry => <View key={entry.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}><Icon name="ellipse" size={9} color={colors.teal} /><View style={{ flex: 1, gap: 3 }}><Text style={ui.label}>{friendly(entry.action, language)}</Text><Text style={ui.small}>{entry.detail}</Text><Text style={ui.small}>{entry.actor_id} · {dateLabel(entry.created_at, language)}</Text></View></View>) : <Text style={ui.small}>{word(language, 'No server audit entries yet. Local changes are listed in Outbox.', 'സെർവർ ഓഡിറ്റ് രേഖകൾ ഇല്ല. ലോക്കൽ മാറ്റങ്ങൾ ഔട്ട്ബോക്സിൽ കാണാം.')}</Text>}</View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
