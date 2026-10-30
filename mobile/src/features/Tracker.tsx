import React, { useState } from 'react';
import { Text, View } from 'react-native';
import * as SMS from 'expo-sms';
import type { Config, Report } from '../core/types';
import { encodeSmsReport, smsSegments } from '../core/sms';
import { Button, Icon, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { localizeMessage, word, type Language } from '../ui/words';
import { call112 } from './QuickSos';

const steps = [
  { key: 'saved', en: 'Saved on this phone (pending sync)', ml: 'ഫോണിൽ സേവ് ചെയ്തു (സിങ്ക് കാത്തിരിക്കുന്നു)' },
  { key: 'delivered', en: 'Submitted to the control room', ml: 'കൺട്രോൾ റൂമിൽ എത്തി' },
  { key: 'acknowledged', en: 'Acknowledged by officials', ml: 'ഉദ്യോഗസ്ഥർ സ്ഥിരീകരിച്ചു' },
  { key: 'assigned', en: 'Rescue team assigned', ml: 'രക്ഷാസംഘത്തെ നിയോഗിച്ചു' },
  { key: 'en_route', en: 'Team en route', ml: 'സംഘം വരുന്നു' },
  { key: 'on_scene', en: 'Team on site', ml: 'സംഘം സ്ഥലത്തെത്തി' },
  { key: 'in_progress', en: 'Rescue in progress', ml: 'രക്ഷാപ്രവർത്തനം നടക്കുന്നു' },
  { key: 'completed', en: 'Resolved', ml: 'പരിഹരിച്ചു' },
];

/** How far a report has progressed, as one index into `steps`. */
export function progressIndex(report: Report): number {
  const mission = ({ unassigned: 0, assigned: 3, accepted: 3, en_route: 4, on_scene: 5, in_progress: 6, completed: 7 } as Record<string, number>)[report.mission_status] ?? 0;
  const delivery = report.delivery_state === 'pending' ? 0 : report.delivery_state === 'delivered' ? 1 : 2;
  return Math.max(mission, delivery);
}
export function progressLabel(report: Report, language: Language): string {
  const step = steps[progressIndex(report)];
  return word(language, step.en, step.ml);
}

/** Victim-facing acknowledgement: every stage the SOS has reached, updated on each sync. */
export function DeliveryTracker({ report, language }: { report: Report; language: Language }) {
  const current = progressIndex(report);
  return <View style={ui.card}>
    <Text style={ui.h3}>{word(language, 'Where is my SOS?', 'എന്റെ SOS എവിടെ?')}</Text>
    {steps.map((step, index) => {
      const done = index <= current;
      return <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.teal : colors.line }}>
          {done ? <Icon name="checkmark" size={16} color="#FFFFFF" /> : <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800' }}>{index + 1}</Text>}
        </View>
        <Text style={[ui.text, { flex: 1, color: done ? colors.navy : colors.muted, fontWeight: index === current ? '800' : '400' }]}>{word(language, step.en, step.ml)}</Text>
      </View>;
    })}
    {report.team ? <Text style={[ui.text, { fontWeight: '700' }]}>{word(language, 'Team', 'സംഘം')}: {report.team.name}</Text> : null}
    {(report.relief || []).map(row => <View key={row.id} style={{ backgroundColor: '#F1F4F3', borderRadius: 10, padding: 10, gap: 3 }}>
      <Text style={ui.label}>{word(language, 'Relief supplies', 'ദുരിതാശ്വാസ സാധനങ്ങൾ')}: {reliefLabel(row.status, language)}</Text>
      <Text style={ui.small}>{Object.entries(row.items).map(([key, qty]) => `${key.replace(/_/g, ' ')} × ${qty}`).join(' · ')}</Text>
    </View>)}
    <Text style={ui.small}>{word(language, 'Updates arrive whenever this phone syncs, including through a volunteer who carried your QR. If you are in danger now, call 112.', 'ഫോൺ സിങ്ക് ചെയ്യുമ്പോൾ പുതിയ വിവരം ലഭിക്കും. അപകടത്തിലാണെങ്കിൽ ഉടൻ 112 വിളിക്കുക.')}</Text>
  </View>;
}

