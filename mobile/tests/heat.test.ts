import { describe, expect, it } from 'vitest';
import { demandHeat, impactHeat } from '../src/core/heat';
import type { ImpactData } from '../src/core/types';

const data = (over: Partial<ImpactData> = {}): ImpactData => ({
  mode: 'precise', contributing_reports: 3, insufficient: false, simulated_reports: 3, generated_at: '2026-10-30T05:00:00Z', cell_km: null, formula: 'x',
  points: [
    { latitude: 9.61, longitude: 76.43, weight: 0.9, verified: true, aggregated: false, incident_id: 'a' },
    { latitude: 9.59, longitude: 76.52, weight: 0.4, verified: false, aggregated: false, incident_id: 'b' },
    { latitude: 9.68, longitude: 76.77, weight: 1.4, verified: true, aggregated: false, incident_id: 'c' },
  ], ...over,
});

describe('Impact Heatmap input', () => {
  it('uses every permitted point and rings unverified reports so they are not shown as confirmed', () => {
    const heat = impactHeat(data())!;
    expect(heat.points).toEqual([[9.61, 76.43, 0.9], [9.59, 76.52, 0.4], [9.68, 76.77, 1]]);
    expect(heat.rings).toEqual([[9.59, 76.52]]);
  });

  it('can be limited to verified reports', () => {
    expect(impactHeat(data(), true)!.points).toHaveLength(2);
  });

  it('draws nothing when the server reports insufficient data', () => {
    expect(impactHeat(data({ insufficient: true }))).toBeNull();
    expect(impactHeat(undefined)).toBeNull();
  });

  it('aggregated public cells get no rings and a wider radius', () => {
    const heat = impactHeat(data({ mode: 'aggregated', cell_km: 2.2, points: [{ latitude: 9.61, longitude: 76.43, weight: 0.5, verified: 1, aggregated: true, count: 2 }] }))!;
    expect(heat.rings).toEqual([]);
    expect(heat.radius).toBe(38);
  });

  it('Relief Demand uses its own purple scale', () => {
    const heat = demandHeat({ points: [{ latitude: 9.6, longitude: 76.5, weight: 1, requests: 2, items: { food_packets: 30 }, shortage: [] }], shortages: [], free_stock: {}, generated_at: '', cell_km: 2.2 })!;
    expect(heat.gradient?.['1']).toBe('#4C1D95');
    expect(demandHeat({ points: [], shortages: [], free_stock: {}, generated_at: '', cell_km: 2.2 })).toBeNull();
  });
});
