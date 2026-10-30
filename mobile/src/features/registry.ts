import type { Role } from '../core/types';
import type { IconName } from '../ui/components';

export type Route = 'home' | 'create' | 'requests' | 'safety' | 'assistant' | 'relay' | 'map' | 'shelters' | 'queue' | 'settings'
  | 'incidents' | 'teams' | 'more' | 'audit' | 'updates' | 'resources' | 'inventory' | 'dispatch' | 'safezones' | 'notifications';
type Tab = { id: Route; label: string; ml: string; icon: IconName };

/** Bottom navigation per role. Server permissions remain authoritative; other routes open from inside screens. */
export const tabs: Record<Role, Tab[]> = {
  citizen: [
    { id: 'home', label: 'Home', ml: 'ഹോം', icon: 'home-outline' },
    { id: 'create', label: 'SOS', ml: 'SOS', icon: 'alert-circle-outline' },
    { id: 'safezones', label: 'Safe Zones', ml: 'സുരക്ഷിതം', icon: 'map-outline' },
    { id: 'requests', label: 'Requests', ml: 'അഭ്യർത്ഥനകൾ', icon: 'list-outline' },
    { id: 'more', label: 'More', ml: 'കൂടുതൽ', icon: 'menu-outline' },
  ],
  volunteer: [
    { id: 'home', label: 'Home', ml: 'ഹോം', icon: 'home-outline' },
    { id: 'relay', label: 'Scan QR', ml: 'QR സ്കാൻ', icon: 'qr-code-outline' },
    { id: 'requests', label: 'Relay queue', ml: 'കൈമാറ്റ ക്യൂ', icon: 'list-outline' },
    { id: 'map', label: 'Map', ml: 'ഭൂപടം', icon: 'map-outline' },
    { id: 'more', label: 'More', ml: 'കൂടുതൽ', icon: 'menu-outline' },
  ],
  coordinator: [
    { id: 'home', label: 'Overview', ml: 'അവലോകനം', icon: 'speedometer-outline' },
    { id: 'incidents', label: 'Incidents', ml: 'സംഭവങ്ങൾ', icon: 'list-outline' },
    { id: 'map', label: 'Map', ml: 'ഭൂപടം', icon: 'map-outline' },
    { id: 'teams', label: 'Teams', ml: 'സംഘങ്ങൾ', icon: 'people-outline' },
    { id: 'more', label: 'More', ml: 'കൂടുതൽ', icon: 'menu-outline' },
  ],
  responder: [
    { id: 'home', label: 'Missions', ml: 'ദൗത്യങ്ങൾ', icon: 'navigate-outline' },
    { id: 'map', label: 'Map', ml: 'ഭൂപടം', icon: 'map-outline' },
    { id: 'updates', label: 'Updates', ml: 'അപ്ഡേറ്റുകൾ', icon: 'notifications-outline' },
    { id: 'resources', label: 'Resources', ml: 'വിഭവങ്ങൾ', icon: 'cube-outline' },
  ],
  relief: [
    { id: 'home', label: 'Requests', ml: 'അഭ്യർത്ഥനകൾ', icon: 'mail-outline' },
    { id: 'inventory', label: 'Inventory', ml: 'സ്റ്റോക്ക്', icon: 'layers-outline' },
    { id: 'dispatch', label: 'Dispatch', ml: 'വിതരണം', icon: 'car-outline' },
    { id: 'map', label: 'Map', ml: 'ഭൂപടം', icon: 'map-outline' },
    { id: 'shelters', label: 'Shelters', ml: 'ക്യാമ്പുകൾ', icon: 'home-outline' },
  ],
};

export const roleInfo: Record<Role, { title: string; ml: string; description: string; descriptionMl: string; workspace: string; workspaceMl: string; icon: IconName }> = {
  citizen: { title: 'Victim / Citizen', ml: 'ദുരിതബാധിതർ / പൗരൻ', description: 'Send an SOS fast. Track help.', descriptionMl: 'വേഗത്തിൽ SOS അയയ്ക്കുക. സഹായം ട്രാക്ക് ചെയ്യുക.', workspace: 'Your safety, connected.', workspaceMl: 'നിങ്ങളുടെ സുരക്ഷയ്ക്ക് ഒരു ബന്ധം.', icon: 'person-outline' },
  coordinator: { title: 'Government Official', ml: 'സർക്കാർ ഉദ്യോഗസ്ഥൻ', description: 'Prioritise incidents. Assign teams. Publish alerts.', descriptionMl: 'സംഭവങ്ങൾ മുൻഗണനയിലാക്കുക. സംഘങ്ങളെ നിയോഗിക്കുക.', workspace: 'Command centre', workspaceMl: 'കമാൻഡ് സെന്റർ', icon: 'business-outline' },
  responder: { title: 'Rescue Team', ml: 'രക്ഷാസംഘം', description: 'Receive missions. Update progress. Request support.', descriptionMl: 'ദൗത്യങ്ങൾ സ്വീകരിക്കുക. പുരോഗതി രേഖപ്പെടുത്തുക.', workspace: 'Team Alpha missions', workspaceMl: 'ടീം ആൽഫ ദൗത്യങ്ങൾ', icon: 'shield-checkmark-outline' },
  relief: { title: 'Food & Relief', ml: 'ഭക്ഷണം & ദുരിതാശ്വാസം', description: 'Allocate stock. Dispatch supplies. Manage shelters.', descriptionMl: 'സാധനങ്ങൾ വിതരണം ചെയ്യുക. ക്യാമ്പുകൾ നിയന്ത്രിക്കുക.', workspace: 'Relief operations', workspaceMl: 'ദുരിതാശ്വാസ പ്രവർത്തനം', icon: 'cube-outline' },
  volunteer: { title: 'Community QR Relay', ml: 'കമ്മ്യൂണിറ്റി QR കൈമാറ്റം', description: 'Collect reports offline. Carry them to the network.', descriptionMl: 'റിപ്പോർട്ടുകൾ ശേഖരിച്ച് കണക്ഷൻ ലഭിക്കുമ്പോൾ അയയ്ക്കുക.', workspace: 'Be the missing connection.', workspaceMl: 'സഹായത്തിലേക്കുള്ള ബന്ധമാകുക.', icon: 'people-outline' },
};
