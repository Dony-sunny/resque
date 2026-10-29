import { describe, expect, it } from 'vitest';
import { exportRelay, MAX_RELAY_BYTES, parseRelay, utf8Bytes, validateDraft } from '../src/core/relay';
import { demoUser } from '../src/core/store';
import { draft, fixture } from './helpers';

describe('untrusted relay parsing', () => {
  it('round trips only the immutable public fields; ownership capability stays on citizen device', async () => {
    const f = fixture(); await f.store.initialize(); const report = await f.store.createReport(demoUser('citizen'), draft);
    const raw = exportRelay(report), parsed = parseRelay(raw);
    expect(raw).not.toContain(report.receipt_token); expect(raw).not.toContain('delivery_state');
    expect(parsed.id).toBe(report.id); expect(parsed.receipt_hash).toHaveLength(64); f.db.close();
  });
  it('rejects unknown schema, huge UTF-8 payloads, malformed IDs, and invalid coordinates', async () => {
    expect(() => parseRelay('{')).toThrow('valid');
    expect(() => parseRelay(JSON.stringify({ format: 'resq-relay', version: 2 }))).toThrow('version');
    expect(() => parseRelay('അ'.repeat(MAX_RELAY_BYTES))).toThrow('large');
    const f = fixture(); await f.store.initialize(); const report = await f.store.createReport(demoUser('citizen'), draft);
    const qr = JSON.parse(exportRelay(report)); qr.report.id = '__proto__';
    expect(() => parseRelay(JSON.stringify(qr))).toThrow('ID');
    expect(() => validateDraft({ ...draft, location: { label: '', latitude: 91, longitude: 76 } })).toThrow('coordinate');
    expect(() => validateDraft({ ...draft, location: { label: '', latitude: null, longitude: null } })).toThrow('location');
    expect(() => validateDraft({ ...draft, affected_count: 0 })).toThrow('Affected');
    expect(utf8Bytes('മലയാളം')).toBeGreaterThan('മലയാളം'.length); f.db.close();
  });
});
