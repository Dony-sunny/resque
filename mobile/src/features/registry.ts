import type { Role } from '../core/types';

export type Route = 'home' | 'create' | 'relay' | 'queue' | 'settings';
/** Register new modules here. Server permissions remain authoritative. */
export const modules: { id: Route; roles: Role[]; label: string; ml: string; icon: 'grid-outline' | 'add-circle-outline' | 'qr-code-outline' | 'swap-vertical-outline' | 'options-outline' }[] = [
  { id: 'home', roles: ['citizen', 'volunteer', 'coordinator', 'responder'], label: 'Workspace', ml: 'പ്രവർത്തനം', icon: 'grid-outline' },
  { id: 'create', roles: ['citizen', 'volunteer'], label: 'New SOS', ml: 'സഹായം', icon: 'add-circle-outline' },
  { id: 'relay', roles: ['citizen', 'volunteer'], label: 'Relay', ml: 'കൈമാറ്റം', icon: 'qr-code-outline' },
  { id: 'queue', roles: ['citizen', 'volunteer', 'coordinator', 'responder'], label: 'Outbox', ml: 'ഔട്ട്ബോക്സ്', icon: 'swap-vertical-outline' },
  { id: 'settings', roles: ['citizen', 'volunteer', 'coordinator', 'responder'], label: 'Settings', ml: 'ക്രമീകരണം', icon: 'options-outline' },
];

export const roleInfo = {
  citizen: { title: 'Citizen', ml: 'പൗരൻ', description: 'Request help. Keep a clear record.', descriptionMl: 'സഹായം അഭ്യർത്ഥിക്കുക. വിവരങ്ങൾ വ്യക്തമായി രേഖപ്പെടുത്തുക.', workspace: 'Your safety, connected.', workspaceMl: 'നിങ്ങളുടെ സുരക്ഷയ്ക്ക് ഒരു ബന്ധം.', icon: 'person-outline' },
  volunteer: { title: 'Community volunteer', ml: 'സന്നദ്ധ പ്രവർത്തകൻ', description: 'Collect reports. Carry them forward.', descriptionMl: 'റിപ്പോർട്ടുകൾ ശേഖരിച്ച് കണക്ഷൻ ലഭിക്കുമ്പോൾ അയയ്ക്കുക.', workspace: 'Be the missing connection.', workspaceMl: 'സഹായത്തിലേക്കുള്ള ബന്ധമാകുക.', icon: 'people-outline' },
  coordinator: { title: 'Rescue coordinator', ml: 'രക്ഷാപ്രവർത്തന ഏകോപകൻ', description: 'Verify reports. Coordinate the response.', descriptionMl: 'റിപ്പോർട്ടുകൾ പരിശോധിച്ച് രക്ഷാപ്രവർത്തനം ഏകോപിപ്പിക്കുക.', workspace: 'Turn reports into response.', workspaceMl: 'വിവരങ്ങളിൽ നിന്ന് രക്ഷാപ്രവർത്തനത്തിലേക്ക്.', icon: 'compass-outline' },
  responder: { title: 'Field responder', ml: 'രക്ഷാപ്രവർത്തകൻ', description: 'Know your mission. Record your progress.', descriptionMl: 'നിയോഗിച്ച ദൗത്യം കാണുക. പുരോഗതി രേഖപ്പെടുത്തുക.', workspace: 'A clear mission. Every step.', workspaceMl: 'ഓരോ ഘട്ടത്തിലും വ്യക്തമായ ദൗത്യം.', icon: 'shield-checkmark-outline' },
} as const;
