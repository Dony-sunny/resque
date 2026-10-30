import { describe, expect, it } from 'vitest';
import { exportRelay, parseRelay } from '../src/core/relay';
import { demoUser } from '../src/core/store';
import { draft, fixture } from './helpers';

describe('Community QR Relay payload', () => {
  it('is versioned, carries a checksum and no private token, and round-trips', async () => {
    const { store } = fixture(); await store.initialize();
    const report = await store.createReport(demoUser('citizen'), draft);
    const qr = exportRelay(report);
    const data = JSON.parse(qr);
    expect(data).toMatchObject({ format: 'resq-relay', version: 1 });
    expect(data.check).toMatch(/^[0-9a-f]{8}$/);
    expect(qr).not.toContain('receipt_token');
    expect(parseRelay(qr).id).toBe(report.id);
  });

  it('rejects a damaged or edited code', async () => {
    const { store } = fixture(); await store.initialize();
    const qr = exportRelay(await store.createReport(demoUser('citizen'), draft));
    const edited = JSON.parse(qr); edited.report.affected_count += 10;
    expect(() => parseRelay(JSON.stringify(edited))).toThrow(/damaged or altered/);
    expect(() => parseRelay('{"format":"other","version":1}')).toThrow(/Unsupported/);
  });
});
