import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { AuthorityAlert } from '../core/types';
import * as service from '../core/services';
import { Chip, Icon, Notice, SectionHeading, type IconName } from '../ui/components';
import { colors, ui } from '../ui/theme';
import { dateLabel, word, type Language } from '../ui/words';

const contacts: { number: string; en: string; ml: string; icon: IconName }[] = [
  { number: '112', en: 'Emergency (all services)', ml: 'അടിയന്തര സേവനം', icon: 'call' },
  { number: '1077', en: 'District disaster control room', ml: 'ജില്ലാ ദുരന്ത നിയന്ത്രണ മുറി', icon: 'business' },
  { number: '1070', en: 'State emergency operations centre', ml: 'സംസ്ഥാന അടിയന്തര കേന്ദ്രം', icon: 'globe' },
  { number: '101', en: 'Fire & rescue', ml: 'ഫയർ & റെസ്ക്യൂ', icon: 'flame' },
  { number: '108', en: 'Ambulance', ml: 'ആംബുലൻസ്', icon: 'medkit' },
  { number: '100', en: 'Police', ml: 'പോലീസ്', icon: 'shield' },
];
const guides: Record<string, { en: string; ml: string; do: [string, string][]; avoid: [string, string][] }> = {
  flood: { en: 'Flood', ml: 'വെള്ളപ്പൊക്കം', do: [['Move to the highest floor or roof; take drinking water and a torch.', 'ഏറ്റവും ഉയർന്ന നിലയിലേക്ക് മാറുക; കുടിവെള്ളവും ടോർച്ചും എടുക്കുക.'], ['Switch off electricity at the main switch.', 'മെയിൻ സ്വിച്ചിൽ വൈദ്യുതി ഓഫ് ചെയ്യുക.'], ['Follow evacuation orders and go to the nearest relief camp.', 'ഒഴിപ്പിക്കൽ നിർദേശം പാലിച്ച് ക്യാമ്പിലേക്ക് പോകുക.']], avoid: [['Do not walk or drive through moving water.', 'ഒഴുകുന്ന വെള്ളത്തിലൂടെ നടക്കരുത്, വാഹനമോടിക്കരുത്.'], ['Do not touch fallen power lines.', 'വീണ വൈദ്യുതി കമ്പികൾ തൊടരുത്.']] },
  landslide: { en: 'Landslide', ml: 'ഉരുൾപൊട്ടൽ', do: [['Move away from slopes and streams during heavy rain.', 'കനത്ത മഴയിൽ ചരിവുകളിൽ നിന്നും അരുവികളിൽ നിന്നും മാറുക.'], ['Watch for cracks, tilting trees and muddy water.', 'വിള്ളലുകൾ, ചരിയുന്ന മരങ്ങൾ, കലങ്ങിയ വെള്ളം എന്നിവ ശ്രദ്ധിക്കുക.']], avoid: [['Do not return to the area until officials say it is safe.', 'അധികൃതർ പറയുന്നതുവരെ തിരികെ പോകരുത്.']] },
  fire: { en: 'Fire', ml: 'തീപിടിത്തം', do: [['Get out, stay low under smoke, close doors behind you.', 'പുറത്തിറങ്ങുക, പുകയ്ക്ക് താഴെ കുനിഞ്ഞു നീങ്ങുക.'], ['Call 101 from a safe place.', 'സുരക്ഷിത സ്ഥലത്തുനിന്ന് 101 വിളിക്കുക.']], avoid: [['Do not use lifts. Do not go back for belongings.', 'ലിഫ്റ്റ് ഉപയോഗിക്കരുത്. സാധനങ്ങൾക്കായി തിരികെ പോകരുത്.']] },
  earthquake: { en: 'Earthquake', ml: 'ഭൂകമ്പം', do: [['Drop, cover and hold on under a sturdy table.', 'ഉറപ്പുള്ള മേശയ്ക്കടിയിൽ കുനിഞ്ഞിരിക്കുക.'], ['After shaking stops, move to open ground.', 'കുലുക്കം നിന്നാൽ തുറസ്സായ സ്ഥലത്തേക്ക് മാറുക.']], avoid: [['Stay away from windows and damaged buildings.', 'ജനലുകളിൽ നിന്നും കേടായ കെട്ടിടങ്ങളിൽ നിന്നും മാറിനിൽക്കുക.']] },
  cyclone: { en: 'Cyclone', ml: 'ചുഴലിക്കാറ്റ്', do: [['Stay indoors in the strongest room; keep a radio and charged phone.', 'ഏറ്റവും ഉറപ്പുള്ള മുറിയിൽ തുടരുക; ഫോൺ ചാർജ് ചെയ്തു വയ്ക്കുക.'], ['Move to a cyclone shelter if told to evacuate.', 'നിർദേശം ലഭിച്ചാൽ ഷെൽട്ടറിലേക്ക് മാറുക.']], avoid: [['Do not go out during the calm "eye" of the storm.', 'കാറ്റ് ശമിക്കുന്ന ഇടവേളയിൽ പുറത്തിറങ്ങരുത്.']] },
  medical: { en: 'First aid', ml: 'പ്രഥമശുശ്രൂഷ', do: [['Bleeding: press firmly on the wound with a clean cloth.', 'രക്തസ്രാവം: വൃത്തിയുള്ള തുണികൊണ്ട് മുറിവിൽ അമർത്തുക.'], ['Not breathing: call 108 and start chest compressions (100–120 per minute).', 'ശ്വാസമില്ലെങ്കിൽ: 108 വിളിച്ച് നെഞ്ചമർത്തൽ തുടങ്ങുക.'], ['Drowning: lay on the side once breathing.', 'മുങ്ങിയവർ: ശ്വസിച്ചു തുടങ്ങിയാൽ ചരിച്ചു കിടത്തുക.']], avoid: [['Do not move someone with a suspected spine injury unless in danger.', 'നട്ടെല്ലിന് പരിക്ക് സംശയിക്കുന്നവരെ അനാവശ്യമായി നീക്കരുത്.']] },
};
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
