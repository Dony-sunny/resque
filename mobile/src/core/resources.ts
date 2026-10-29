/** Offline directory bundled with the app, so it works with no network. Relief camps come from the
 * server's shelter list (cached for offline use); this file holds fixed services.
 * DEMO DATA: approximate Kottayam-area points for the hackathon, labelled "Demo". Replace with the
 * district authority's verified list before any real use. */
export type ResourceKind = 'camp' | 'hospital' | 'police' | 'fire' | 'boat';
export interface Resource { id: string; kind: ResourceKind; name: string; detail: string; latitude: number; longitude: number }

export const resources: Resource[] = [
  { id: 'hosp-1', kind: 'hospital', name: 'Demo · Medical College Hospital, Kottayam', detail: '24×7 casualty', latitude: 9.6280, longitude: 76.5200 },
  { id: 'hosp-2', kind: 'hospital', name: 'Demo · District Hospital, Kottayam', detail: 'Casualty, ambulance base', latitude: 9.5880, longitude: 76.5205 },
  { id: 'hosp-3', kind: 'hospital', name: 'Demo · General Hospital, Changanassery', detail: 'Casualty', latitude: 9.4440, longitude: 76.5420 },
  { id: 'police-1', kind: 'police', name: 'Demo · Police control room, Kottayam', detail: 'Dial 112', latitude: 9.5930, longitude: 76.5260 },
  { id: 'fire-1', kind: 'fire', name: 'Demo · Fire & rescue station, Kottayam', detail: 'Rescue boats, divers', latitude: 9.5900, longitude: 76.5180 },
  { id: 'boat-1', kind: 'boat', name: 'Demo · Boat pickup, Kumarakom jetty', detail: 'Fishermen rescue boats', latitude: 9.6175, longitude: 76.4300 },
];
