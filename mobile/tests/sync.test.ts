import { describe, expect, it } from 'vitest';
import { SyncEngine, retryDelay } from '../src/core/sync';
import { demoUser } from '../src/core/store';
import { immutableInput } from '../src/core/relay';
import type { SyncEvent, Transport } from '../src/core/types';
import { delivered, draft, fixture } from './helpers';

describe('at-least-once sync', () => {
  it('retries the identical event after a lost response and only marks delivered on a matching receipt', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('citizen');
    const report = await f.store.createReport(user, draft), seen: SyncEvent[] = [];
    const api: Transport = { reports: async () => [delivered(immutableInput(report))], sync: async events => { seen.push(events[0]); if (seen.length === 1) throw new Error('Response lost after server commit'); return { results: [{ event_id: events[0].id, status: 'duplicate', report: delivered(immutableInput(report)) }] }; } };
    const first = await new SyncEngine(f.store, f.now).run(user, api);
    expect(first.remaining).toBe(1); expect((await f.store.reports(user.id))[0].delivery_state).toBe('pending');
    await f.store.retry(user.id, seen[0].id);
    const second = await new SyncEngine(f.store, f.now).run(user, api);
    expect(second.sent).toBe(1); expect(second.remaining).toBe(0); expect(seen[0]).toEqual(seen[1]);
    expect((await f.store.reports(user.id))[0].delivery_state).toBe('delivered'); f.db.close();
  });
  it('does not accept a missing create report receipt as evidence of delivery', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('citizen'); await f.store.createReport(user, draft);
    const api: Transport = { reports: async () => [], sync: async events => ({ results: [{ event_id: events[0].id, status: 'applied' }] }) };
    await new SyncEngine(f.store, f.now).run(user, api);
    expect((await f.store.reports(user.id))[0].delivery_state).toBe('pending'); expect((await f.store.queue(user.id))[0].status).toBe('retry'); f.db.close();
  });
  it('retains an event if a positive server receipt names a different report', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('citizen'); const report = await f.store.createReport(user, draft);
    const incorrect = delivered({ ...immutableInput(report), id: '30000000-0000-4000-8000-000000000001' });
    const api: Transport = { reports: async () => [], sync: async events => ({ results: [{ event_id: events[0].id, status: 'applied', report: incorrect }] }) };
    await new SyncEngine(f.store, f.now).run(user, api);
    expect(await f.store.queue(user.id)).toHaveLength(1); expect((await f.store.reports(user.id))[0].delivery_state).toBe('pending'); f.db.close();
  });
  it('rolls back local delivered state if receipt and outbox deletion cannot commit together', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('citizen'); const report = await f.store.createReport(user, draft);
    f.db.failDelete = true;
    const api: Transport = { reports: async () => [], sync: async events => ({ results: [{ event_id: events[0].id, status: 'applied', report: delivered(immutableInput(report)) }] }) };
    await new SyncEngine(f.store, f.now).run(user, api);
    expect((await f.store.reports(user.id))[0].delivery_state).toBe('pending'); expect(await f.store.queue(user.id)).toHaveLength(1); f.db.close();
  });
  it('retains conflicts visibly and prevents dependent actions overtaking them', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('responder');
    const citizenReport = await f.store.createReport(demoUser('citizen'), draft), server = delivered(immutableInput(citizenReport), 2);
    await f.store.mergeReports(user.id, [{ ...server, assigned_to: user.id, mission_status: 'assigned' }]);
    await f.store.enqueueAction(user, 'mission.status', server.id, { status: 'accepted', expected_version: 2 });
    await f.store.enqueueAction(user, 'mission.note', server.id, { text: 'Offline approach note' });
    const seen: string[] = [];
    const api: Transport = { reports: async () => [server], sync: async events => { seen.push(events[0].kind); return { results: [{ event_id: events[0].id, status: 'conflict', error: 'Version changed', report: server }] }; } };
    await new SyncEngine(f.store, f.now).run(user, api);
    expect(seen).toEqual(['mission.status']);
    const queue = await f.store.queue(user.id); expect(queue[0].status).toBe('conflict'); expect(queue[1].payload.text).toBe('Offline approach note');
    await expect(f.store.retry(user.id, queue[0].id)).rejects.toThrow('corrected action');
    f.db.close();
  });
  it('shares one in-flight run and caps retry delay without discarding reports', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('citizen'); const report = await f.store.createReport(user, draft);
    let calls = 0;
    const api: Transport = { reports: async () => [], sync: async events => { calls++; return { results: [{ event_id: events[0].id, status: 'applied', report: delivered(immutableInput(report)) }] }; } };
    const engine = new SyncEngine(f.store, f.now); await Promise.all([engine.run(user, api), engine.run(user, api)]);
    expect(calls).toBe(1); expect(retryDelay(1)).toBe(1000); expect(retryDelay(1000)).toBe(60000); f.db.close();
  });
});
