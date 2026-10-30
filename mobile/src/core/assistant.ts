import { contacts, guides } from './guidance';
import type { Report, Role } from './types';

/** A tap target the assistant may offer. It only navigates or dials; it never changes records. */
export interface AssistantAction { label: string; route?: string; call?: string }
export interface AssistantReply { mode: 'ai' | 'guide' | 'offline'; answer: string; actions: AssistantAction[]; intent?: string; note?: string; sources?: string[] }

const URGENT = ['trapped', 'drowning', 'dying', 'help me', "can't breathe", 'cannot breathe', 'stuck', 'sinking', 'collapsed'];
const GUIDE_WORDS: Record<string, string[]> = {
  flood: ['flood', 'water rising', 'rain'], landslide: ['landslide', 'mudslide', 'slope'], fire: ['fire', 'smoke', 'burn'],
  earthquake: ['earthquake', 'tremor', 'quake'], cyclone: ['cyclone', 'storm', 'wind'], medical: ['first aid', 'bleed', 'injur', 'breath', 'cpr', 'medical', 'drown'],
};
const INTENTS: [string, string[]][] = [
  ['status', ['status', 'track', 'my sos', 'my request', 'my report', 'where is', 'update']],
  ['priority', ['priority', 'why', 'score', 'critical']],
  ['shelter', ['shelter', 'camp', 'safe place', 'safe zone']],
  ['contacts', ['contact', 'number', 'call', 'phone', 'helpline']],
  ['report', ['how do i report', 'report emergency', 'send sos', 'how to sos', 'report']],
];
const MISSION: Record<string, string> = { unassigned: 'waiting for a rescue team', assigned: 'a rescue team has been assigned', accepted: 'the team accepted the mission', en_route: 'the team is on the way', on_scene: 'the team is on site', in_progress: 'rescue is in progress', completed: 'marked resolved' };

export function intentOf(text: string) {
  const t = text.toLowerCase();
  if (URGENT.some(w => t.includes(w))) return 'urgent';
  const hit = INTENTS.find(([, words]) => words.some(w => t.includes(w)));
  if (hit) return hit[0];
  return guideTopic(t) ? 'safety' : 'other';
}
function guideTopic(text: string) { const t = text.toLowerCase(); return Object.keys(GUIDE_WORDS).find(k => GUIDE_WORDS[k].some(w => t.includes(w))); }

export function actionsFor(intent: string, role: Role): AssistantAction[] {
  const victim = role === 'citizen' || role === 'volunteer';
  if (intent === 'urgent') return victim ? [{ label: 'Send SOS now', route: 'create' }, { label: 'Call 112', call: '112' }] : [{ label: 'Call 112', call: '112' }];
  if (intent === 'report' && victim) return [{ label: 'Open SOS form', route: 'create' }];
  if (intent === 'status' && victim) return [{ label: 'Open my requests', route: 'requests' }];
  if (intent === 'shelter') return [{ label: 'Open Safe Zones', route: 'safezones' }];
  if (intent === 'contacts') return [{ label: 'Call 112', call: '112' }];
  if (intent === 'safety' && victim) return [{ label: 'Safety guides', route: 'safety' }];
  return [];
}

function deliveryText(r: Report) {
  if (r.delivery_state === 'pending') return 'saved on this phone, waiting to sync';
  return MISSION[r.mission_status] || r.mission_status;
}

/** "Offline Safety Guide": deterministic answers from guidance stored in the app and this phone's own reports. */
export function localAnswer(question: string, role: Role, reports: Report[]): AssistantReply {
  const intent = intentOf(question), actions = actionsFor(intent, role);
  const reply = (answer: string): AssistantReply => ({ mode: 'offline', intent, answer, actions, sources: ['RESQ curated guidance stored on this phone'] });
  if (intent === 'urgent') return reply('If you are in danger now, send an SOS from the red button or call 112. Stay where rescuers can see or hear you, and save phone battery.');
  if (intent === 'status') {
    const mine = reports.filter(r => r.source === 'own' || r.source === 'collected').slice(0, 3);
    if (!mine.length) return reply('This phone has no SOS saved yet.');
    return reply(mine.map(r => `#${r.id.slice(0, 8)} ${r.incident_type} at ${r.location.label}: ${deliveryText(r)}${r.team ? ` (${r.team.name})` : ''}.${r.relief?.length ? ` Relief: ${r.relief.map(x => x.status).join(', ')}.` : ''}`).join(' ') + ' This is the last status this phone received. RESQ does not estimate arrival times.');
  }
  if (intent === 'priority') return reply('Officials rank every SOS by a fixed rule: severity 40%, vulnerable people 25%, people affected 15%, waiting time 15%, verification 5%. A reported life threat is always at least CRITICAL.');
  if (intent === 'shelter') return reply('Shelter space changes quickly and this phone is offline, so I cannot tell you which camp has room. Open the map for known camps, follow official instructions or call 1077.');
  if (intent === 'contacts') return reply(`Emergency numbers: ${contacts.map(c => `${c.number} ${c.en}`).join(', ')}.`);
  if (intent === 'report') return reply('Tap the red SOS button. Pick the emergency type, confirm your location, set how many people are trapped or injured, then Send SOS. Everything else is optional, and it saves on your phone even without network.');
  const topic = guideTopic(question);
  if (topic) { const g = guides[topic]; return reply(`${g.en} safety: ${[...g.do, ...g.avoid].map(([en]) => en).join(' ')}`); }
  return reply('Offline I can help with: sending an SOS, your saved requests, flood, fire, landslide, earthquake, cyclone and first-aid safety, and emergency numbers. In danger now? Use SOS or call 112.');
}

export const quickQuestions: Record<'victim' | 'staff', string[]> = {
  victim: ['Flood safety', 'Find nearest shelter', 'Track my request', 'How to report an emergency', 'Emergency contacts', 'Explain my incident priority'],
  staff: ['Explain priority', 'Current stock', 'My missions', 'Find nearest shelter', 'Emergency contacts', 'First aid'],
};
