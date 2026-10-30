import { distanceKm, type Point } from './geo';
import type { FacilityCategory, FacilityView } from './types';

export type FacilityFilter = 'all' | FacilityCategory;
/** Each category has its own colour AND glyph, so markers never rely on colour alone. */
export const categoryMeta: Record<FacilityCategory, { label: string; ml: string; color: string; glyph: string; icon: 'home' | 'medkit' | 'bonfire' | 'cube' }> = {
  shelter: { label: 'Shelter', ml: 'അഭയകേന്ദ്രം', color: '#16A34A', glyph: '⌂', icon: 'home' },
  relief_camp: { label: 'Relief camp', ml: 'ദുരിതാശ്വാസ ക്യാമ്പ്', color: '#EA7A0C', glyph: '▲', icon: 'bonfire' },
  hospital: { label: 'Hospital', ml: 'ആശുപത്രി', color: '#DC3545', glyph: '+', icon: 'medkit' },
  relief_center: { label: 'Relief centre', ml: 'ദുരിതാശ്വാസ കേന്ദ്രം', color: '#147DDB', glyph: '■', icon: 'cube' },
};
export const filters: { id: FacilityFilter; label: string; ml: string }[] = [
  { id: 'all', label: 'All', ml: 'എല്ലാം' }, { id: 'shelter', label: 'Shelters', ml: 'അഭയകേന്ദ്രങ്ങൾ' }, { id: 'relief_camp', label: 'Relief camps', ml: 'ക്യാമ്പുകൾ' },
  { id: 'hospital', label: 'Hospitals', ml: 'ആശുപത്രികൾ' }, { id: 'relief_center', label: 'Relief centres', ml: 'ദുരിതാശ്വാസ കേന്ദ്രങ്ങൾ' },
];

export function validPoint(p: Partial<Point> | null | undefined): p is Point {
  return !!p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && !(p.latitude === 0 && p.longitude === 0);
}

export type RankedFacility = FacilityView & { distanceKm: number | null };

/** Filter, search and order facilities. Nearest first when a position is known; otherwise a stable name order and no distances. */
export function rankFacilities(rows: FacilityView[], filter: FacilityFilter, from: Point | null, search = ''): RankedFacility[] {
  const q = search.trim().toLowerCase();
  return rows
    .filter(f => validPoint(f) && (filter === 'all' || f.category === filter))
    .filter(f => !q || `${f.name} ${f.locality} ${f.address} ${f.services.join(' ')}`.toLowerCase().includes(q))
    .map(f => ({ ...f, distanceKm: from ? distanceKm(from, f) : null }))
    .sort((a, b) => (a.distanceKm !== null && b.distanceKm !== null ? a.distanceKm - b.distanceKm : 0) || a.name.localeCompare(b.name));
}

export type TravelMode = 'driving' | 'walking';

/** Google Maps URL (https://www.google.com/maps/dir/?api=1). Origin = current position when known, destination = the facility.
 * Without a position the origin is left out so Google Maps uses the device location or asks the person; nothing is invented. */
export function directionsUrl(destination: Point, origin: Point | null, mode: TravelMode = 'driving'): string {
  if (!validPoint(destination)) throw new Error('This facility has no valid coordinates, so directions cannot be opened.');
  // Built by hand: React Native's URLSearchParams does not implement set().
  const params: [string, string][] = [['api', '1']];
  if (validPoint(origin)) params.push(['origin', `${origin.latitude},${origin.longitude}`]);
  params.push(['destination', `${destination.latitude},${destination.longitude}`], ['travelmode', mode], ['dir_action', 'navigate']);
  return `https://www.google.com/maps/dir/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
