import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Report, Role, QueueItem } from '../core/types';
import { Badge, Button, Chip, Empty, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, friendly, incidentName, isSyntheticDescription, localizeMessage, word, type Language } from '../ui/words';
import { roleInfo } from './registry';

export function DeliveryBadge({ report, language }: { report: Report; language: Language }) {
  if (report.source === 'seed') return <Badge label={word(language, 'SYNTHETIC EXAMPLE', 'കൃത്രിമ ഉദാഹരണം')} />;
  const state = report.delivery_state;
  return <Badge tone={state === 'pending' ? 'warning' : 'success'} label={state === 'pending' ? word(language, 'PENDING · ON THIS DEVICE', 'കാത്തിരിക്കുന്നു · ഈ ഉപകരണത്തിൽ') : state === 'delivered' ? word(language, 'DELIVERED TO SERVER', 'സെർവറിൽ എത്തി') : word(language, 'ACKNOWLEDGED BY COORDINATOR', 'ഏകോപകൻ സ്വീകരിച്ചു')} />;
}

export function ReportCard({ report, role, language, pending, onPress }: { report: Report; role: Role; language: Language; pending: number; onPress: () => void }) {
  const icons: Record<string, IconName> = { flood: 'water-outline', medical: 'medkit-outline', fire: 'flame-outline', trapped: 'body-outline', supplies: 'cube-outline', other: 'alert-circle-outline' };
  return <Pressable accessibilityRole="button" accessibilityLabel={`${incidentName(report.incident_type, language)}, ${report.location.label}, ${friendly(report.delivery_state, language)}. ${word(language, 'Open details', 'വിവരങ്ങൾ തുറക്കുക')}`} onPress={onPress} style={({ pressed }) => [ui.card, { opacity: pressed ? 0.75 : 1 }]}>
    <View style={ui.between}><DeliveryBadge report={report} language={language} /><Icon name="arrow-forward-outline" color={colors.muted} size={18} /></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' }}><Icon name={icons[report.incident_type] || 'alert-circle-outline'} /></View><View style={{ flex: 1 }}><Text style={ui.h3}>{incidentName(report.incident_type, language)}</Text><Text style={ui.small}>{report.affected_count} {word(language, 'people affected', 'പേർക്ക് സഹായം വേണം')} · {dateLabel(report.created_at, language)}</Text></View></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}><Icon name="location-outline" size={17} color={colors.muted} /><Text style={[ui.subtitle, { flex: 1 }]}>{report.location.label}</Text></View>
    <View style={ui.row}>
      {report.source !== 'seed' && isSyntheticDescription(report.description) ? <Badge label={word(language, 'SYNTHETIC DEMO DATA', 'കൃത്രിമ ഡെമോ ഡാറ്റ')} /> : null}
      {role === 'coordinator' ? <Badge label={friendly(report.verification, language)} tone={report.verification === 'verified' ? 'success' : 'neutral'} /> : null}
      {report.urgency ? <Badge label={`${friendly(report.urgency, language)} ${word(language, 'urgency', 'അടിയന്തരം')}`} tone={report.urgency === 'critical' || report.urgency === 'high' ? 'danger' : 'neutral'} /> : null}
      {role === 'responder' ? <Badge label={friendly(report.mission_status, language)} tone="success" /> : null}
      {pending > 0 ? <Badge label={`${pending} ${word(language, 'local changes queued', 'മാറ്റങ്ങൾ ക്യൂവിൽ')}`} tone="warning" /> : null}
    </View>
  </Pressable>;
}

