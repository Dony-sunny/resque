import type { Role } from '../core/types';
import type { IconName } from '../ui/components';

export type Route = 'home' | 'create' | 'relay' | 'map' | 'safety' | 'shelters' | 'queue' | 'settings';
/** Register new modules here. Server permissions remain authoritative. */
export const modules: { id: Route; roles: Role[]; label: string; ml: string; icon: IconName }[] = [
  { id: 'home', roles: ['citizen', 'volunteer', 'coordinator', 'responder', 'relief'], label: 'Home', ml: 'ഹോം', icon: 'grid-outline' },
  { id: 'create', roles: ['citizen', 'volunteer'], label: 'Report', ml: 'റിപ്പോർട്ട്', icon: 'add-circle-outline' },
  { id: 'relay', roles: ['volunteer'], label: 'Relay', ml: 'കൈമാറ്റം', icon: 'qr-code-outline' },
  { id: 'shelters', roles: ['relief', 'coordinator'], label: 'Shelters', ml: 'ക്യാമ്പുകൾ', icon: 'home-outline' },
  { id: 'map', roles: ['citizen', 'volunteer', 'coordinator', 'responder', 'relief'], label: 'Map', ml: 'ഭൂപടം', icon: 'map-outline' },
  { id: 'safety', roles: ['citizen', 'volunteer'], label: 'Safety', ml: 'സുരക്ഷ', icon: 'shield-checkmark-outline' },
  { id: 'queue', roles: ['citizen', 'volunteer', 'coordinator', 'responder'], label: 'Outbox', ml: 'ഔട്ട്ബോക്സ്', icon: 'swap-vertical-outline' },
  { id: 'settings', roles: ['citizen', 'volunteer', 'coordinator', 'responder', 'relief'], label: 'Settings', ml: 'ക്രമീകരണം', icon: 'options-outline' },
];

export const roleInfo: Record<Role, { title: string; ml: string; description: string; descriptionMl: string; workspace: string; workspaceMl: string; icon: IconName }> = {
  citizen: { title: 'Victim / Citizen', ml: 'ദുരിതബാധിതർ / പൗരൻ', description: 'Send an SOS fast. Track help.', descriptionMl: 'വേഗത്തിൽ SOS അയയ്ക്കുക. സഹായം ട്രാക്ക് ചെയ്യുക.', workspace: 'Your safety, connected.', workspaceMl: 'നിങ്ങളുടെ സുരക്ഷയ്ക്ക് ഒരു ബന്ധം.', icon: 'person-outline' },
  coordinator: { title: 'Government Official', ml: 'സർക്കാർ ഉദ്യോഗസ്ഥൻ', description: 'Prioritise incidents. Assign teams. Publish alerts.', descriptionMl: 'സംഭവങ്ങൾ മുൻഗണനയിലാക്കുക. സംഘങ്ങളെ നിയോഗിക്കുക.', workspace: 'Command centre', workspaceMl: 'കമാൻഡ് സെന്റർ', icon: 'business-outline' },
  responder: { title: 'Rescue Team', ml: 'രക്ഷാസംഘം', description: 'Receive missions. Update progress. Request support.', descriptionMl: 'ദൗത്യങ്ങൾ സ്വീകരിക്കുക. പുരോഗതി രേഖപ്പെടുത്തുക.', workspace: 'Team Alpha missions', workspaceMl: 'ടീം ആൽഫ ദൗത്യങ്ങൾ', icon: 'shield-checkmark-outline' },
  relief: { title: 'Food & Relief', ml: 'ഭക്ഷണം & ദുരിതാശ്വാസം', description: 'Allocate stock. Dispatch supplies. Manage shelters.', descriptionMl: 'സാധനങ്ങൾ വിതരണം ചെയ്യുക. ക്യാമ്പുകൾ നിയന്ത്രിക്കുക.', workspace: 'Relief operations', workspaceMl: 'ദുരിതാശ്വാസ പ്രവർത്തനം', icon: 'cube-outline' },
  volunteer: { title: 'Community volunteer (QR relay)', ml: 'സന്നദ്ധപ്രവർത്തകൻ (QR കൈമാറ്റം)', description: 'Collect reports offline. Carry them to the network.', descriptionMl: 'റിപ്പോർട്ടുകൾ ശേഖരിച്ച് കണക്ഷൻ ലഭിക്കുമ്പോൾ അയയ്ക്കുക.', workspace: 'Be the missing connection.', workspaceMl: 'സഹായത്തിലേക്കുള്ള ബന്ധമാകുക.', icon: 'people-outline' },
};
