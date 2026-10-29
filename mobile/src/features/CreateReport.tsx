import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { Report, Role } from '../core/types';
import * as service from '../core/services';
import { Button, Chip, Field, Notice, SectionHeading, type IconName } from '../ui/components';
import { ui } from '../ui/theme';
import { incidentName, incidentNames, localizeMessage, word, type Language } from '../ui/words';

export function CreateReportScreen({ role, language, onCreated }: { role: Role; language: Language; onCreated: (report: Report) => Promise<void> }) {
  const [type, setType] = useState<keyof typeof incidentNames>('flood');
  const [count, setCount] = useState('1');
  const [description, setDescription] = useState('');
  const [label, setLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const savedReportRef = useRef<Report | undefined>(undefined);
  const [error, setError] = useState('');
  async function locate() {
    setGpsBusy(true); setGpsMessage('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error(word(language, 'Location permission was not granted. Enter a landmark or address below.', 'ലൊക്കേഷൻ അനുമതി ലഭിച്ചില്ല. വിലാസം താഴെ നൽകുക.'));
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error(word(language, 'GPS is taking too long. You can enter your location manually.', 'GPS വൈകുന്നു. സ്ഥലം നേരിട്ട് നൽകാം.'))), 15000); }),
      ]);
      setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6));
      setGpsMessage(word(language, `GPS captured (about ${Math.round(position.coords.accuracy ?? 0)} m accuracy). Add a landmark to help responders.`, 'GPS ലഭിച്ചു. രക്ഷാപ്രവർത്തകർക്കായി സമീപത്തെ അടയാളവും നൽകുക.'));
    } catch (e) { setGpsMessage(e instanceof Error ? e.message : word(language, 'GPS unavailable. Enter location manually.', 'GPS ലഭ്യമല്ല. സ്ഥലം നേരിട്ട് നൽകുക.')); }
    finally { if (timeout) clearTimeout(timeout); setGpsBusy(false); }
  }
  async function save() {
    if (savingRef.current) return;
    setError('');
    const n = Number(count);
    if (!/^\d+$/.test(count) || !Number.isInteger(n) || n < 1 || n > 10000) { setError(word(language, 'Affected count must be a whole number between 1 and 10,000.', 'ആളുകളുടെ എണ്ണം 1 മുതൽ 10,000 വരെ നൽകുക.')); return; }
    if (!label.trim()) { setError(word(language, 'Add an address or landmark so someone can find you.', 'നിങ്ങളെ കണ്ടെത്താൻ വിലാസമോ അടയാളമോ നൽകുക.')); return; }
    if (!description.trim()) { setError(word(language, 'Describe what help is needed.', 'ആവശ്യമായ സഹായം വിവരിക്കുക.')); return; }
    const lat = latitude.trim() ? Number(latitude) : null;
    const lon = longitude.trim() ? Number(longitude) : null;
    if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))) { setError(word(language, 'Enter both valid coordinates, or leave both blank.', 'ശരിയായ രണ്ട് കോഓർഡിനേറ്റുകളും നൽകുക, അല്ലെങ്കിൽ രണ്ടും ഒഴിവാക്കുക.')); return; }
    savingRef.current = true; setSaving(true);
    try {
      const report = savedReportRef.current || await service.createReport(role, { incident_type: type, affected_count: n, description: description.trim(), location: { label: label.trim(), latitude: lat, longitude: lon } });
      savedReportRef.current = report;
      await onCreated(report);
    } catch (e) { setError(savedReportRef.current ? word(language, 'Your SOS was saved, but the screen could not refresh. Retry to open the same report; another SOS will not be created.', 'SOS സേവ് ചെയ്തു. സ്ക്രീൻ പുതുക്കാനായില്ല. വീണ്ടും ശ്രമിച്ചാൽ ഇതേ റിപ്പോർട്ട് തുറക്കും; പുതിയ SOS ഉണ്ടാകില്ല.') : e instanceof Error ? e.message : word(language, 'Could not save report. Try again.', 'റിപ്പോർട്ട് സേവ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക.')); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const icons: Record<keyof typeof incidentNames, IconName> = { flood: 'water-outline', medical: 'medkit-outline', fire: 'flame-outline', trapped: 'body-outline', supplies: 'cube-outline', other: 'alert-circle-outline' };
  return <View style={{ gap: 20 }}>
    <SectionHeading title={word(language, role === 'volunteer' ? 'Collect an SOS' : 'Create an SOS', 'SOS സൃഷ്ടിക്കുക')} caption={word(language, 'A few clear details can help a response team act.', 'സഹായത്തിനായി വ്യക്തമായ വിവരങ്ങൾ നൽകുക.')} />
    <Notice tone="warning" title={word(language, 'Saved locally first', 'ആദ്യം ഈ ഉപകരണത്തിൽ സേവ് ചെയ്യും')} text={word(language, 'An offline report has not reached a rescue team. Keep this device safe, sync when connected, or show its QR to a volunteer.', 'ഓഫ്‌ലൈൻ റിപ്പോർട്ട് രക്ഷാപ്രവർത്തകരിൽ എത്തിയിട്ടില്ല. കണക്ഷൻ കിട്ടുമ്പോൾ സിങ്ക് ചെയ്യുക അല്ലെങ്കിൽ സന്നദ്ധ പ്രവർത്തകന് QR കാണിക്കുക.')} />
    <View style={ui.card}><Text style={ui.label}>{word(language, 'What happened?', 'എന്താണ് സംഭവിച്ചത്?')}</Text><View style={ui.row}>{(Object.keys(incidentNames) as (keyof typeof incidentNames)[]).map(key => <Chip key={key} label={incidentName(key, language)} icon={icons[key]} active={type === key} onPress={() => setType(key)} />)}</View>
      <Field label={word(language, 'People affected', 'ബാധിതരുടെ എണ്ണം')} value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={5} hint={word(language, 'Whole number from 1 to 10,000.', '1 മുതൽ 10,000 വരെ പൂർണസംഖ്യ നൽകുക.')} />
      <Field label={word(language, 'What help is needed?', 'എന്ത് സഹായമാണ് വേണ്ടത്?')} value={description} onChangeText={setDescription} multiline maxLength={300} placeholder={word(language, 'Example: Two people on the first floor; water rising.', 'ഉദാ: രണ്ട് പേർ ഒന്നാം നിലയിൽ കുടുങ്ങി.')} hint={`${description.length}/300`} />
    </View>
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Where is help needed?', 'സഹായം വേണ്ട സ്ഥലം')}</Text><Button title={word(language, 'Use current GPS location', 'നിലവിലെ GPS സ്ഥലം ഉപയോഗിക്കുക')} tone="secondary" icon="locate-outline" loading={gpsBusy} onPress={() => void locate()} />{gpsMessage ? <Text accessibilityLiveRegion="polite" style={ui.small}>{localizeMessage(language, gpsMessage)}</Text> : null}
      <Field label={word(language, 'Address or nearby landmark', 'വിലാസം / സമീപത്തെ അടയാളം')} value={label} onChangeText={setLabel} maxLength={160} placeholder={word(language, 'Building, road, ward, village', 'കെട്ടിടം, റോഡ്, വാർഡ്, ഗ്രാമം')} hint={word(language, 'A manual location works without GPS or internet.', 'GPS ഇല്ലാതെയും സ്ഥലം നേരിട്ട് നൽകാം.')} />
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label={word(language, 'Latitude (optional)', 'അക്ഷാംശം')} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="9.9312" /></View><View style={{ flex: 1 }}><Field label={word(language, 'Longitude (optional)', 'രേഖാംശം')} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="76.2673" /></View></View>
    </View>
    {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
    <Button title={word(language, 'Save SOS on this device', 'ഈ ഉപകരണത്തിൽ SOS സേവ് ചെയ്യുക')} icon="save-outline" tone="danger" loading={saving} onPress={() => void save()} />
    <Text style={[ui.small, { textAlign: 'center' }]}>{word(language, 'This prototype is a reporting tool. It cannot guarantee rescue or replace local emergency services.', 'ഇത് ഒരു മാതൃകാ റിപ്പോർട്ടിംഗ് ആപ്പാണ്. രക്ഷാപ്രവർത്തനം ഉറപ്പുനൽകുന്നില്ല.')}</Text>
  </View>;
}