export function ReportsScreen({ role, language, reports, queue, onOpen, onCreate, onRelay, onSeed }: {
  role: Role; language: Language; reports: Report[]; queue: QueueItem[]; onOpen: (id: string) => void; onCreate: () => void; onRelay: () => void; onSeed: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const local = reports.filter(r => r.source !== 'seed');
  const pending = local.filter(r => r.delivery_state === 'pending').length;
  const received = local.filter(r => r.delivery_state !== 'pending').length;
  const shown = reports.filter(r => filter === 'all' || (filter === 'pending' ? r.delivery_state === 'pending' && r.source !== 'seed' : filter === 'unverified' ? r.verification === 'unverified' : r.delivery_state !== 'pending' && r.source !== 'seed'));
  const copy = roleInfo[role];
  return <View style={{ gap: 19 }}>
    <View style={{ gap: 7 }}><Text style={ui.eyebrow}>{word(language, 'PROJECT NEVERMORE · RESQ RELAY', 'പ്രോജക്റ്റ് നെവർമോർ · റെസ്ക്യൂ റിലേ')}</Text><Text style={ui.title}>{word(language, copy.workspace, copy.workspaceMl)}</Text><Text style={ui.subtitle}>{word(language, copy.description, copy.descriptionMl)}</Text></View>
    <View style={{ flexDirection: 'row', gap: 10 }}>{[
      { value: local.length, label: word(language, 'Reports', 'റിപ്പോർട്ടുകൾ'), color: colors.navy },
      { value: pending, label: word(language, 'Pending', 'കാത്തിരിപ്പ്'), color: colors.amber },
      { value: received, label: word(language, 'Server receipts', 'സെർവർ രസീതുകൾ'), color: colors.teal },
    ].map(s => <View key={s.label} style={[ui.card, { flex: 1, padding: 12, borderRadius: 15, gap: 3 }]}><Text style={{ color: s.color, fontSize: 27, fontWeight: '800' }}>{s.value}</Text><Text style={ui.small}>{s.label}</Text></View>)}</View>
    {(role === 'citizen' || role === 'volunteer') ? <View style={{ padding: 21, borderRadius: 22, backgroundColor: colors.navy, gap: 13 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#294750' }}><Icon name={role === 'citizen' ? 'alert-circle-outline' : 'people-outline'} color="#FFFFFF" size={26} /></View><Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '700', flex: 1 }}>{word(language, role === 'citizen' ? 'Need help right now?' : 'Record a community SOS', 'സഹായം ആവശ്യമുണ്ടോ?')}</Text></View>
      <Text style={{ color: '#D7E5E5', fontSize: 14, lineHeight: 21 }}>{word(language, 'Save an SOS even without internet. Delivery is confirmed only when a server receives it.', 'ഇന്റർനെറ്റ് ഇല്ലാതെയും SOS സേവ് ചെയ്യാം. സെർവറിൽ എത്തിയാൽ മാത്രം ഡെലിവറി സ്ഥിരീകരിക്കും.')}</Text>
      <Button title={word(language, role === 'citizen' ? 'Create an SOS' : 'Collect a report', 'SOS സൃഷ്ടിക്കുക')} tone="danger" icon="add-outline" onPress={onCreate} />
      {role === 'volunteer' ? <Button title={word(language, 'Scan a relay QR', 'റിലേ QR സ്കാൻ ചെയ്യുക')} tone="secondary" icon="qr-code-outline" onPress={onRelay} /> : null}
    </View> : <Notice title={word(language, 'People remain in control', 'തീരുമാനം മനുഷ്യരുടേത്')} text={word(language, role === 'coordinator' ? 'Urgency is selected by a coordinator with written reasons. Reports arrive unverified.' : 'Mission changes and notes are saved locally first. The last server-confirmed status stays visible until sync.', 'സ്ഥിരീകരിക്കാത്ത വിവരങ്ങൾ പരിശോധിച്ച ശേഷം പ്രവർത്തിക്കുക. ഓഫ്‌ലൈൻ മാറ്റങ്ങൾ സിങ്ക് വരെയുണ്ടാകും.')} />}
    <SectionHeading title={word(language, role === 'coordinator' ? 'Incident desk' : role === 'responder' ? 'Your assigned missions' : role === 'volunteer' ? 'Collected & relayed' : 'Your reports', 'റിപ്പോർട്ടുകൾ')} />
    <View style={ui.row}><Chip label={word(language, 'All', 'എല്ലാം')} active={filter === 'all'} onPress={() => setFilter('all')} /><Chip label={word(language, 'Pending', 'കാത്തിരിപ്പ്')} active={filter === 'pending'} onPress={() => setFilter('pending')} />{role === 'coordinator' ? <Chip label={word(language, 'Unverified', 'പരിശോധിക്കാത്തത്')} active={filter === 'unverified'} onPress={() => setFilter('unverified')} /> : <Chip label={word(language, 'Received', 'ലഭിച്ചു')} active={filter === 'received'} onPress={() => setFilter('received')} />}</View>
    {shown.length ? shown.map(r => <ReportCard key={r.id} report={r} role={role} language={language} pending={queue.filter(q => q.report_id === r.id).length} onPress={() => onOpen(r.id)} />) : <Empty title={word(language, 'No reports here yet', 'റിപ്പോർട്ടുകൾ ഇല്ല')} text={word(language, role === 'responder' ? 'Sync to receive missions assigned to this responder.' : 'Create a report or sync with your local demo backend.', 'പുതിയ റിപ്പോർട്ട് സൃഷ്ടിക്കുകയോ സെർവറുമായി സിങ്ക് ചെയ്യുകയോ ചെയ്യുക.')} />}
    <View style={[ui.card, { backgroundColor: '#EEF2F2', gap: 8 }]}><Text style={ui.eyebrow}>{word(language, 'HACKATHON SANDBOX', 'ഹാക്കത്തോൺ ഡെമോ')}</Text><Text style={ui.h3}>{word(language, 'Explore with synthetic examples', 'കൃത്രിമ ഉദാഹരണങ്ങൾ കാണുക')}</Text><Text style={ui.small}>{word(language, 'Examples are read-only, clearly marked, and never uploaded. Start the seeded backend for the full four-role walkthrough.', 'ഉദാഹരണങ്ങൾ അപ്‌ലോഡ് ചെയ്യില്ല. മുഴുവൻ ഡെമോയ്ക്ക് സെർവർ ആരംഭിക്കുക.')}</Text><Button title={word(language, 'Load sample reports', 'ഉദാഹരണങ്ങൾ ലോഡ് ചെയ്യുക')} tone="quiet" icon="flask-outline" onPress={onSeed} /></View>
  </View>;
}

