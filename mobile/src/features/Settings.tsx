import React, { useEffect, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import type { Config, ConnectionStatus, Role } from '../core/types';
import { Button, Chip, Field, Icon, Notice, SectionHeading } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, localizeMessage, word, type Language } from '../ui/words';
import { roleInfo } from './registry';

export function SettingsScreen({ role, config, language, onRole, onConfig, syncing, queuedCount, connection }: {
  role: Role; config: Config; language: Language; onRole: (role: Role) => void;
  onConfig: (value: Partial<Config>) => Promise<void>; syncing: boolean; queuedCount: number; connection?: ConnectionStatus;
}) {
  const [url, setUrl] = useState(config.apiUrl);
  const [accessKey, setAccessKey] = useState(config.demoAccessKey || '');
  const [smsNumber, setSmsNumber] = useState(config.smsNumber || '');
  const [smsSaved, setSmsSaved] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUrl(config.apiUrl); setAccessKey(config.demoAccessKey || ''); }, [config.apiUrl, config.demoAccessKey]);
  async function change(value: Partial<Config>) {
    if (busy) return;
    setError(''); setBusy(true);
    try { await onConfig(value); }
    catch (e) { setError(e instanceof Error ? e.message : word(language, 'Could not save settings.', 'ക്രമീകരണം സേവ് ചെയ്യാനായില്ല.')); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const previous = config.apiUrl;
    try {
      await onConfig({ apiUrl: url, demoAccessKey: accessKey.trim() });
      setMessage(word(language, `Server checked and address saved. All four roles use this server. Same-server addresses share reports; a different server keeps a separate workspace. Previous address: ${previous}.`, `സെർവർ പരിശോധിച്ച് വിലാസം സേവ് ചെയ്തു. നാല് ഉപയോക്തൃവിഭാഗങ്ങളും ഇതേ സെർവറാണ് ഉപയോഗിക്കുന്നത്. ഒരേ സെർവറിന്റെ വിലാസങ്ങളിൽ റിപ്പോർട്ടുകൾ നിലനിൽക്കും; മറ്റൊരു സെർവറിന് പ്രത്യേക വർക്ക്‌സ്‌പേസ് ഉണ്ട്. മുൻ വിലാസം: ${previous}.`));
    } catch (e) { setError(e instanceof Error ? e.message : word(language, 'Could not connect. The previous address and saved reports have been kept.', 'ബന്ധിപ്പിക്കാനായില്ല. പഴയ വിലാസവും സേവ് ചെയ്ത റിപ്പോർട്ടുകളും നിലനിൽക്കും.')); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 18 }}>
    <View style={{ alignItems: 'center', gap: 6 }}><Image source={require('../../assets/logo-full.png')} style={{ width: 150, height: 155 }} resizeMode="contain" accessible accessibilityLabel="RESQ" /><Text style={[ui.small, { fontWeight: '700', letterSpacing: 1 }]}>COLLECT FASTER. RESPOND SMARTER.</Text></View>
    <SectionHeading title={word(language, 'Profile, role and settings', 'പ്രൊഫൈൽ, ക്രമീകരണം')} caption={word(language, 'Demo workspaces, language, and connectivity.', 'ഡെമോ വർക്ക്‌സ്‌പേസ്, ഭാഷ, കണക്ഷൻ.')} />
    <Notice title={word(language, 'Hackathon demo access', 'ഹാക്കത്തോൺ ഡെമോ പ്രവേശനം')} text={word(language, 'Role switching uses separate demo accounts. The backend must explicitly enable demo authentication. A shared access key can protect the judging demo. Production account registration is not included.', 'വ്യത്യസ്ത ഡെമോ അക്കൗണ്ടുകളാണ് ഉപയോഗിക്കുന്നത്. സെർവറിൽ ഡെമോ പ്രവേശനം ഓൺ ആയിരിക്കണം. ജഡ്ജിമാരുടെ ഡെമോ ഒരു ആക്സസ് കീ ഉപയോഗിച്ച് സംരക്ഷിക്കാം. യഥാർത്ഥ അക്കൗണ്ട് രജിസ്ട്രേഷൻ ഉൾപ്പെടുത്തിയിട്ടില്ല.')} />
    <View style={ui.card}>
      <Text style={ui.h3}>{word(language, 'Choose a workspace', 'വർക്ക്‌സ്‌പേസ് തിരഞ്ഞെടുക്കുക')}</Text>
      {(Object.keys(roleInfo) as Role[]).map(key => <View key={key} style={{ gap: 5 }}>
        <Chip label={word(language, roleInfo[key].title, roleInfo[key].ml)} icon={roleInfo[key].icon} active={role === key} onPress={() => { if (!busy) onRole(key); }} />
        <Text style={[ui.small, { paddingHorizontal: 2, marginBottom: 7 }]}>{word(language, roleInfo[key].description, roleInfo[key].descriptionMl)}</Text>
      </View>)}
      <Text style={ui.small}>{word(language, 'Each role keeps its own local reports and outbox. Permissions are checked by the server.', 'ഓരോ ഉപയോക്തൃവിഭാഗത്തിനും പ്രത്യേക റിപ്പോർട്ടുകളും ഔട്ട്ബോക്സും ഉണ്ട്. സെർവർ അനുമതി പരിശോധിക്കും.')}</Text>
    </View>
    <View style={ui.card}>
      <Text style={ui.h3}>{word(language, 'Language', 'ഭാഷ')}</Text>
      <View style={ui.row}><Chip label="English" active={language === 'en'} onPress={() => void change({ language: 'en' })} /><Chip label="മലയാളം" active={language === 'ml'} onPress={() => void change({ language: 'ml' })} /></View>
      <Text style={ui.small}>{word(language, 'Critical forms, delivery states, review, mission actions, and recovery guidance are available in both languages. User-written reports, server audit details, and unfamiliar diagnostics retain their original text.', 'പ്രധാന ഫോമുകളും ഡെലിവറി നിലകളും പരിശോധനയും ദൗത്യ പ്രവർത്തനങ്ങളും പിശക് പരിഹാര നിർദ്ദേശങ്ങളും രണ്ട് ഭാഷകളിലുണ്ട്. വ്യക്തികൾ എഴുതിയ റിപ്പോർട്ടുകളും സെർവർ ഓഡിറ്റ് വിശദാംശങ്ങളും ചില സാങ്കേതിക സന്ദേശങ്ങളും യഥാർത്ഥ ഭാഷയിൽ തുടരും.')}</Text>
    </View>
    <View style={ui.card}>
      <View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.h3}>{word(language, 'Offline practice', 'ഓഫ്‌ലൈൻ പരിശീലനം')}</Text><Text style={ui.small}>{word(language, 'Pause new sync attempts.', 'പുതിയ സിങ്ക് ശ്രമങ്ങൾ നിർത്തുക.')}</Text></View>
        <Switch accessibilityLabel={word(language, 'Offline practice', 'ഓഫ്‌ലൈൻ പരിശീലനം')} disabled={syncing || busy} value={config.forceOffline} onValueChange={value => void change({ forceOffline: value })} trackColor={{ false: '#ACBEB7', true: colors.teal }} thumbColor="#FFFFFF" />
      </View>
      <Text style={ui.small}>{word(language, syncing ? 'A sync request is in progress. This control is available when it finishes.' : 'Local reports, QR handoff, and notes continue to work. New sync attempts pause while this is on.', syncing ? 'സിങ്ക് നടക്കുന്നു. പൂർത്തിയായ ശേഷം ഈ ക്രമീകരണം മാറ്റാം.' : 'ലോക്കൽ റിപ്പോർട്ടുകളും QR കൈമാറ്റവും നോട്ടുകളും പ്രവർത്തിക്കും. പുതിയ സിങ്ക് ശ്രമങ്ങൾ നിൽക്കും.')}</Text>
    </View>
    <View style={ui.card}>
      <View style={ui.row}><Icon name="chatbox-ellipses-outline" /><Text style={ui.h3}>{word(language, 'SMS fallback number', 'SMS ഫാൾബാക്ക് നമ്പർ')}</Text></View>
      <Field label={word(language, 'Control room SMS gateway number', 'കൺട്രോൾ റൂം SMS നമ്പർ')} value={smsNumber} onChangeText={value => { setSmsNumber(value); setSmsSaved(''); }} keyboardType="phone-pad" maxLength={20} placeholder="+91 98XXXXXXXX" hint={word(language, 'Pending SOS reports can be sent to this number as one coded SMS when there is signal but no internet. The gateway replies with a confirmation SMS.', 'ഇന്റർനെറ്റ് ഇല്ലാത്തപ്പോൾ SOS ഈ നമ്പറിലേക്ക് SMS ആയി അയയ്ക്കാം.')} />
      <Button title={word(language, 'Save SMS number', 'SMS നമ്പർ സേവ് ചെയ്യുക')} icon="save-outline" tone="secondary" disabled={busy || smsNumber.trim() === (config.smsNumber || '')} onPress={() => { void change({ smsNumber: smsNumber.trim() }).then(() => setSmsSaved(word(language, 'SMS number saved.', 'SMS നമ്പർ സേവ് ചെയ്തു.'))); }} />
      {smsSaved ? <Text style={ui.small}>{smsSaved}</Text> : null}
    </View>
    <View style={ui.card}>
      <View style={ui.row}><Icon name="server-outline" /><Text style={ui.h3}>{word(language, 'Connect to your backend', 'സെർവറുമായി ബന്ധിപ്പിക്കുക')}</Text></View>
      <Field label={word(language, 'Backend address', 'സെർവർ വിലാസം')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!syncing && !busy} placeholder="https://your-demo-server.example" hint={word(language, 'Use the same reachable address on every phone. localhost refers to the phone itself. Installed APKs use HTTPS unless a specific local demo host was configured at build time.', 'എല്ലാ ഫോണിലും ലഭ്യമായ ഒരേ വിലാസം നൽകുക. localhost എന്നത് ഫോൺ തന്നെയാണ്. ഇൻസ്റ്റാൾ ചെയ്ത APK-യിൽ HTTPS വിലാസം ഉപയോഗിക്കുക.')} />
      <Field label={word(language, 'Demo access key', 'ഡെമോ ആക്സസ് കീ')} value={accessKey} onChangeText={setAccessKey} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!syncing && !busy} placeholder={word(language, 'Required only if enabled on the server', 'സെർവറിൽ സജ്ജമാക്കിയിട്ടുണ്ടെങ്കിൽ മാത്രം')} hint={word(language, 'Stored in Android secure storage. Ask your demo operator for the shared key; it is never included in report QR codes.', 'Android സുരക്ഷിത സംഭരണത്തിലാണ് സൂക്ഷിക്കുന്നത്. ഡെമോ നടത്തുന്ന വ്യക്തിയിൽ നിന്ന് കീ നേടുക. റിപ്പോർട്ട് QR-യിൽ കീ ഉൾപ്പെടില്ല.')} />
      <Notice title={word(language, `${queuedCount} queued change(s) on this workspace`, `ഈ വർക്ക്‌സ്‌പേസിൽ ${queuedCount} മാറ്റങ്ങൾ കാത്തിരിക്കുന്നു`)} text={word(language, 'Saving checks the server before changing anything. A first connection carries locally saved pending reports forward. Addresses with the same server identity share a workspace; different servers remain separate.', 'സേവ് ചെയ്യുമ്പോൾ മാറ്റത്തിന് മുമ്പ് സെർവർ പരിശോധിക്കും. ആദ്യ കണക്ഷനിൽ ലോക്കലായി സേവ് ചെയ്ത കാത്തിരിക്കുന്ന റിപ്പോർട്ടുകൾ നിലനിൽക്കും. ഒരേ സെർവർ തിരിച്ചറിയലുള്ള വിലാസങ്ങൾ ഒരേ വർക്ക്‌സ്‌പേസ് ഉപയോഗിക്കും; വ്യത്യസ്ത സെർവറുകൾ വേർതിരിച്ചാണ്.')} />
      <Button title={word(language, 'Check and save server', 'സെർവർ പരിശോധിച്ച് സേവ് ചെയ്യുക')} icon="save-outline" loading={busy} disabled={syncing} onPress={() => void save()} />
      <Text selectable style={ui.small}>{word(language, 'Current address', 'നിലവിലെ വിലാസം')}: {config.apiUrl}</Text>
      {connection?.last_attempt_at ? <Text style={ui.small}>{word(language, 'Last server check', 'അവസാനം സെർവർ പരിശോധിച്ചത്')}: {dateLabel(connection.last_attempt_at, language)}</Text> : null}
      {connection?.last_success_at ? <Text style={ui.small}>{word(language, 'Last successful contact', 'അവസാനം വിജയകരമായി ബന്ധിപ്പിച്ചത്')}: {dateLabel(connection.last_success_at, language)}</Text> : null}
      {connection?.backend_id ? <Text selectable style={ui.small}>{word(language, 'Server identity', 'സെർവർ തിരിച്ചറിയൽ')}: {connection.backend_id.slice(0, 8)}</Text> : null}
      {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
      {message ? <Notice text={message} /> : null}
      <Text style={ui.small}>{word(language, 'Start the seeded backend and configure the same address and access key for every phone. The setup guide includes LAN, HTTPS, and persistent deployment instructions.', 'ഡെമോ സെർവർ ആരംഭിച്ച് എല്ലാ ഫോണിലും ഒരേ വിലാസവും ആക്സസ് കീയും നൽകുക. സജ്ജീകരണ നിർദ്ദേശങ്ങളിൽ LAN, HTTPS, സ്ഥിരം സംഭരണം എന്നിവ വിശദീകരിച്ചിട്ടുണ്ട്.')}</Text>
    </View>
    <View style={ui.card}>
      <Text style={ui.eyebrow}>RESQ RELAY · HACKATHON</Text><Text style={ui.h3}>{word(language, 'Designed to grow', 'വളരാൻ രൂപകൽപ്പന ചെയ്തത്')}</Text>
      <Text style={ui.small}>{word(language, 'Offline reports, physical QR relay, durable sync, review, assignments, field notes, and audit history are implemented. Production enrollment and real rescue dispatch integration remain future work.', 'ഓഫ്‌ലൈൻ റിപ്പോർട്ടുകൾ, QR കൈമാറ്റം, സിങ്ക്, പരിശോധന, നിയോഗം, ഫീൽഡ് നോട്ടുകൾ, ഓഡിറ്റ് എന്നിവ നടപ്പാക്കിയിട്ടുണ്ട്. യഥാർത്ഥ അക്കൗണ്ട് രജിസ്ട്രേഷനും രക്ഷാസേനയുമായുള്ള ബന്ധവും ഭാവിയിൽ ചേർക്കേണ്ടതാണ്.')}</Text>
      <Text style={ui.small}>{word(language, 'Also built: one-tap SOS with Call 112, SMS fallback with reply confirmation, SOS progress tracking, GPS → network → last-known location fallback, an offline map with help points, official alerts, and a live web dashboard at /dashboard.', 'ഒറ്റ ടാപ്പ് SOS, 112, SMS ഫാൾബാക്ക്, SOS പുരോഗതി, ലൊക്കേഷൻ ഫാൾബാക്ക്, ഓഫ്‌ലൈൻ ഭൂപടം, ഔദ്യോഗിക മുന്നറിയിപ്പുകൾ, വെബ് ഡാഷ്ബോർഡ് എന്നിവയും ഉണ്ട്.')}</Text>
      <Text style={ui.small}>{word(language, 'No Bluetooth mesh or unsupported offline transport is simulated.', 'Bluetooth mesh അല്ലെങ്കിൽ പിന്തുണയില്ലാത്ത ഓഫ്‌ലൈൻ കൈമാറ്റം നടിക്കുന്നില്ല.')}</Text>
    </View>
  </View>;
}
