import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { QueueItem, Role } from '../core/types';
import * as service from '../core/services';
import { Badge, Button, Empty, Notice, SectionHeading } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, friendly, localizeMessage, word, type Language } from '../ui/words';

export function OutboxScreen({ role, language, queue, onRefresh, onSync, syncing, offline }: {
  role: Role; language: Language; queue: QueueItem[]; onRefresh: () => Promise<void>; onSync: () => void; syncing: boolean; offline: boolean;
}) {
  const [error, setError] = useState('');
  const labels: Record<string, string> = { 'report.create': word(language, 'Deliver SOS', 'SOS അയയ്ക്കുക'), 'report.review': word(language, 'Review report', 'റിപ്പോർട്ട് പരിശോധിക്കുക'), 'report.assign': word(language, 'Assign responder', 'രക്ഷാപ്രവർത്തകനെ നിയോഗിക്കുക'), 'mission.status': word(language, 'Update mission', 'ദൗത്യസ്ഥിതി മാറ്റുക'), 'mission.note': word(language, 'Send field note', 'ഫീൽഡ് നോട്ട് അയയ്ക്കുക') };
  async function retry(event: QueueItem) { try { setError(''); await service.retryEvent(role, event.id); await onRefresh(); onSync(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not retry action'); } }
  function discard(event: QueueItem) {
    Alert.alert(word(language, 'Remove this queued change?', 'ക്യൂവിലെ ഈ മാറ്റം ഒഴിവാക്കണോ?'), word(language, 'This removes the local queued action. It does not undo a change that already reached the server. Sync, inspect the latest report, and enter a fresh change if needed.', 'ഇത് ഈ ഉപകരണത്തിലെ ക്യൂവിലുള്ള മാറ്റം ഒഴിവാക്കും. സെർവറിൽ എത്തിയ മാറ്റം പഴയപടിയാക്കില്ല. സിങ്ക് ചെയ്ത് പുതിയ റിപ്പോർട്ട് പരിശോധിച്ച ശേഷം ആവശ്യമെങ്കിൽ പുതിയ മാറ്റം നൽകുക.'), [
      { text: word(language, 'Keep change', 'മാറ്റം നിലനിർത്തുക'), style: 'cancel' },
      { text: word(language, 'Remove change', 'മാറ്റം ഒഴിവാക്കുക'), style: 'destructive', onPress: () => { void (async () => { try { await service.discardEvent(role, event.id); await onRefresh(); } catch (e) { setError(e instanceof Error ? e.message : word(language, 'Could not remove change', 'മാറ്റം ഒഴിവാക്കാനായില്ല')); } })(); } },
    ]);
  }
  return <View style={{ gap: 18 }}>
    <SectionHeading title={word(language, 'Your durable outbox', 'സേവ് ചെയ്ത ഔട്ട്ബോക്സ്')} caption={word(language, 'Saved on this device, including across app restarts.', 'ആപ്പ് വീണ്ടും തുറന്നാലും ഈ ഉപകരണത്തിൽ ഉണ്ടാകും.')} />
    <Notice tone="warning" title={word(language, 'Pending means not delivered', 'കാത്തിരിപ്പ് എന്നത് ഡെലിവറി ആയിട്ടില്ല')} text={word(language, 'Network failures are retried while the app is open. Closing the app pauses sync. A QR handoff does not clear the outbox.', 'ആപ്പ് തുറന്നിരിക്കുമ്പോൾ വീണ്ടും ശ്രമിക്കും. ആപ്പ് അടച്ചാൽ സിങ്ക് നിൽക്കും. QR കൈമാറ്റം ഔട്ട്ബോക്സ് ഒഴിവാക്കില്ല.')} />
    <Button title={word(language, offline ? 'Offline practice is on' : 'Sync now', offline ? 'ഓഫ്‌ലൈൻ പരിശീലനം ഓൺ' : 'ഇപ്പോൾ സിങ്ക് ചെയ്യുക')} icon="sync-outline" disabled={offline} loading={syncing} onPress={onSync} />
    {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
    {queue.length ? queue.map(event => <View key={event.id} style={ui.card}>
      <View style={ui.between}><Text style={[ui.h3, { flex: 1 }]}>{labels[event.kind] || friendly(event.kind, language)}</Text><Badge label={friendly(event.status, language)} tone={event.status === 'blocked' || event.status === 'conflict' ? 'danger' : 'warning'} /></View>
      <Text style={ui.small}>{word(language, 'Report', 'റിപ്പോർട്ട്')} {event.report_id.slice(0, 8)} · {dateLabel(event.created_at, language)}</Text>
      {event.kind === 'mission.note' ? <Text style={ui.text}>{String(event.payload.text || '')}</Text> : event.kind === 'mission.status' ? <Text style={ui.text}>{word(language, 'Requested status', 'അഭ്യർത്ഥിച്ച സ്ഥിതി')}: {friendly(String(event.payload.status || ''), language)}</Text> : null}
      <Text style={ui.small}>{event.attempts} {word(language, 'sync attempts', 'സിങ്ക് ശ്രമങ്ങൾ')}{event.status === 'retry' ? ` · ${word(language, 'Retry after', 'വീണ്ടും ശ്രമിക്കാവുന്ന സമയം')} ${new Date(event.next_attempt_at).toLocaleTimeString(language === 'ml' ? 'ml-IN' : 'en-IN')}` : ''}</Text>
      {event.last_error ? <Notice tone={event.status === 'conflict' || event.status === 'blocked' ? 'error' : 'warning'} text={localizeMessage(language, event.last_error)} /> : null}
      {event.status === 'conflict' || event.status === 'blocked' ? <><Text style={ui.small}>{word(language, 'Sync to load the latest report. Inspect what changed before discarding this action and entering a fresh one. Conflicts are never silently overwritten.', 'ഏറ്റവും പുതിയ റിപ്പോർട്ട് സിങ്ക് ചെയ്ത് പരിശോധിക്കുക. മാറ്റം വീണ്ടും നൽകാം.')}</Text>{event.kind !== 'report.create' ? <Button title={word(language, 'Discard this queued change', 'ഈ മാറ്റം ഒഴിവാക്കുക')} tone="quiet" disabled={syncing} onPress={() => discard(event)} /> : <Text style={[ui.small, { color: colors.amber }]}>{word(language, 'This SOS stays pending. Check the error; create a corrected report if needed. It has not been sent successfully.', 'ഈ SOS കാത്തിരിപ്പിലാണ്. പിശക് പരിശോധിച്ച് പുതിയ റിപ്പോർട്ട് നൽകാം.')}</Text>}</> : <Button title={word(language, 'Retry now', 'വീണ്ടും ശ്രമിക്കുക')} icon="refresh-outline" tone="secondary" disabled={offline || syncing} onPress={() => void retry(event)} />}
    </View>) : <Empty title={word(language, 'No changes waiting', 'കാത്തിരിക്കുന്ന മാറ്റങ്ങൾ ഇല്ല')} text={word(language, 'New SOS reports and field updates will appear here until confirmed by the server.', 'സെർവർ സ്ഥിരീകരണം വരെയുള്ള റിപ്പോർട്ടുകളും മാറ്റങ്ങളും ഇവിടെ കാണാം.')} icon="checkmark-circle-outline" />}
  </View>;
}
