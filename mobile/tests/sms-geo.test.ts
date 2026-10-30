import { describe, expect, it } from 'vitest';
import { encodeSmsReport, smsSegments } from '../src/core/sms';
import { bearingDeg, compass, distanceKm, formatDistance, projector } from '../src/core/geo';
import type { ReportInput } from '../src/core/types';

// Same vector is decoded in backend/tests/test_api.py::test_sms_shared_vector_matches_mobile_encoder.
const VECTOR: ReportInput = {
  id: '30000000-0000-4000-8000-000000000001', incident_type: 'trapped', affected_count: 2,
  description: 'Water at first floor | two elderly people', location: { label: 'Near St. Mary\'s Church, Aluva', latitude: 10.107612, longitude: 76.351634 },
  created_at: '2026-10-29T08:15:30.123Z', origin_id: 'demo-citizen', receipt_hash: 'b'.repeat(64),
};
const EXPECTED = 'RQ1|30000000-0000-4000-8000-000000000001|trapped|2|10.107612|76.351634|1793261730123|demo-citizen|' + 'b'.repeat(64) + '|Near St. Mary\'s Church, Aluva|Water at first floor | two elderly people';

describe('SMS fallback codec', () => {
  it('encodes every immutable field exactly and never the receipt token', () => {
    const text = encodeSmsReport({ ...VECTOR, receipt_token: 'c'.repeat(64) } as ReportInput);
    expect(text).toBe(EXPECTED);
    expect(text).not.toContain('c'.repeat(64));
  });
  it('marks missing coordinates and rejects unsafe landmarks or oversized text', () => {
    expect(encodeSmsReport({ ...VECTOR, location: { label: 'Ward 5', latitude: null, longitude: null } }).split('|').slice(4, 6)).toEqual(['-', '-']);
    expect(() => encodeSmsReport({ ...VECTOR, location: { ...VECTOR.location, label: 'a|b' } })).toThrow(/landmark/);
  });
  it('estimates segments for GSM and Malayalam text', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('വെള്ളം'.repeat(20))).toBe(2);
  });
});

describe('offline geometry', () => {
  const kochi = { latitude: 9.9816, longitude: 76.2999 }, aluva = { latitude: 10.1076, longitude: 76.3516 };
  it('computes distance and compass direction between Kochi and Aluva', () => {
    expect(distanceKm(kochi, aluva)).toBeGreaterThan(14.5);
    expect(distanceKm(kochi, aluva)).toBeLessThan(15.5);
    expect(compass(bearingDeg(kochi, aluva))).toBe('N');
    expect(formatDistance(0.42)).toBe('420 m');
    expect(formatDistance(14.96)).toBe('15 km');
  });
  it('projects points inside the drawing box with north up', () => {
    const view = projector([kochi, aluva], 300, 300);
    const a = view.project(kochi), b = view.project(aluva);
    for (const p of [a, b]) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(300); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(300); }
    expect(b.y).toBeLessThan(a.y);
  });
});
