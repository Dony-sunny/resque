import React, { useMemo, useRef, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import type { Report, Role } from '../core/types';
import * as service from '../core/services';
import { Button, Chip, Empty, Field, Notice, SectionHeading } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { incidentName, localizeMessage, word, type Language } from '../ui/words';

export function RelayScreen({ role, language, reports, onImported, initialReportId }: {
  role: Role; language: Language; reports: Report[]; onImported: () => Promise<void>; initialReportId?: string;
}) {
  const { width } = useWindowDimensions();
  const qrSize = Math.max(160, Math.min(240, width - 112));
  const eligible = reports.filter(r => r.source !== 'seed');
  const [selected, setSelected] = useState(initialReportId || eligible[0]?.id || '');
  const report = eligible.find(r => r.id === selected) || eligible[0];
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ingesting = useRef(false);
  const qr = useMemo(() => { try { return { data: report ? service.exportRelay(report) : '', error: '' }; } catch (e) { return { data: '', error: e instanceof Error ? e.message : 'QR unavailable' }; } }, [report]);
  async function scan() {
    setError(''); setBusy(true);
    try {
      const p = permission?.granted ? permission : await requestPermission();
      if (!p.granted) { setError(word(language, 'Camera permission was not granted. Use the paste option below, or enable the camera in Android app settings.', 'ക്യാമറ അനുമതി ലഭിച്ചില്ല. താഴെ പേസ്റ്റ് ചെയ്യാം, അല്ലെങ്കിൽ Android ആപ്പ് ക്രമീകരണത്തിൽ ക്യാമറ അനുമതി നൽകുക.')); return; }
      setCamera(true);
    } catch (e) { setError(e instanceof Error ? e.message : word(language, 'Camera could not start. Use the paste option below.', 'ക്യാമറ തുറക്കാനായില്ല. താഴെ പേസ്റ്റ് ചെയ്യാം.')); }
    finally { setBusy(false); }
  }
  async function ingest(value: string) {
    if (ingesting.current) return;
    ingesting.current = true; setCamera(false); setBusy(true); setError(''); setMessage('');
    try {
      const result = await service.importRelay(role, value);
      await onImported();
      setMessage(word(language, result.imported ? 'Report copied to this device. It is still pending delivery to the server.' : 'This report is already on this device. No duplicate was added.', result.imported ? 'റിപ്പോർട്ട് ഈ ഉപകരണത്തിൽ ലഭിച്ചു. സെർവറിലേക്കുള്ള ഡെലിവറി കാത്തിരിക്കുന്നു.' : 'ഈ റിപ്പോർട്ട് നേരത്തേ ഉണ്ട്. ഡ്യൂപ്ലിക്കേറ്റ് ചേർത്തിട്ടില്ല.'));
      setText(''); setSelected(result.report.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import this QR.'); }
    finally { ingesting.current = false; setBusy(false); }
  }
  return <View style={{ gap: 19 }}>
    <SectionHeading title={word(language, 'Carry a report forward', 'റിപ്പോർട്ട് കൈമാറുക')} caption={word(language, 'A physical QR handoff works without internet.', 'QR കൈമാറ്റത്തിന് ഇന്റർനെറ്റ് ആവശ്യമില്ല.')} />
    <Notice tone="warning" title={word(language, 'Handoff is not delivery', 'കൈമാറ്റം ഡെലിവറി അല്ല')} text={word(language, 'Scanning copies a report between nearby devices. A volunteer must later sync with the backend. The original citizen can sync later to check receipt.', 'സ്കാൻ ചെയ്യുമ്പോൾ റിപ്പോർട്ട് പകർത്തും. സന്നദ്ധ പ്രവർത്തകൻ പിന്നീട് സെർവറുമായി സിങ്ക് ചെയ്യണം.')} />
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Show one report', 'ഒരു റിപ്പോർട്ട് കാണിക്കുക')}</Text>
      {eligible.length ? <><View style={ui.row}>{eligible.map(r => <Chip key={r.id} label={`${incidentName(r.incident_type, language)} · ${r.id.slice(0, 6)}`} active={r.id === report?.id} onPress={() => setSelected(r.id)} />)}</View>
        {qr.data ? <><View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: '#FFFFFF', borderRadius: 15 }} accessibilityLabel={word(language, 'Report relay QR code', 'റിപ്പോർട്ട് കൈമാറ്റ QR കോഡ്')}><QRCode value={qr.data} size={qrSize} ecl="M" quietZone={12} /></View><Text style={[ui.small, { textAlign: 'center', color: colors.navy }]}>{report?.location.label}</Text><Text style={ui.small}>{word(language, 'This QR contains incident details and location. Show it only to a trusted volunteer. It is unverified information, not proof of identity.', 'ഈ QR-ൽ സംഭവവിവരങ്ങളും സ്ഥലവുമുണ്ട്. വിശ്വസ്തരായ സന്നദ്ധ പ്രവർത്തകർക്ക് മാത്രം കാണിക്കുക.')}</Text></> : <Notice tone="error" text={localizeMessage(language, qr.error)} />}
      </> : <Empty title={word(language, 'No report to share', 'കൈമാറാൻ റിപ്പോർട്ട് ഇല്ല')} text={word(language, 'Create or collect a real demo report first. Synthetic examples cannot be relayed.', 'ആദ്യം റിപ്പോർട്ട് സൃഷ്ടിക്കുക. കൃത്രിമ ഉദാഹരണങ്ങൾ കൈമാറില്ല.')} icon="qr-code-outline" />}
    </View>
    {role === 'volunteer' ? <View style={ui.card}><Text style={ui.h3}>{word(language, 'Receive a relay', 'റിലേ സ്വീകരിക്കുക')}</Text><Text style={ui.subtitle}>{word(language, 'One QR, one report. Repeated scans are safe.', 'ഒരു QR, ഒരു റിപ്പോർട്ട്. ആവർത്തിച്ച് സ്കാൻ ചെയ്താൽ ഡ്യൂപ്ലിക്കേറ്റ് വരില്ല.')}</Text>
      {camera ? <><View style={{ height: 310, overflow: 'hidden', borderRadius: 16 }}><CameraView style={{ flex: 1 }} onMountError={({ message }) => { setCamera(false); setError(word(language, 'Camera could not start. Use the paste option below. Details: ', 'ക്യാമറ തുറക്കാനായില്ല. താഴെ പേസ്റ്റ് ചെയ്യാം. വിശദാംശം: ') + message); }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { setCamera(false); void ingest(data); }} /><View pointerEvents="none" style={{ position: 'absolute', top: 50, bottom: 50, left: 35, right: 35, borderRadius: 16, borderWidth: 3, borderColor: '#FFFFFF' }} /></View><Button title={word(language, 'Close scanner', 'സ്കാനർ അടയ്ക്കുക')} tone="quiet" onPress={() => setCamera(false)} /></> : <Button title={word(language, 'Open QR scanner', 'QR സ്കാനർ തുറക്കുക')} icon="scan-outline" tone="secondary" loading={busy} onPress={() => void scan()} />}
      <View style={ui.divider} /><Field label={word(language, 'Or paste the relay payload', 'അല്ലെങ്കിൽ റിലേ ഡാറ്റ പേസ്റ്റ് ചെയ്യുക')} value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} multiline maxLength={6000} placeholder='{"version":1,...}' /><Button title={word(language, 'Import to this device', 'ഈ ഉപകരണത്തിലേക്ക് ചേർക്കുക')} icon="download-outline" disabled={!text.trim()} loading={busy} onPress={() => void ingest(text)} />
    </View> : <Notice text={word(language, 'A community volunteer can scan this QR using the volunteer workspace. Citizens share reports; volunteers collect and relay them.', 'സന്നദ്ധ പ്രവർത്തകന്റെ വർക്ക്‌സ്‌പേസിൽ ഈ QR സ്കാൻ ചെയ്യാം.')} />}
    {message ? <Notice title={word(language, 'Relay recorded', 'റിലേ രേഖപ്പെടുത്തി')} text={message} /> : null}
    {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
    <Text style={ui.small}>{word(language, 'No Bluetooth mesh, automatic peer discovery, SMS sending, or background radio transmission is implemented.', 'Bluetooth mesh, SMS, സ്വയം റേഡിയോ കൈമാറ്റം എന്നിവ നടപ്പാക്കിയിട്ടില്ല.')}</Text>
  </View>;
}
