import { describe, expect, it } from 'vitest';
import { LocalStore, cleanDetails, demoUser } from '../src/core/store';
import { SyncEngine } from '../src/core/sync';
import type { ReportInput, ServerReport, SyncEvent, Transport } from '../src/core/types';
import { draft, delivered, fixture, hash, TestDatabase } from './helpers';

const details = { people: { trapped: 2, injured: 1, children: 1, elderly: 0, disabled: 0 }, life_threat: true, assistance: ['rescue', 'food'] as const };

describe('progressive SOS details offline', () => {
  it('queues details with the SOS but keeps them out of the immutable report and QR payload', async () => {
    const { store } = fixture(); await store.initialize();
    const report = await store.createReport(demoUser('citizen'), { ...draft, incident_type: 'landslide', details: { ...details, assistance: [...details.assistance] } });
    const [event] = await store.queue('demo-citizen');
    expect(event.payload.details).toEqual({ ...details, assistance: ['rescue', 'food'] });
    expect(report.details?.life_threat).toBe(true);
    const { exportRelay } = await import('../src/core/relay');
    expect(exportRelay(report)).not.toContain('life_threat');
  });

  it('bounds and whitelists details', () => {
    const clean = cleanDetails({ people: { trapped: -3, injured: 2.7, children: 99999, elderly: 0, disabled: 0 }, life_threat: 1 as unknown as boolean, assistance: ['food', 'food', 'hack' as never] });
    expect(clean).toEqual({ people: { trapped: 0, injured: 2, children: 10000, elderly: 0, disabled: 0 }, life_threat: true, assistance: ['food'] });
  });

  it('allows each role only its own new actions', async () => {
    const { store } = fixture(); await store.initialize();
    const report = await store.createReport(demoUser('citizen'), draft);
    await expect(store.enqueueAction(demoUser('citizen'), 'report.details', report.id, details as never)).resolves.toBeUndefined();
    await expect(store.enqueueAction(demoUser('citizen'), 'report.assign', report.id, { team_id: 'team-alpha' })).rejects.toThrow(/cannot/);
    await expect(store.enqueueAction(demoUser('relief'), 'relief.request', report.id, { items: { food_packets: 1 } })).rejects.toThrow(/cannot/);
    await expect(store.enqueueAction(demoUser('citizen'), 'relief.request', report.id, { items: { food_packets: 3 } })).resolves.toBeUndefined();
    const queued = await store.queue('demo-citizen');
    expect(queued.map(q => q.kind)).toEqual(['report.create', 'report.details', 'relief.request']);
    expect(typeof queued[2].payload.id).toBe('string');
  });

  it('keeps a pending offline SOS after an app restart and sends it exactly once', async () => {
    const db = new TestDatabase();
    let n = 0;
    const deps = { id: () => `40000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, token: () => 'b'.repeat(64), hash };
    const first = new LocalStore(db, deps); await first.initialize();
    const report = await first.createReport(demoUser('citizen'), { ...draft, details: { ...details, assistance: ['rescue'] } });
    const reopened = new LocalStore(db, deps); await reopened.initialize();  // simulated app restart, same device storage
    expect((await reopened.queue('demo-citizen')).length).toBe(1);
    expect((await reopened.reports('demo-citizen'))[0].delivery_state).toBe('pending');
    const server = new Map<string, ServerReport>(); let uploads = 0;
    const api: Transport = {
      async sync(events: SyncEvent[]) {
        uploads++;
        return { results: events.map(e => { const existing = server.get(e.report_id); const row = existing || delivered({ ...(e.payload as unknown as ReportInput), id: e.report_id }); server.set(e.report_id, row); return { event_id: e.id, status: existing ? 'duplicate' as const : 'applied' as const, report: row }; }) };
      },
      async reports() { return [...server.values()]; },
    };
    const engine = new SyncEngine(reopened);
    await engine.run(demoUser('citizen'), api);
    await engine.run(demoUser('citizen'), api);
    expect(uploads).toBe(1);
    expect(server.size).toBe(1);
    expect((await reopened.reports('demo-citizen')).find(r => r.id === report.id)?.delivery_state).toBe('delivered');
  });
});
