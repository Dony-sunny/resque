import type { IconName } from '../ui/components';

/** Emergency numbers and hazard guidance shared by the Safety screen and the offline assistant. */
export const contacts: { number: string; en: string; ml: string; icon: IconName }[] = [
  { number: '112', en: 'Emergency (all services)', ml: 'അടിയന്തര സേവനം', icon: 'call' },
  { number: '1077', en: 'District disaster control room', ml: 'ജില്ലാ ദുരന്ത നിയന്ത്രണ മുറി', icon: 'business' },
  { number: '1070', en: 'State emergency operations centre', ml: 'സംസ്ഥാന അടിയന്തര കേന്ദ്രം', icon: 'globe' },
  { number: '101', en: 'Fire & rescue', ml: 'ഫയർ & റെസ്ക്യൂ', icon: 'flame' },
  { number: '108', en: 'Ambulance', ml: 'ആംബുലൻസ്', icon: 'medkit' },
  { number: '100', en: 'Police', ml: 'പോലീസ്', icon: 'shield' },
];
export const guides: Record<string, { en: string; ml: string; do: [string, string][]; avoid: [string, string][] }> = {
  flood: { en: 'Flood', ml: 'വെള്ളപ്പൊക്കം', do: [['Move to the highest floor or roof; take drinking water and a torch.', 'ഏറ്റവും ഉയർന്ന നിലയിലേക്ക് മാറുക; കുടിവെള്ളവും ടോർച്ചും എടുക്കുക.'], ['Switch off electricity at the main switch.', 'മെയിൻ സ്വിച്ചിൽ വൈദ്യുതി ഓഫ് ചെയ്യുക.'], ['Follow evacuation orders and go to the nearest relief camp.', 'ഒഴിപ്പിക്കൽ നിർദേശം പാലിച്ച് ക്യാമ്പിലേക്ക് പോകുക.']], avoid: [['Do not walk or drive through moving water.', 'ഒഴുകുന്ന വെള്ളത്തിലൂടെ നടക്കരുത്, വാഹനമോടിക്കരുത്.'], ['Do not touch fallen power lines.', 'വീണ വൈദ്യുതി കമ്പികൾ തൊടരുത്.']] },
  landslide: { en: 'Landslide', ml: 'ഉരുൾപൊട്ടൽ', do: [['Move away from slopes and streams during heavy rain.', 'കനത്ത മഴയിൽ ചരിവുകളിൽ നിന്നും അരുവികളിൽ നിന്നും മാറുക.'], ['Watch for cracks, tilting trees and muddy water.', 'വിള്ളലുകൾ, ചരിയുന്ന മരങ്ങൾ, കലങ്ങിയ വെള്ളം എന്നിവ ശ്രദ്ധിക്കുക.']], avoid: [['Do not return to the area until officials say it is safe.', 'അധികൃതർ പറയുന്നതുവരെ തിരികെ പോകരുത്.']] },
  fire: { en: 'Fire', ml: 'തീപിടിത്തം', do: [['Get out, stay low under smoke, close doors behind you.', 'പുറത്തിറങ്ങുക, പുകയ്ക്ക് താഴെ കുനിഞ്ഞു നീങ്ങുക.'], ['Call 101 from a safe place.', 'സുരക്ഷിത സ്ഥലത്തുനിന്ന് 101 വിളിക്കുക.']], avoid: [['Do not use lifts. Do not go back for belongings.', 'ലിഫ്റ്റ് ഉപയോഗിക്കരുത്. സാധനങ്ങൾക്കായി തിരികെ പോകരുത്.']] },
  earthquake: { en: 'Earthquake', ml: 'ഭൂകമ്പം', do: [['Drop, cover and hold on under a sturdy table.', 'ഉറപ്പുള്ള മേശയ്ക്കടിയിൽ കുനിഞ്ഞിരിക്കുക.'], ['After shaking stops, move to open ground.', 'കുലുക്കം നിന്നാൽ തുറസ്സായ സ്ഥലത്തേക്ക് മാറുക.']], avoid: [['Stay away from windows and damaged buildings.', 'ജനലുകളിൽ നിന്നും കേടായ കെട്ടിടങ്ങളിൽ നിന്നും മാറിനിൽക്കുക.']] },
  cyclone: { en: 'Cyclone', ml: 'ചുഴലിക്കാറ്റ്', do: [['Stay indoors in the strongest room; keep a radio and charged phone.', 'ഏറ്റവും ഉറപ്പുള്ള മുറിയിൽ തുടരുക; ഫോൺ ചാർജ് ചെയ്തു വയ്ക്കുക.'], ['Move to a cyclone shelter if told to evacuate.', 'നിർദേശം ലഭിച്ചാൽ ഷെൽട്ടറിലേക്ക് മാറുക.']], avoid: [['Do not go out during the calm "eye" of the storm.', 'കാറ്റ് ശമിക്കുന്ന ഇടവേളയിൽ പുറത്തിറങ്ങരുത്.']] },
  medical: { en: 'First aid', ml: 'പ്രഥമശുശ്രൂഷ', do: [['Bleeding: press firmly on the wound with a clean cloth.', 'രക്തസ്രാവം: വൃത്തിയുള്ള തുണികൊണ്ട് മുറിവിൽ അമർത്തുക.'], ['Not breathing: call 108 and start chest compressions (100–120 per minute).', 'ശ്വാസമില്ലെങ്കിൽ: 108 വിളിച്ച് നെഞ്ചമർത്തൽ തുടങ്ങുക.'], ['Drowning: lay on the side once breathing.', 'മുങ്ങിയവർ: ശ്വസിച്ചു തുടങ്ങിയാൽ ചരിച്ചു കിടത്തുക.']], avoid: [['Do not move someone with a suspected spine injury unless in danger.', 'നട്ടെല്ലിന് പരിക്ക് സംശയിക്കുന്നവരെ അനാവശ്യമായി നീക്കരുത്.']] },
};
