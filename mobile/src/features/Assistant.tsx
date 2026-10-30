import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { quickQuestions, type AssistantAction, type AssistantReply } from '../core/assistant';
import type { Role } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Chip, Icon } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { word, type Language } from '../ui/words';
import type { Route } from './registry';
import { call112 } from './QuickSos';

type Message = { id: number; from: 'me' | 'bot'; text: string; reply?: AssistantReply; failed?: boolean };
const modeLabel = { ai: 'AI answer · RESQ data for your role', guide: 'Safety guide · RESQ server data', offline: 'Offline Safety Guide' };

/** RESQ Assistant: help and guidance. It can suggest where to go in the app, but never changes records. */
export function AssistantScreen({ role, language, reportId, online, onNavigate }: { role: Role; language: Language; reportId?: string; online: boolean; onNavigate: (route: Route) => void }) {
  const victim = role === 'citizen' || role === 'volunteer';
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: 'bot', text: word(language, 'Hi, I am RESQ Assistant. Ask about safety, shelters or your request. In danger now? Use SOS or call 112 — you do not need to chat first.', 'ഞാൻ RESQ അസിസ്റ്റന്റ്. അപകടത്തിലാണെങ്കിൽ ഉടൻ SOS അമർത്തുക അല്ലെങ്കിൽ 112 വിളിക്കുക.') }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const next = useRef(1);
  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setText(''); setBusy(true);
    setMessages(list => [...list, { id: next.current++, from: 'me', text: q }]);
    try {
      const reply = await service.askAssistant(role, q, reportId);
      setMessages(list => [...list, { id: next.current++, from: 'bot', text: reply.answer, reply }]);
    } catch {
      setMessages(list => [...list, { id: next.current++, from: 'bot', text: word(language, 'Could not answer right now.', 'ഇപ്പോൾ മറുപടി നൽകാനായില്ല.'), failed: true }]);
    } finally { setBusy(false); }
  }
  function act(a: AssistantAction) { if (a.call) void Linking.openURL(`tel:${a.call}`); else if (a.route) onNavigate(a.route as Route); }
  const lastQuestion = [...messages].reverse().find(m => m.from === 'me')?.text;
  return <View style={{ gap: 12 }}>
    <View style={ui.between}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}><Icon name="chatbubbles-outline" color="#FFFFFF" /></View>
        <View style={{ flex: 1 }}><Text style={ui.h2}>RESQ Assistant</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? colors.green : colors.orange }} /><Text style={ui.small}>{online ? word(language, 'Online · guidance only, cannot dispatch help', 'ഓൺലൈൻ · മാർഗനിർദേശം മാത്രം') : word(language, 'Offline Safety Guide', 'ഓഫ്‌ലൈൻ സുരക്ഷാ ഗൈഡ്')}</Text></View></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Close assistant', 'അസിസ്റ്റന്റ് അടയ്ക്കുക')} onPress={() => onNavigate('home')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color={colors.muted} size={26} /></Pressable>
    </View>
    {victim ? <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button style={{ flex: 2 }} tone="danger" icon="alert-circle" title={word(language, 'SOS now', 'ഇപ്പോൾ SOS')} onPress={() => onNavigate('create')} />
      <Button style={{ flex: 1 }} tone="secondary" icon="call" title="112" onPress={call112} />
    </View> : null}
    <View style={{ gap: 10 }}>
      {messages.map(m => <View key={m.id} accessibilityLiveRegion={m.from === 'bot' ? 'polite' : 'none'} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 6 }}>
        <View style={{ backgroundColor: m.from === 'me' ? colors.teal : colors.paper, borderWidth: m.from === 'me' ? 0 : 1, borderColor: colors.line, borderRadius: 16, borderBottomRightRadius: m.from === 'me' ? 4 : 16, borderBottomLeftRadius: m.from === 'me' ? 16 : 4, padding: 12 }}>
          <Text style={{ color: m.from === 'me' ? '#FFFFFF' : colors.navy, fontSize: 15, lineHeight: 22 }}>{m.text}</Text>
        </View>
        {m.reply ? <View style={ui.row}><Badge label={modeLabel[m.reply.mode]} tone={m.reply.mode === 'ai' ? 'neutral' : 'warning'} />{m.reply.note ? <Text style={ui.small}>{m.reply.note}</Text> : null}</View> : null}
        {m.reply?.actions.length ? <View style={ui.row}>{m.reply.actions.map(a => <Chip key={a.label} label={a.label} icon={a.call ? 'call-outline' : 'arrow-forward-outline'} onPress={() => act(a)} />)}</View> : null}
        {m.failed && lastQuestion ? <Button title={word(language, 'Retry', 'വീണ്ടും ശ്രമിക്കുക')} tone="quiet" icon="refresh-outline" onPress={() => void send(lastQuestion)} /> : null}
      </View>)}
      {busy ? <View accessibilityLiveRegion="polite" style={[ui.row, { paddingLeft: 4 }]}><ActivityIndicator color={colors.teal} /><Text style={ui.small}>{word(language, 'RESQ Assistant is typing…', 'മറുപടി തയ്യാറാക്കുന്നു…')}</Text></View> : null}
    </View>
    <View style={ui.row}>{quickQuestions[victim ? 'victim' : 'staff'].map(q => <Chip key={q} label={q} onPress={() => void send(q)} />)}</View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <TextInput value={text} onChangeText={setText} placeholder={word(language, 'Type a question', 'ചോദ്യം ടൈപ്പ് ചെയ്യുക')} placeholderTextColor="#6B7A8C" maxLength={500} multiline
        accessibilityLabel={word(language, 'Question for RESQ Assistant', 'ചോദ്യം')} style={[ui.input, { flex: 1, maxHeight: 110 }]} onSubmitEditing={() => void send(text)} />
      <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Send question', 'അയയ്ക്കുക')} disabled={busy || !text.trim()} onPress={() => void send(text)}
        style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.45 : 1 }}><Icon name="send" color="#FFFFFF" /></Pressable>
    </View>
    <Text style={ui.small}>{word(language, 'Answers can be wrong. Official instructions and responders come first. The assistant never sends, assigns or changes anything.', 'ഉത്തരങ്ങൾ തെറ്റാകാം. ഔദ്യോഗിക നിർദേശങ്ങൾ പാലിക്കുക.')}</Text>
  </View>;
}
