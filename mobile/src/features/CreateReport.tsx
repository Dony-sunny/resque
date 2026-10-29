import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import type { Assistance, IncidentType, Report, Role } from '../core/types';
import { describeFix, locateWithFallback, stepLabel } from './location';
import * as service from '../core/services';
import { Button, Chip, Field, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { incidentName, localizeMessage, word, type Language } from '../ui/words';

const hazards: { key: IncidentType; icon: IconName }[] = [
  { key: 'flood', icon: 'water-outline' }, { key: 'landslide', icon: 'trending-down-outline' }, { key: 'fire', icon: 'flame-outline' },
  { key: 'earthquake', icon: 'pulse-outline' }, { key: 'cyclone', icon: 'thunderstorm-outline' }, { key: 'medical', icon: 'medkit-outline' },
  { key: 'trapped', icon: 'body-outline' }, { key: 'other', icon: 'alert-circle-outline' },
];
const needs: { key: Assistance; en: string; ml: string; icon: IconName }[] = [
  { key: 'rescue', en: 'Rescue', ml: 'രക്ഷാപ്രവർത്തനം', icon: 'boat-outline' }, { key: 'ambulance', en: 'Ambulance', ml: 'ആംബുലൻസ്', icon: 'car-outline' },
  { key: 'medical', en: 'Medical help', ml: 'വൈദ്യസഹായം', icon: 'medkit-outline' }, { key: 'food', en: 'Food', ml: 'ഭക്ഷണം', icon: 'fast-food-outline' },
  { key: 'water', en: 'Water', ml: 'വെള്ളം', icon: 'water-outline' }, { key: 'medicine', en: 'Medicine', ml: 'മരുന്ന്', icon: 'bandage-outline' },
  { key: 'shelter', en: 'Shelter', ml: 'അഭയം', icon: 'home-outline' },
];

/** Large -/+ counter that needs no keyboard. */
export function Stepper({ label, value, onChange, min = 0, language }: { label: string; value: number; onChange: (n: number) => void; min?: number; language: Language }) {
  const button = (delta: number, icon: IconName) => <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${delta > 0 ? word(language, 'increase', 'കൂട്ടുക') : word(language, 'decrease', 'കുറയ്ക്കുക')}`}
    onPress={() => onChange(Math.max(min, Math.min(10000, value + delta)))} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}><Icon name={icon} size={26} /></Pressable>;
  return <View style={[ui.between, { paddingVertical: 4 }]}>
    <Text style={[ui.text, { flex: 1, fontWeight: '600' }]}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{button(-1, 'remove')}<Text style={{ minWidth: 40, textAlign: 'center', fontSize: 22, fontWeight: '800', color: colors.navy }}>{value}</Text>{button(1, 'add')}</View>
  </View>;
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{n}</Text></View>
    <Text style={ui.h3}>{title}</Text>
  </View>;
}

/** Progressive SOS: hazard → location → people → send. Everything else is optional. */
export function CreateReportScreen({ role, language, onCreated }: { role: Role; language: Language; onCreated: (report: Report) => Promise<void> }) {
  const [type, setType] = useState<IncidentType>('flood');
  const [affected, setAffected] = useState(1);
  const [trapped, setTrapped] = useState(0);
  const [injured, setInjured] = useState(0);
  const [children, setChildren] = useState(0);
  const [elderly, setElderly] = useState(0);
  const [disabled, setDisabled] = useState(0);
  const [lifeThreat, setLifeThreat] = useState(false);
  const [assistance, setAssistance] = useState<Assistance[]>(['rescue']);
  const [description, setDescription] = useState('');
  const [label, setLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [more, setMore] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const savedReportRef = useRef<Report | undefined>(undefined);
  const [error, setError] = useState('');
  async function locate() {
    setGpsBusy(true); setGpsMessage('');
    try {
      const fix = await locateWithFallback(step => setGpsMessage(stepLabel(step, language)));
      if (!fix) { setGpsMessage(word(language, 'No GPS, network or saved location is available. Describe the place below: building, road, ward, nearby shop or temple.', 'GPS, നെറ്റ്‌വർക്ക്, സൂക്ഷിച്ച സ്ഥലം ഒന്നും ലഭ്യമല്ല. കെട്ടിടം, റോഡ്, വാർഡ്, സമീപത്തെ കട/ക്ഷേത്രം എന്നിവ എഴുതുക.')); return; }
      setLatitude(String(fix.latitude)); setLongitude(String(fix.longitude));
      setLabel(current => current.trim() ? current : `Near ${describeFix(fix, 'en')}`);
      setGpsMessage(word(language, `Location found: ${describeFix(fix, language)}. Add a landmark if you can.`, `സ്ഥലം: ${describeFix(fix, language)}. കഴിയുമെങ്കിൽ അടയാളം നൽകുക.`));
    } catch (e) { setGpsMessage(e instanceof Error ? e.message : word(language, 'Location unavailable. Enter location manually.', 'സ്ഥലം ലഭ്യമല്ല. നേരിട്ട് നൽകുക.')); }
    finally { setGpsBusy(false); }
  }
  // Start locating straight away so the victim does not wait for it at the end.
  useEffect(() => { void locate(); }, []);
  function toggleNeed(key: Assistance) { setAssistance(list => list.includes(key) ? list.filter(k => k !== key) : [...list, key]); }
  async function save() {
    if (savingRef.current) return;
    setError('');
    if (!label.trim()) { setError(word(language, 'Add where you are (address or landmark) so the team can find you.', 'നിങ്ങളെ കണ്ടെത്താൻ വിലാസമോ അടയാളമോ നൽകുക.')); return; }
    const lat = latitude.trim() ? Number(latitude) : null, lon = longitude.trim() ? Number(longitude) : null;
    if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lon !== null && (!Number.isFinite(lon) || Math.abs(lon) > 180))) { setError(word(language, 'Enter both valid coordinates, or leave both blank.', 'ശരിയായ രണ്ട് കോഓർഡിനേറ്റുകളും നൽകുക, അല്ലെങ്കിൽ രണ്ടും ഒഴിവാക്കുക.')); return; }
    const people = Math.max(affected, trapped, injured, 1);
    const summary = `${incidentName(type, 'en')} SOS: ${people} people` + (trapped ? `, ${trapped} trapped` : '') + (injured ? `, ${injured} injured` : '') + (lifeThreat ? ', LIFE THREAT' : '');
    savingRef.current = true; setSaving(true);
    try {
      const report = savedReportRef.current || await service.createReport(role, {
        incident_type: type, affected_count: people, description: (description.trim() || summary).slice(0, 500),
        location: { label: label.trim(), latitude: lat, longitude: lon },
        details: { people: { trapped, injured, children, elderly, disabled }, life_threat: lifeThreat, assistance },
      });
      savedReportRef.current = report;
      await onCreated(report);
    } catch (e) { setError(savedReportRef.current ? word(language, 'Your SOS was saved, but the screen could not refresh. Retry to open the same report; another SOS will not be created.', 'SOS സേവ് ചെയ്തു. വീണ്ടും ശ്രമിച്ചാൽ ഇതേ റിപ്പോർട്ട് തുറക്കും.') : e instanceof Error ? e.message : word(language, 'Could not save report. Try again.', 'റിപ്പോർട്ട് സേവ് ചെയ്യാനായില്ല.')); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <View style={{ gap: 16 }}>
    <SectionHeading title={word(language, role === 'volunteer' ? 'Collect an SOS' : 'Report an emergency', 'അടിയന്തരാവസ്ഥ റിപ്പോർട്ട് ചെയ്യുക')} caption={word(language, 'Three quick steps. Works without internet: the SOS is saved and sent when a connection returns.', 'മൂന്ന് ചെറിയ ഘട്ടങ്ങൾ. ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും സേവ് ചെയ്ത് പിന്നീട് അയയ്ക്കും.')} />
    <View style={ui.card}><StepTitle n={1} title={word(language, 'What is happening?', 'എന്താണ് സംഭവിക്കുന്നത്?')} />
      <View style={ui.row}>{hazards.map(h => <Chip key={h.key} label={incidentName(h.key, language)} icon={h.icon} active={type === h.key} onPress={() => setType(h.key)} />)}</View>
    </View>
    <View style={ui.card}><StepTitle n={2} title={word(language, 'Where are you?', 'നിങ്ങൾ എവിടെയാണ്?')} />
      <Button title={word(language, 'Find my location again', 'സ്ഥലം വീണ്ടും കണ്ടെത്തുക')} tone="secondary" icon="locate-outline" loading={gpsBusy} onPress={() => void locate()} />
      {gpsMessage ? <Text accessibilityLiveRegion="polite" style={ui.small}>{localizeMessage(language, gpsMessage)}</Text> : null}
      <Field label={word(language, 'Address or nearby landmark', 'വിലാസം / സമീപത്തെ അടയാളം')} value={label} onChangeText={setLabel} maxLength={160} placeholder={word(language, 'House name, road, ward, nearby temple or shop', 'വീട്ടുപേര്, റോഡ്, വാർഡ്, സമീപത്തെ ക്ഷേത്രം/കട')} />
    </View>
    <View style={ui.card}><StepTitle n={3} title={word(language, 'Who is in danger?', 'ആരാണ് അപകടത്തിൽ?')} />
      <Stepper label={word(language, 'People affected', 'ബാധിതർ')} value={affected} onChange={setAffected} min={1} language={language} />
      <Stepper label={word(language, 'Trapped', 'കുടുങ്ങിയവർ')} value={trapped} onChange={setTrapped} language={language} />
      <Stepper label={word(language, 'Injured', 'പരിക്കേറ്റവർ')} value={injured} onChange={setInjured} language={language} />
      <View style={[ui.between, { backgroundColor: lifeThreat ? colors.redLight : '#F4F6F5', borderRadius: 12, padding: 12 }]}>
        <Text style={[ui.text, { flex: 1, fontWeight: '700', color: lifeThreat ? colors.red : colors.navy }]}>{word(language, 'Someone\'s life is in immediate danger', 'ആരുടെയെങ്കിലും ജീവൻ അപകടത്തിലാണ്')}</Text>
        <Switch value={lifeThreat} onValueChange={setLifeThreat} accessibilityLabel={word(language, 'Immediate life threat', 'ജീവന് ഭീഷണി')} trackColor={{ false: '#ACBEB7', true: colors.red }} thumbColor="#FFFFFF" />
      </View>
    </View>
    {error ? <Notice tone="error" text={localizeMessage(language, error)} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={word(language, 'Send SOS', 'SOS അയയ്ക്കുക')} disabled={saving} onPress={() => void save()}
      style={({ pressed }) => ({ minHeight: 76, borderRadius: 20, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, opacity: pressed || saving ? 0.75 : 1 })}>
      <Icon name="alert-circle" color="#FFFFFF" size={30} /><Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 1 }}>{saving ? word(language, 'SAVING…', 'സേവ് ചെയ്യുന്നു…') : word(language, 'SEND SOS', 'SOS അയയ്ക്കുക')}</Text>
    </Pressable>
    <Button title={word(language, more ? 'Hide optional details' : 'Add more details (optional)', more ? 'അധിക വിവരങ്ങൾ മറയ്ക്കുക' : 'കൂടുതൽ വിവരങ്ങൾ (ഐച്ഛികം)')} icon={more ? 'chevron-up-outline' : 'chevron-down-outline'} tone="quiet" onPress={() => setMore(!more)} />
    {more ? <View style={ui.card}>
      <Stepper label={word(language, 'Children', 'കുട്ടികൾ')} value={children} onChange={setChildren} language={language} />
      <Stepper label={word(language, 'Elderly people', 'വയോജനങ്ങൾ')} value={elderly} onChange={setElderly} language={language} />
      <Stepper label={word(language, 'People with disabilities', 'ഭിന്നശേഷിക്കാർ')} value={disabled} onChange={setDisabled} language={language} />
      <Text style={ui.label}>{word(language, 'Help needed', 'ആവശ്യമായ സഹായം')}</Text>
      <View style={ui.row}>{needs.map(n => <Chip key={n.key} label={word(language, n.en, n.ml)} icon={n.icon} active={assistance.includes(n.key)} onPress={() => toggleNeed(n.key)} />)}</View>
      <Field label={word(language, 'Short description', 'ചെറിയ വിവരണം')} value={description} onChangeText={setDescription} multiline maxLength={300} placeholder={word(language, 'Example: water at first floor, two elderly upstairs', 'ഉദാ: ഒന്നാം നിലയിൽ വെള്ളം, രണ്ട് വയോജനങ്ങൾ മുകളിൽ')} hint={`${description.length}/300`} />
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label={word(language, 'Latitude', 'അക്ഷാംശം')} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="9.5916" /></View><View style={{ flex: 1 }}><Field label={word(language, 'Longitude', 'രേഖാംശം')} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="76.5222" /></View></View>
      <Text style={ui.small}>{word(language, 'Photos are not uploaded in this version; describe what you see instead.', 'ഈ പതിപ്പിൽ ഫോട്ടോ അപ്‌ലോഡ് ഇല്ല; കാണുന്നത് വിവരിക്കുക.')}</Text>
    </View> : null}
    <Text style={[ui.small, { textAlign: 'center' }]}>{word(language, 'If life is at risk, also call 112. This prototype cannot guarantee rescue.', 'ജീവന് അപകടമുണ്ടെങ്കിൽ 112-ലും വിളിക്കുക.')}</Text>
  </View>;
}