export function reliefLabel(status: string, language: Language) {
  return word(language, ({ requested: 'Requested', approved: 'Approved', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled' } as Record<string, string>)[status] || status,
    ({ requested: 'അഭ്യർത്ഥിച്ചു', approved: 'അംഗീകരിച്ചു', packed: 'പായ്ക്ക് ചെയ്തു', dispatched: 'അയച്ചു', delivered: 'എത്തിച്ചു', cancelled: 'റദ്ദാക്കി' } as Record<string, string>)[status] || status);
}

/** SMS fallback: opens the phone's SMS app with the coded SOS addressed to the gateway number. */
export function SmsFallback({ report, language, config }: { report: Report; language: Language; config: Config }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  let text = '', encodeError = '';
  try { text = encodeSmsReport(report); } catch (e) { encodeError = e instanceof Error ? e.message : 'SMS unavailable'; }
  async function send() {
    setError(''); setMessage('');
    try {
      const number = (config.smsNumber || '').trim();
      if (!number) throw new Error(word(language, 'Add the control room SMS number in Settings first.', 'ആദ്യം ക്രമീകരണത്തിൽ കൺട്രോൾ റൂം SMS നമ്പർ നൽകുക.'));
      if (!(await SMS.isAvailableAsync())) throw new Error(word(language, 'This device cannot send SMS. Use QR relay or call 112.', 'ഈ ഉപകരണത്തിൽ SMS ഇല്ല. QR കൈമാറ്റം ഉപയോഗിക്കുക അല്ലെങ്കിൽ 112 വിളിക്കുക.'));
      const { result } = await SMS.sendSMSAsync([number], text);
      setMessage(result === 'sent'
        ? word(language, 'SMS sent. The control room replies with a confirmation SMS. The app still syncs this report when data returns.', 'SMS അയച്ചു. കൺട്രോൾ റൂം സ്ഥിരീകരണ SMS അയയ്ക്കും.')
        : word(language, 'Your SMS app opened. Press send there. Delivery is confirmed by the reply SMS or the next sync.', 'SMS ആപ്പ് തുറന്നു. അവിടെ അയയ്ക്കുക. മറുപടി SMS വഴി സ്ഥിരീകരിക്കും.'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open SMS.'); }
  }
  return <View style={ui.card}>
    <View style={ui.row}><Icon name="chatbox-ellipses-outline" /><Text style={ui.h3}>{word(language, 'No internet? Send by SMS', 'ഇന്റർനെറ്റ് ഇല്ലേ? SMS ആയി അയയ്ക്കുക')}</Text></View>
    <Text style={ui.small}>{word(language, 'Needs only mobile signal and a SIM. The full report is coded into one text message to the control room gateway.', 'മൊബൈൽ സിഗ്നലും SIM-ഉം മതി. റിപ്പോർട്ട് മുഴുവൻ ഒരു SMS ആയി കൺട്രോൾ റൂമിലേക്ക് പോകും.')}</Text>
    {encodeError ? <Notice tone="error" text={localizeMessage(language, encodeError)} /> : <>
      <Text selectable numberOfLines={3} style={[ui.small, { fontFamily: 'monospace', backgroundColor: '#F1F4F3', padding: 8, borderRadius: 8 }]}>{text}</Text>
      <Text style={ui.small}>{text.length} {word(language, 'characters', 'അക്ഷരങ്ങൾ')} · {smsSegments(text)} SMS {word(language, 'part(s)', 'ഭാഗം')} · {word(language, 'to', 'നമ്പർ')} {config.smsNumber || word(language, 'number not set', 'നമ്പർ നൽകിയിട്ടില്ല')}</Text>
      <Button title={word(language, 'Send SOS by SMS', 'SOS SMS ആയി അയയ്ക്കുക')} icon="send-outline" tone="secondary" onPress={() => void send()} />
    </>}
    <Button title={word(language, 'Call 112 now', 'ഇപ്പോൾ 112 വിളിക്കുക')} icon="call-outline" tone="danger" onPress={call112} />
    {error ? <Notice tone="error" text={error} /> : null}
    {message ? <Notice text={message} /> : null}
  </View>;
}
