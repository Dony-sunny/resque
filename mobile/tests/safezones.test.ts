import { describe, expect, it } from 'vitest';
import { directionsUrl, rankFacilities, validPoint } from '../src/core/facilities';
import { actionsFor, intentOf } from '../src/core/assistant';
import type { FacilityView } from '../src/core/types';

const base = { address: 'a', district: 'Kottayam', state: 'Kerala', capacity: null, occupancy: null, remaining: null, services: [], availability_status: 'unknown', last_updated: '2026-10-30T00:00:00Z', phone: null, notes: '', is_simulated: true, verification_status: 'unverified' } as const;
const fac = (id: string, category: FacilityView['category'], latitude: number, longitude: number, name = id, locality = 'Kottayam'): FacilityView => ({ ...base, services: [], id, name, category, latitude, longitude, locality });
const rows = [
  fac('hss', 'shelter', 9.587, 76.525, 'Govt. HSS Kottayam'),
  fac('pala', 'shelter', 9.71, 76.685, 'Pala Parish Hall', 'Pala'),
  fac('kumarakom', 'relief_camp', 9.619, 76.429, "St. Mary's camp", 'Kumarakom'),
  fac('mch', 'hospital', 9.628, 76.52, 'Medical College Hospital', 'Gandhinagar'),
  fac('dh', 'hospital', 9.588, 76.5205, 'District Hospital'),
  fac('relief', 'relief_center', 9.5916, 76.5222, 'Collection centre'),
];
const me = { latitude: 9.5900, longitude: 76.5230 };  // a person in Kottayam town

const parse = (url: string) => { const [root, query] = url.split('?'); return { root, params: Object.fromEntries(query.split('&').map(kv => kv.split('=').map(decodeURIComponent))) }; };

describe('Google Maps directions', () => {
  it('uses the current position as origin and the selected facility as destination, over HTTPS', () => {
    const { root, params } = parse(directionsUrl(rows[3], me, 'driving'));
    expect(root).toBe('https://www.google.com/maps/dir/');
    expect(params).toEqual({ api: '1', origin: '9.59,76.523', destination: '9.628,76.52', travelmode: 'driving', dir_action: 'navigate' });
  });

  it('gives every facility its own destination', () => {
    const destinations = rows.map(f => parse(directionsUrl(f, me)).params.destination);
    expect(new Set(destinations).size).toBe(rows.length);
    destinations.forEach((d, i) => expect(d).toBe(`${rows[i].latitude},${rows[i].longitude}`));
  });

  it('omits the origin when no position is known instead of inventing one', () => {
    const { params } = parse(directionsUrl(rows[0], null, 'walking'));
    expect(params.origin).toBeUndefined();
    expect(params).toMatchObject({ destination: '9.587,76.525', travelmode: 'walking', dir_action: 'navigate' });
  });

  it('rejects invalid destinations and ignores an invalid origin', () => {
    expect(() => directionsUrl({ latitude: 0, longitude: 0 }, me)).toThrow(/valid coordinates/);
    expect(() => directionsUrl({ latitude: 95, longitude: 76 }, me)).toThrow();
    expect(() => directionsUrl({ latitude: Number.NaN, longitude: 76 }, me)).toThrow();
    expect(parse(directionsUrl(rows[0], { latitude: 200, longitude: 0 })).params.origin).toBeUndefined();
    expect(validPoint({ latitude: 9.6, longitude: 76.5 })).toBe(true);
  });

  it('never routes a Kottayam facility to another city', () => {
    for (const f of rows) {
      const [lat, lon] = parse(directionsUrl(f, me)).params.destination.split(',').map(Number);
      expect(lat).toBeGreaterThan(9.3); expect(lat).toBeLessThan(9.9);
      expect(lon).toBeGreaterThan(76.3); expect(lon).toBeLessThan(76.8);
    }
  });
});

describe('facility filters and ordering', () => {
  it('keeps only the selected category, synced for map pins and cards', () => {
    expect(rankFacilities(rows, 'shelter', me).map(f => f.id).sort()).toEqual(['hss', 'pala']);
    expect(rankFacilities(rows, 'hospital', me).every(f => f.category === 'hospital')).toBe(true);
    expect(rankFacilities(rows, 'all', me)).toHaveLength(rows.length);
  });

  it('sorts nearest first with straight-line distances when the position is known', () => {
    const ranked = rankFacilities(rows, 'all', me);
    expect(ranked[0].id).toBe('relief');
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].distanceKm!).toBeGreaterThanOrEqual(ranked[i - 1].distanceKm!);
  });

  it('shows no distances and a stable name order without a position', () => {
    const ranked = rankFacilities(rows, 'all', null);
    expect(ranked.every(f => f.distanceKm === null)).toBe(true);
    expect(ranked.map(f => f.name)).toEqual([...ranked.map(f => f.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('searches by name, town and service, and drops records with invalid coordinates', () => {
    expect(rankFacilities(rows, 'all', null, 'pala').map(f => f.id)).toEqual(['pala']);
    expect(rankFacilities([...rows, fac('bad', 'shelter', 0, 0)], 'all', null).some(f => f.id === 'bad')).toBe(false);
    expect(rankFacilities(rows, 'all', null, 'nowhere')).toEqual([]);
  });
});

describe('assistant points to Safe Zones', () => {
  it('"Find nearest shelter" offers the Safe Zones screen', () => {
    expect(actionsFor(intentOf('Find nearest shelter'), 'citizen')).toEqual([{ label: 'Open Safe Zones', route: 'safezones' }]);
  });
});
