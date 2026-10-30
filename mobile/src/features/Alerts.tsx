import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import type { AlertSeverity, AuthorityAlert, Config } from '../core/types';
import * as service from '../core/services';
import { Button, Chip, Field, Icon, Notice } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, localizeMessage, word, type Language } from '../ui/words';
import { call112 } from './QuickSos';

const tone: Record<AlertSeverity, { bg: string; fg: string; icon: 'warning' | 'alert-circle' | 'information-circle' }> = {
  danger: { bg: colors.red, fg: '#FFFFFF', icon: 'warning' },
  warning: { bg: '#F3B53C', fg: '#2A1B00', icon: 'alert-circle' },
  info: { bg: '#2F6FB0', fg: '#FFFFFF', icon: 'information-circle' },
};

/** Official alert pop-up. Appears only when an unread alert arrives; once read it leaves the workspace. */
export function AlertPopup({ alert, language, onClose }: { alert: AuthorityAlert; language: Language; onClose: () => void }) {
  const t = tone[alert.severity];
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(8,20,26,0.72)', justifyContent: 'center', padding: 20 }}>
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ backgroundColor: colors.paper, borderRadius: 24, overflow: 'hidden', maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ backgroundColor: t.bg, paddingVertical: 18, paddingHorizontal: 20, gap: 8, alignItems: 'center' }}>
          <Icon name={t.icon} color={t.fg} size={44} />
          <Text style={{ color: t.fg, fontSize: 12, fontWeight: '900', letterSpacing: 1.6, textAlign: 'center' }}>{word(language, 'OFFICIAL ALERT', 'ഔദ്യോഗിക മുന്നറിയിപ്പ്')} · {word(language, { danger: 'DANGER', warning: 'WARNING', info: 'INFORMATION' }[alert.severity], { danger: 'അപകടം', warning: 'മുന്നറിയിപ്പ്', info: 'വിവരം' }[alert.severity])}</Text>
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: 20, gap: 10 }}>
          <Text style={{ color: colors.navy, fontSize: 22, fontWeight: '800', lineHeight: 28 }}>{alert.title}</Text>
          <Text style={{ color: colors.navy, fontSize: 16, lineHeight: 24 }}>{alert.body}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}><Icon name="location-outline" size={18} color={colors.muted} /><Text style={[ui.subtitle, { flex: 1 }]}>{alert.area}</Text></View>
          <Text style={ui.small}>{word(language, 'Issued', 'പ്രസിദ്ധീകരിച്ചത്')} {dateLabel(alert.created_at, language)} · {word(language, 'valid until', 'സാധുത')} {dateLabel(alert.expires_at, language)}</Text>
        </ScrollView>
        <View style={{ padding: 16, paddingTop: 4, gap: 10 }}>
          {alert.severity === 'danger' ? <Button title={word(language, 'Call 112', '112 വിളിക്കുക')} icon="call-outline" tone="danger" onPress={call112} /> : null}
          <Button title={word(language, 'I understand', 'മനസ്സിലായി')} icon="checkmark-outline" onPress={onClose} />
        </View>
      </View>
    </View>
  </Modal>;
}

/** Coordinator broadcast. Needs a server connection; every phone gets it on its next sync. */
export function AlertComposer({ language, config, onPublished }: { language: Language; config: Config; onPublished: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [area, setArea] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity>('warning');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function publish() {
    setError(''); setMessage('');
    if (title.trim().length < 3 || body.trim().length < 3 || !area.trim()) { setError(word(language, 'Add a title, message and area.', 'തലക്കെട്ട്, സന്ദേശം, പ്രദേശം എന്നിവ നൽകുക.')); return; }
    setBusy(true);
    try {
      await service.publishAlert(config.apiUrl, { title: title.trim(), body: body.trim(), area: area.trim(), severity, hours: 24 });
      setTitle(''); setBody(''); setArea('');
      setMessage(word(language, 'Alert published. Phones receive it on their next sync (every 20 seconds while open).', 'മുന്നറിയിപ്പ് പ്രസിദ്ധീകരിച്ചു. അടുത്ത സിങ്കിൽ എല്ലാ ഫോണുകളിലും എത്തും.'));
      await onPublished();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not publish alert.'); }
    finally { setBusy(false); }
  }
  return <View style={ui.card}>
    <View style={ui.row}><Icon name="megaphone-outline" /><Text style={ui.h3}>{word(language, 'Broadcast an alert', 'മുന്നറിയിപ്പ് പ്രക്ഷേപണം')}</Text></View>
    <Text style={ui.small}>{word(language, 'Reaches citizens, volunteers and responders on their next sync. Valid for 24 hours.', 'അടുത്ത സിങ്കിൽ എല്ലാവർക്കും ലഭിക്കും. 24 മണിക്കൂർ സാധുത.')}</Text>
    <View style={ui.row}>{(['danger', 'warning', 'info'] as const).map(value => <Chip key={value} label={word(language, { danger: 'Danger', warning: 'Warning', info: 'Info' }[value], { danger: 'അപകടം', warning: 'മുന്നറിയിപ്പ്', info: 'വിവരം' }[value])} active={severity === value} onPress={() => setSeverity(value)} />)}</View>
    <Field label={word(language, 'Title', 'തലക്കെട്ട്')} value={title} onChangeText={setTitle} maxLength={120} placeholder={word(language, 'Evacuate low-lying areas', 'താഴ്ന്ന പ്രദേശങ്ങളിൽ നിന്ന് ഒഴിയുക')} />
    <Field label={word(language, 'Message', 'സന്ദേശം')} value={body} onChangeText={setBody} multiline maxLength={1000} placeholder={word(language, 'Move to the nearest relief camp. Boats operate from the market junction.', 'അടുത്ത ദുരിതാശ്വാസ ക്യാമ്പിലേക്ക് മാറുക.')} />
    <Field label={word(language, 'Area', 'പ്രദേശം')} value={area} onChangeText={setArea} maxLength={160} placeholder={word(language, 'Aluva, Wards 3–7', 'ആലുവ, വാർഡ് 3–7')} />
    {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
    {message ? <Notice text={message} /> : null}
    <Button title={word(language, 'Publish alert', 'മുന്നറിയിപ്പ് പ്രസിദ്ധീകരിക്കുക')} icon="megaphone-outline" tone="danger" loading={busy} onPress={() => void publish()} />
  </View>;
}
