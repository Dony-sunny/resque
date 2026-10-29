export type Language = 'en' | 'ml';
export function word(language: Language, english: string, malayalam: string) { return language === 'ml' ? malayalam : english; }
export const incidentNames = {
  flood: ['Flood / water', 'വെള്ളപ്പൊക്കം'], medical: ['Medical help', 'വൈദ്യസഹായം'],
  fire: ['Fire', 'തീപിടിത്തം'], trapped: ['Trapped / rescue', 'കുടുങ്ങി'],
  supplies: ['Food / supplies', 'ഭക്ഷണം / സാധനങ്ങൾ'], other: ['Other', 'മറ്റുള്ളവ'],
} as const;
export function incidentName(type: string, language: Language) {
  const pair = incidentNames[type as keyof typeof incidentNames];
  return pair ? pair[language === 'ml' ? 1 : 0] : type;
}
const statusNames: Record<string, string> = {
  pending: 'കാത്തിരിക്കുന്നു', retry: 'വീണ്ടും ശ്രമിക്കും', blocked: 'പരിശോധന വേണം', conflict: 'വൈരുദ്ധ്യം',
  delivered: 'സെർവറിൽ ലഭിച്ചു', acknowledged: 'ഏകോപകൻ സ്വീകരിച്ചു',
  unverified: 'സ്ഥിരീകരിച്ചിട്ടില്ല', verified: 'സ്ഥിരീകരിച്ചു', rejected: 'നിരസിച്ചു',
  low: 'കുറവ്', medium: 'മിതം', high: 'ഉയർന്നത്', critical: 'അതീവ അടിയന്തരം',
  unassigned: 'നിയോഗിച്ചിട്ടില്ല', assigned: 'നിയോഗിച്ചു', accepted: 'സ്വീകരിച്ചു', en_route: 'യാത്രയിലാണ്', on_scene: 'സ്ഥലത്തെത്തി', completed: 'പൂർത്തിയായി',
  'report.create': 'SOS അയയ്ക്കുക', 'report.review': 'റിപ്പോർട്ട് പരിശോധിക്കുക', 'report.assign': 'രക്ഷാപ്രവർത്തകനെ നിയോഗിക്കുക',
  'mission.status': 'ദൗത്യസ്ഥിതി മാറ്റം', 'mission.note': 'ഫീൽഡ് നോട്ട്',
  'report.received': 'സെർവറിൽ റിപ്പോർട്ട് ലഭിച്ചു', 'report.reviewed': 'റിപ്പോർട്ട് പരിശോധിച്ചു',
  'report.assigned': 'രക്ഷാപ്രവർത്തകനെ നിയോഗിച്ചു', 'report.claimed': 'യഥാർത്ഥ റിപ്പോർട്ട് നൽകിയ വ്യക്തിയെ സ്ഥിരീകരിച്ചു', 'relay.received': 'റിലേ പകർപ്പ് ലഭിച്ചു',
};
export function friendly(value: string, language: Language = 'en') {
  return language === 'ml' && statusNames[value] ? statusNames[value] : value.replaceAll('_', ' ').replace(/^./, s => s.toUpperCase());
}
export function dateLabel(value: string, language: Language = 'en') {
  return new Date(value).toLocaleString(language === 'ml' ? 'ml-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const messages: Record<string, string> = {
  'Reports are saved locally first.': 'റിപ്പോർട്ടുകൾ ആദ്യം ഈ ഉപകരണത്തിൽ സേവ് ചെയ്യും.',
  'Offline practice: reports and changes remain on this device.': 'ഓഫ്‌ലൈൻ പരിശീലനം: റിപ്പോർട്ടുകളും മാറ്റങ്ങളും ഈ ഉപകരണത്തിൽ സേവ് ചെയ്തിരിക്കും.',
  'Loading this demo workspace...': 'ഈ ഡെമോ വർക്ക്‌സ്‌പേസ് തുറക്കുന്നു...',
  'SOS saved on this device. It has not been delivered to the server.': 'SOS ഈ ഉപകരണത്തിൽ സേവ് ചെയ്തു. സെർവറിൽ ഇതുവരെ എത്തിയിട്ടില്ല.',
  'Backend confirmed all queued actions. Feed refreshed.': 'ക്യൂവിലെ എല്ലാ മാറ്റങ്ങളും സെർവർ സ്ഥിരീകരിച്ചു. പുതിയ വിവരങ്ങൾ ലഭിച്ചു.',
  'Offline practice is on. Reports are saved locally and have not been sent.': 'ഓഫ്‌ലൈൻ പരിശീലനം ഓൺ ആണ്. റിപ്പോർട്ടുകൾ ഈ ഉപകരണത്തിൽ സേവ് ചെയ്തിട്ടുണ്ട്; അയച്ചിട്ടില്ല.',
  'Server workspace changed. Reports and outbox are scoped to this address.': 'സെർവർ വർക്ക്‌സ്‌പേസ് മാറ്റി. ഈ വിലാസത്തിലെ റിപ്പോർട്ടുകളും ഔട്ട്ബോക്സുമാണ് ഇപ്പോൾ കാണുന്നത്.',
  'Backend timed out. Saved actions remain on this device.': 'സെർവർ മറുപടി വൈകി. സേവ് ചെയ്ത മാറ്റങ്ങൾ ഈ ഉപകരണത്തിൽ നിലനിൽക്കും.',
  'Connection failed.': 'സെർവറിലേക്ക് കണക്റ്റ് ചെയ്യാനായില്ല.',
  'Network request failed': 'നെറ്റ്‌വർക്ക് അഭ്യർത്ഥന പരാജയപ്പെട്ടു. സേവ് ചെയ്ത റിപ്പോർട്ടുകൾ ഉപകരണത്തിൽ നിലനിൽക്കും.',
  'Failed to fetch': 'സെർവറുമായി ബന്ധപ്പെടാനായില്ല. വിലാസവും കണക്ഷനും പരിശോധിക്കുക.',
  'Could not refresh reports.': 'പുതിയ റിപ്പോർട്ടുകൾ ലഭിച്ചില്ല. സേവ് ചെയ്ത വിവരങ്ങൾ കാണാം.',
  'This is not a valid ResQ Relay QR.': 'ഇത് ശരിയായ ResQ Relay QR അല്ല.',
  'Unsupported QR format or version.': 'ഈ QR രൂപമോ പതിപ്പോ പിന്തുണയ്ക്കുന്നില്ല.',
  'QR is too large. One report per QR is supported.': 'QR ഡാറ്റ വളരെ വലുതാണ്. ഒരു QR-ൽ ഒരു ചെറിയ റിപ്പോർട്ട് മാത്രമേ കൈമാറാനാകൂ.',
  'Report is too large for one QR. Shorten the description before creating a new report.': 'റിപ്പോർട്ട് ഒരു QR-ൽ ഉൾക്കൊള്ളാൻ വലുതാണ്. ഈ SOS സേവ് ചെയ്തിട്ടുണ്ട്. ചെറിയ വിവരണത്തോടെ പുതിയ റിപ്പോർട്ട് സൃഷ്ടിക്കാം.',
  'This report ID already exists with different content. Import stopped.': 'ഇതേ റിപ്പോർട്ട് നമ്പറിൽ വ്യത്യസ്ത വിവരങ്ങൾ നേരത്തേയുണ്ട്. കൈമാറ്റം നിർത്തി.',
  'Choose a valid incident type.': 'ശരിയായ സംഭവതരം തിരഞ്ഞെടുക്കുക.',
  'Affected count must be 1–10,000.': 'ബാധിതരുടെ എണ്ണം 1 മുതൽ 10,000 വരെ നൽകുക.',
  'Use a complete, valid coordinate pair.': 'ശരിയായ അക്ഷാംശവും രേഖാംശവും രണ്ടും നൽകുക.',
  'Only volunteers can import relay reports.': 'സന്നദ്ധ പ്രവർത്തകർക്ക് മാത്രമേ റിലേ റിപ്പോർട്ട് സ്വീകരിക്കാനാകൂ.',
  'Report is not available on this device.': 'ഈ റിപ്പോർട്ട് ഈ ഉപകരണത്തിൽ ലഭ്യമല്ല.',
  'This role cannot perform this action.': 'ഈ പ്രവർത്തനം നടത്താൻ നിങ്ങളുടെ ഉപയോക്തൃവിഭാഗത്തിന് അനുമതിയില്ല.',
  'This role cannot create reports.': 'ഈ ഉപയോക്തൃവിഭാഗത്തിന് റിപ്പോർട്ട് സൃഷ്ടിക്കാനാകില്ല.',
  'This is a synthetic preview. Connect to the seeded demo backend to take actions.': 'ഇത് കാണാനുള്ള കൃത്രിമ ഉദാഹരണമാണ്. പ്രവർത്തനങ്ങൾ പരീക്ഷിക്കാൻ ഡെമോ സെർവറുമായി സിങ്ക് ചെയ്യുക.',
  'Note must contain 1–1,500 characters.': 'നോട്ട് 1 മുതൽ 1,500 അക്ഷരങ്ങൾ വരെ ആയിരിക്കണം.',
  'Refresh the report, dismiss this action, and submit a corrected action.': 'പുതിയ റിപ്പോർട്ട് സിങ്ക് ചെയ്ത് പരിശോധിക്കുക. ഈ മാറ്റം ഒഴിവാക്കി തിരുത്തിയ പുതിയ മാറ്റം നൽകുക.',
  'Unsent SOS reports are retained. Fix connectivity or relay the report.': 'അയയ്ക്കാത്ത SOS റിപ്പോർട്ടുകൾ ഒഴിവാക്കില്ല. കണക്ഷൻ ശരിയാക്കുകയോ QR വഴി കൈമാറുകയോ ചെയ്യുക.',
  'Server did not return a receipt for this action. It remains queued.': 'ഈ മാറ്റത്തിന് സെർവർ രസീത് ലഭിച്ചില്ല. മാറ്റം ഔട്ട്ബോക്സിൽ തുടരുന്നു.',
  'Receipt omitted the report. The action remains pending.': 'സെർവർ രസീതിൽ റിപ്പോർട്ട് ലഭിച്ചില്ല. മാറ്റം കാത്തിരിപ്പിൽ തുടരുന്നു.',
  'Enter the demo access key before connecting to this protected backend.': 'ഈ സംരക്ഷിത സെർവറിലേക്ക് ബന്ധിപ്പിക്കും മുമ്പ് ഡെമോ ആക്സസ് കീ നൽകുക.',
  'Server checked and settings saved. Pending reports still require sync for delivery.': 'സെർവർ പരിശോധിച്ച് ക്രമീകരണം സേവ് ചെയ്തു. കാത്തിരിക്കുന്ന റിപ്പോർട്ടുകൾ അയയ്ക്കാൻ സിങ്ക് ചെയ്യണം.',
  'Action requires review.': 'ഈ മാറ്റം പരിശോധിക്കേണ്ടതുണ്ട്.',
  'Report changed since this form was opened. Refresh and review the latest state before saving.': 'ഈ ഫോം തുറന്നതിന് ശേഷം റിപ്പോർട്ട് മാറിയിട്ടുണ്ട്. പുതിയ വിവരങ്ങൾ സിങ്ക് ചെയ്ത് പരിശോധിച്ച ശേഷം സേവ് ചെയ്യുക.',
  'Resolve or dismiss the earlier blocked action before queueing more changes for this report.': 'ഈ റിപ്പോർട്ടിലെ തടഞ്ഞുവച്ച മുൻ മാറ്റം പരിശോധിച്ച് പരിഹരിക്കുകയോ ഒഴിവാക്കുകയോ ചെയ്ത ശേഷം പുതിയ മാറ്റം നൽകുക.',
  'Your server-assigned role cannot perform this action': 'ഈ പ്രവർത്തനത്തിന് നിങ്ങളുടെ ഉപയോക്തൃവിഭാഗത്തിന് സെർവർ അനുമതി നൽകിയിട്ടില്ല.',
  'Report and event IDs do not match': 'റിപ്പോർട്ട് നമ്പറും മാറ്റത്തിലെ നമ്പറും പൊരുത്തപ്പെടുന്നില്ല.',
  'Citizen reports must name the authenticated citizen as origin': 'റിപ്പോർട്ട് നൽകിയ പൗരന്റെ അക്കൗണ്ട് പൊരുത്തപ്പെടുന്നില്ല.',
  'Citizen ownership requires the private receipt token': 'യഥാർത്ഥ റിപ്പോർട്ട് നൽകിയ വ്യക്തിയെ സ്ഥിരീകരിക്കാനുള്ള ഉപകരണത്തിലെ സ്വകാര്യ രസീത് ലഭ്യമല്ല.',
  'This report ID already contains different immutable data': 'ഇതേ റിപ്പോർട്ട് നമ്പറിൽ വ്യത്യസ്ത വിവരങ്ങൾ നേരത്തേയുണ്ട്. പഴയ റിപ്പോർട്ട് പരിശോധിക്കുക.',
  'Report ownership cannot be replaced': 'റിപ്പോർട്ട് നൽകിയ വ്യക്തിയെ മാറ്റാനാവില്ല.',
  'Report does not exist or is unavailable': 'റിപ്പോർട്ട് ലഭ്യമല്ല, അല്ലെങ്കിൽ കാണാനുള്ള അനുമതിയില്ല.',
  'An assigned report must stay verified; review assignment before changing verification': 'രക്ഷാപ്രവർത്തകനെ നിയോഗിച്ച റിപ്പോർട്ട് സ്ഥിരീകരിച്ചതായി തുടരണം. ആദ്യം നിയോഗം പരിശോധിക്കുക.',
  'Verify the report before assigning a responder': 'രക്ഷാപ്രവർത്തകനെ നിയോഗിക്കും മുമ്പ് റിപ്പോർട്ട് സ്ഥിരീകരിക്കുക.',
  'A completed mission cannot be reassigned': 'പൂർത്തിയായ ദൗത്യം വീണ്ടും നിയോഗിക്കാനാവില്ല.',
  'Choose an active field responder': 'പ്രവർത്തനത്തിലുള്ള രക്ഷാപ്രവർത്തകനെ തിരഞ്ഞെടുക്കുക.',
  'Only the currently assigned responder can update this mission': 'നിലവിൽ നിയോഗിച്ച രക്ഷാപ്രവർത്തകന് മാത്രമേ ദൗത്യസ്ഥിതി മാറ്റാനാകൂ.',
  'Only the currently assigned responder can add mission notes': 'നിലവിൽ നിയോഗിച്ച രക്ഷാപ്രവർത്തകന് മാത്രമേ ദൗത്യ നോട്ടുകൾ നൽകാനാകൂ.',
  'Note ID already has different content': 'ഇതേ നോട്ട് നമ്പറിൽ വ്യത്യസ്ത വിവരങ്ങൾ നേരത്തേയുണ്ട്.',
  'Event ID already used by another identity or different content': 'ഇതേ മാറ്റ നമ്പർ മറ്റൊരു അക്കൗണ്ടിലോ വ്യത്യസ്ത വിവരങ്ങളോടെയോ ഉപയോഗിച്ചിട്ടുണ്ട്.',
  'Report is no longer visible to this identity': 'ഈ അക്കൗണ്ടിന് ഇപ്പോൾ റിപ്പോർട്ട് കാണാനുള്ള അനുമതിയില്ല. നിയോഗം മാറിയിരിക്കാം.',
  'Invalid event payload: check required fields, bounds, coordinates and timestamps': 'നൽകിയ മാറ്റത്തിലെ വിവരങ്ങൾ ശരിയല്ല. നിർബന്ധമായ ഫീൽഡുകളും എണ്ണവും സ്ഥലവും സമയവും പരിശോധിക്കുക.',
  'Enter a complete http:// or https:// backend URL.': 'http:// അല്ലെങ്കിൽ https:// ഉൾപ്പെടെയുള്ള പൂർണ സെർവർ വിലാസം നൽകുക.',
  'Use the backend base URL without credentials, query, or a path.': 'സെർവറിന്റെ അടിസ്ഥാന വിലാസം മാത്രം നൽകുക. അക്കൗണ്ട് വിവരങ്ങളോ അധിക പാതയോ ചേർക്കരുത്.',
  'This backend is not running the ResQ Relay demo. Check the server address and enable demo access.': 'ഈ സെർവറിൽ ResQ Relay ഡെമോ പ്രവർത്തിക്കുന്നില്ല. വിലാസവും സെർവറിലെ ഡെമോ ക്രമീകരണവും പരിശോധിക്കുക.',
  'Backend did not provide a valid persistent identity. Update the backend before connecting.': 'സെർവറിന്റെ സ്ഥിരമായ തിരിച്ചറിയൽ വിവരം ലഭിച്ചില്ല. ബന്ധിപ്പിക്കും മുമ്പ് സെർവർ പുതുക്കുക.',
  'Backend health check failed. Saved actions remain on this device.': 'സെർവർ പരിശോധന പരാജയപ്പെട്ടു. സേവ് ചെയ്ത മാറ്റങ്ങൾ ഈ ഉപകരണത്തിൽ നിലനിൽക്കും.',
  'Confirmed reports cannot be moved to a different backend workspace.': 'സ്ഥിരീകരിച്ച റിപ്പോർട്ടുകൾ മറ്റൊരു സെർവറിലേക്ക് മാറ്റാനാവില്ല.',
  'An offline report conflicts with the destination workspace. No reports were moved.': 'ഓഫ്‌ലൈൻ റിപ്പോർട്ട് പുതിയ വർക്ക്‌സ്‌പേസിലെ വിവരങ്ങളുമായി പൊരുത്തപ്പെടുന്നില്ല. ഒരു റിപ്പോർട്ടും മാറ്റിയിട്ടില്ല.',
  'An offline event conflicts with the destination workspace. No reports were moved.': 'ഓഫ്‌ലൈൻ മാറ്റം പുതിയ വർക്ക്‌സ്‌പേസിലെ വിവരങ്ങളുമായി പൊരുത്തപ്പെടുന്നില്ല. ഒരു റിപ്പോർട്ടും മാറ്റിയിട്ടില്ല.',
};
/** Translate operational feedback while retaining unfamiliar diagnostic details for support. */
export function localizeMessage(language: Language, value: string): string {
  if (language === 'en' || !value) return value;
  if (/[\u0d00-\u0d7f]/.test(value)) return value;
  if (messages[value]) return messages[value];
  const pending = value.match(/^(\d+) action\(s\) remain queued/);
  if (pending) return `${pending[1]} മാറ്റങ്ങൾ ഔട്ട്ബോക്സിൽ തുടരുന്നു. വീണ്ടും ശ്രമിക്കേണ്ടതോ പരിശോധിക്കേണ്ടതോ ഉണ്ടോ എന്ന് നോക്കുക.`;
  if (/^Invalid (report|location|description|origin|receipt|server)/i.test(value)) return `നൽകിയ വിവരങ്ങൾ ശരിയല്ല. പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക. (${value})`;
  if (/^40[13]:/.test(value)) return `സെർവർ പ്രവേശനം അനുവദിച്ചില്ല. ഡെമോ ആക്സസ് കോഡും ഉപയോക്തൃവിഭാഗവും പരിശോധിക്കുക. (${value})`;
  if (/^Stale version|^409:/.test(value)) return 'മറ്റൊരു ഉപയോക്താവ് ഈ റിപ്പോർട്ട് മാറ്റിയിട്ടുണ്ട്. സിങ്ക് ചെയ്ത് പുതിയ വിവരങ്ങൾ പരിശോധിച്ച ശേഷം മാറ്റം വീണ്ടും നൽകുക.';
  if (/^Invalid mission transition/.test(value)) return 'ദൗത്യസ്ഥിതികൾ ക്രമത്തിൽ മാത്രമേ മാറ്റാനാകൂ. നിലവിലെ സ്ഥിരീകരിച്ച സ്ഥിതിയും ക്യൂവിലെ മാറ്റങ്ങളും പരിശോധിക്കുക.';
  if (/^The backend identity at this address changed/.test(value)) return 'ഈ വിലാസത്തിലെ സെർവർ തിരിച്ചറിയൽ മാറിയിട്ടുണ്ട്. പഴയ റിപ്പോർട്ടുകൾ സുരക്ഷിതമായി പഴയ സെർവർ വർക്ക്‌സ്‌പേസിൽ ഉണ്ട്. ക്രമീകരണത്തിൽ വിലാസം പരിശോധിച്ച് സേവ് ചെയ്യുക.';
  return `സന്ദേശം: ${value}`;
}
export function isSyntheticDescription(description: string) { return /^\[?SYNTHETIC\b/i.test(description.trimStart()); }
