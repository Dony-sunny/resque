import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { AuthorityAlert } from '../core/types';
import * as service from '../core/services';
import { Chip, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, word, type Language } from '../ui/words';

import { contacts, guides } from '../core/guidance';
const kit: [string, string][] = [['Drinking water for 3 days', '3 ദിവസത്തേക്ക് കുടിവെള്ളം'], ['Dry food and baby food', 'ഉണക്ക ഭക്ഷണം, കുഞ്ഞുങ്ങൾക്കുള്ള ഭക്ഷണം'], ['Torch, spare batteries, power bank', 'ടോർച്ച്, ബാറ്ററി, പവർ ബാങ്ക്'], ['Medicines and first-aid kit', 'മരുന്നുകൾ, പ്രഥമശുശ്രൂഷ കിറ്റ്'], ['ID cards and documents in a waterproof bag', 'തിരിച്ചറിയൽ രേഖകൾ വെള്ളം കയറാത്ത ബാഗിൽ'], ['Whistle to signal rescuers', 'രക്ഷാപ്രവർത്തകരെ അറിയിക്കാൻ വിസിൽ'], ['Rope, knife, rain cover', 'കയർ, കത്തി, മഴക്കോട്ട്']];
const drill: [string, string][] = [['Agree on a family meeting point and an out-of-district contact.', 'കുടുംബത്തിന് ഒരു ഒത്തുചേരൽ സ്ഥലവും ജില്ലയ്ക്ക് പുറത്തുള്ള ഒരു ബന്ധവും തീരുമാനിക്കുക.'], ['Find the nearest relief camp on the Map tab and walk the route once.', 'മാപ്പിൽ അടുത്ത ക്യാമ്പ് കണ്ടെത്തി വഴി ഒരിക്കൽ നടന്നു നോക്കുക.'], ['Practise sending an SOS with Offline practice switched on in Settings.', 'ക്രമീകരണത്തിൽ ഓഫ്‌ലൈൻ പരിശീലനം ഓണാക്കി SOS അയച്ചു പരിശീലിക്കുക.'], ['Teach children to dial 112 and say their address.', 'കുട്ടികളെ 112 വിളിച്ച് വിലാസം പറയാൻ പഠിപ്പിക്കുക.']];

/** Preparedness and capacity building (SAKSHAM-inspired): contacts, guides, kit checklist, drills, alerts. */
export function SafetyScreen({ language, alerts }: { language: Language; alerts: AuthorityAlert[] }) {
  const [hazard, setHazard] = useState('flood');
  const [packed, setPacked] = useState<number[]>([]);
  useEffect(() => { void service.loadKitChecklist().then(setPacked).catch(() => undefined); }, []);
  function toggle(index: number) {
    const next = packed.includes(index) ? packed.filter(i => i !== index) : [...packed, index];
    setPacked(next); void service.saveKitChecklist(next).catch(() => undefined);
  }
  const guide = guides[hazard];
  return <View style={{ gap: 16 }}>
    <SectionHeading title={word(language, 'Safety & preparedness', 'സുരക്ഷയും തയ്യാറെടുപ്പും')} caption={word(language, 'Works offline. Tap a number to call.', 'ഓഫ്‌ലൈനിലും പ്രവർത്തിക്കും. വിളിക്കാൻ നമ്പറിൽ ടാപ്പ് ചെയ്യുക.')} />
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Disaster alerts', 'ദുരന്ത മുന്നറിയിപ്പുകൾ')}</Text>
      {alerts.length ? alerts.map(alert => <View key={alert.id} style={{ borderLeftWidth: 4, borderLeftColor: alert.severity === 'danger' ? colors.red : alert.severity === 'warning' ? '#F3B53C' : '#2F6FB0', paddingLeft: 10, gap: 3 }}>
        <Text style={[ui.text, { fontWeight: '800' }]}>{alert.title}</Text><Text style={ui.small}>{alert.body}</Text><Text style={ui.small}>📍 {alert.area} · {dateLabel(alert.created_at, language)}</Text>
      </View>) : <Text style={ui.small}>{word(language, 'No active official alerts. New alerts pop up automatically.', 'സജീവ മുന്നറിയിപ്പുകൾ ഇല്ല. പുതിയവ സ്വയം കാണിക്കും.')}</Text>}
    </View>
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Emergency contacts', 'അടിയന്തര നമ്പറുകൾ')}</Text>
      {contacts.map(c => <Pressable key={c.number} accessibilityRole="button" accessibilityLabel={`${word(language, 'Call', 'വിളിക്കുക')} ${c.number}`} onPress={() => void Linking.openURL(`tel:${c.number}`)} style={({ pressed }) => [ui.between, { paddingVertical: 8, opacity: pressed ? 0.6 : 1 }]}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 }}><View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.redLight, alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} color={colors.red} size={20} /></View><Text style={[ui.text, { flex: 1 }]}>{word(language, c.en, c.ml)}</Text></View>
        <Text style={{ color: colors.red, fontSize: 20, fontWeight: '900' }}>{c.number}</Text>
      </Pressable>)}
    </View>
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'What to do', 'എന്ത് ചെയ്യണം')}</Text>
      <View style={ui.row}>{Object.entries(guides).map(([key, g]) => <Chip key={key} label={word(language, g.en, g.ml)} active={hazard === key} onPress={() => setHazard(key)} />)}</View>
      {guide.do.map(([en, ml], i) => <Text key={`d${i}`} style={ui.text}>✅ {word(language, en, ml)}</Text>)}
      {guide.avoid.map(([en, ml], i) => <Text key={`a${i}`} style={ui.text}>⛔ {word(language, en, ml)}</Text>)}
    </View>
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Emergency kit checklist', 'അടിയന്തര കിറ്റ് പട്ടിക')} · {packed.length}/{kit.length}</Text>
      {kit.map(([en, ml], i) => <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: packed.includes(i) }} onPress={() => toggle(i)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 5 }}>
        <Icon name={packed.includes(i) ? 'checkbox' : 'square-outline'} color={packed.includes(i) ? colors.teal : colors.muted} /><Text style={[ui.text, { flex: 1 }]}>{word(language, en, ml)}</Text>
      </Pressable>)}
    </View>
    <View style={ui.card}><Text style={ui.h3}>{word(language, 'Family drill (training)', 'കുടുംബ പരിശീലനം')}</Text>
      {drill.map(([en, ml], i) => <Text key={i} style={ui.text}>{i + 1}. {word(language, en, ml)}</Text>)}
    </View>
    <Notice text={word(language, 'Guidance is general preparedness advice. Always follow instructions from KSDMA, the district administration and rescue teams.', 'ഇത് പൊതുവായ നിർദേശങ്ങളാണ്. KSDMA, ജില്ലാ ഭരണകൂടം എന്നിവയുടെ നിർദേശങ്ങൾ പാലിക്കുക.')} />
  </View>;
}
