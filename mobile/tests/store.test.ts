import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { LocalStore, demoUser } from '../src/core/store';
import { exportRelay, immutableInput } from '../src/core/relay';
import { draft, fixture, TestDatabase, delivered } from './helpers';

describe('durable report and outbox storage', () => {
  it('creates report and event atomically; a failed queue write rolls both back', async () => {
    const f = fixture(); await f.store.initialize(); f.db.failOutbox = true;
    await expect(f.store.createReport(demoUser('citizen'), draft)).rejects.toThrow('full disk');
    expect(await f.store.reports('demo-citizen')).toHaveLength(0);
    expect(await f.store.queue('demo-citizen')).toHaveLength(0);
    f.db.close();
  });
  it('persists SOS and immutable event ID across a database reopen', async () => {
    const f = fixture(), path = join(tmpdir(), `resq-relay-test-${randomUUID()}.db`);
    const db1 = new TestDatabase(path), store1 = new LocalStore(db1, f.deps); await store1.initialize();
    const report = await store1.createReport(demoUser('citizen'), draft), event = (await store1.queue('demo-citizen'))[0]; db1.close();
    const db2 = new TestDatabase(path), store2 = new LocalStore(db2, f.deps); await store2.initialize();
    expect((await store2.reports('demo-citizen'))[0]).toEqual(report);
    expect((await store2.queue('demo-citizen'))[0].id).toBe(event.id);
    expect(report.delivery_state).toBe('pending');
    db2.close(); f.db.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix);
  });
  it('isolates local data and actions by user, and enforces local role boundaries', async () => {
    const f = fixture(); await f.store.initialize();
    await f.store.createReport(demoUser('citizen'), draft);
    expect(await f.store.reports('demo-volunteer')).toHaveLength(0);
    expect(await f.store.queue('demo-volunteer')).toHaveLength(0);
    await expect(f.store.createReport(demoUser('coordinator'), draft)).rejects.toThrow('cannot create');
    await expect(f.store.enqueueAction(demoUser('citizen'), 'report.review', 'unknown', {})).rejects.toThrow('cannot perform');
    f.db.close();
  });
  it('imports a QR once and keeps it pending even when QR forges delivery/privilege fields', async () => {
    const f = fixture(); await f.store.initialize();
    const report = await f.store.createReport(demoUser('citizen'), draft);
    const parsed = JSON.parse(exportRelay(report)); parsed.report.delivery_state = 'acknowledged'; parsed.report.receipt_token = 'stolen'; parsed.report.urgency = 'critical';
    const value = JSON.stringify(parsed);
    const first = await f.store.importRelay(demoUser('volunteer'), value);
    const duplicate = await f.store.importRelay(demoUser('volunteer'), value);
    expect(first.imported).toBe(true); expect(duplicate.imported).toBe(false);
    expect(first.report.delivery_state).toBe('pending'); expect(first.report.urgency).toBeNull(); expect(first.report.receipt_token).toBeUndefined();
    expect(await f.store.queue('demo-volunteer')).toHaveLength(1);
    parsed.report.description = 'Changed report';
    // With its checksum the edit is rejected as damaged; without one (older v1 codes) the store's identity check still refuses it.
    await expect(f.store.importRelay(demoUser('volunteer'), JSON.stringify(parsed))).rejects.toThrow('damaged or altered');
    delete parsed.check;
    await expect(f.store.importRelay(demoUser('volunteer'), JSON.stringify(parsed))).rejects.toThrow('different content');
    f.db.close();
  });
  it('preserves original ownership secret after delivery and ignores older server versions', async () => {
    const f = fixture(); await f.store.initialize();
    const report = await f.store.createReport(demoUser('citizen'), draft);
    await f.store.mergeReports('demo-citizen', [delivered(immutableInput(report), 3)]);
    await f.store.mergeReports('demo-citizen', [delivered(immutableInput(report), 1)]);
    const saved = (await f.store.reports('demo-citizen'))[0];
    expect(saved.receipt_token).toBe(report.receipt_token); expect(saved.version).toBe(3);
    expect(exportRelay(saved)).not.toContain('receipt_token'); f.db.close();
  });
  it('accepts equivalent server timestamp formatting and canonical text normalization', async () => {
    const f = fixture(); await f.store.initialize();
    const report = await f.store.createReport(demoUser('citizen'), { ...draft, description: `  ${draft.description}  `, location: { ...draft.location, label: ' Shelter gate ' } });
    const server = delivered({ ...immutableInput(report), created_at: report.created_at.replace('.000Z', '+00:00') });
    await f.store.mergeReports('demo-citizen', [server]);
    expect((await f.store.reports('demo-citizen'))[0].delivery_state).toBe('delivered');
    expect(report.description).toBe(draft.description); expect(report.location.label).toBe('Shelter gate'); f.db.close();
  });
  it('projects versions for offline sequences, including a note before a status update', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('responder');
    const own = await f.store.createReport(demoUser('citizen'), draft), server = delivered(immutableInput(own), 4);
    await f.store.mergeReports(user.id, [{ ...server, assigned_to: user.id, mission_status: 'assigned' }]);
    await f.store.enqueueAction(user, 'mission.status', server.id, { status: 'accepted', expected_version: 4 });
    await f.store.enqueueAction(user, 'mission.note', server.id, { text: 'Approaching from east' });
    await f.store.enqueueAction(user, 'mission.status', server.id, { status: 'en_route', expected_version: 4 });
    const queue = await f.store.queue(user.id);
    expect(queue[0].payload.expected_version).toBe(4); expect(queue[2].payload.expected_version).toBe(6);
    expect((await f.store.reports(user.id))[0].mission_status).toBe('assigned'); f.db.close();
  });
  it('removes a revoked mission on authoritative refresh but retains its unsent note visibly', async () => {
    const f = fixture(); await f.store.initialize(); const user = demoUser('responder');
    const own = await f.store.createReport(demoUser('citizen'), draft), server = delivered(immutableInput(own));
    await f.store.mergeReports(user.id, [{ ...server, assigned_to: user.id, mission_status: 'assigned' }]);
    await f.store.enqueueAction(user, 'mission.note', server.id, { text: 'Offline field observation' });
    await f.store.refreshReports(user, []);
    expect(await f.store.reports(user.id)).toHaveLength(0);
    const queue = await f.store.queue(user.id); expect(queue[0].status).toBe('blocked'); expect(queue[0].payload.text).toBe('Offline field observation'); f.db.close();
  });
  it('seeds read-only synthetic examples without queueing fabricated incidents', async () => {
    const f = fixture(); await f.store.initialize(); await f.store.seed(demoUser('coordinator'));
    expect(await f.store.queue('demo-coordinator')).toHaveLength(0);
    const report = (await f.store.reports('demo-coordinator'))[0]; expect(report.source).toBe('seed');
    await expect(f.store.enqueueAction(demoUser('coordinator'), 'report.review', report.id, {})).rejects.toThrow('synthetic preview');
    expect(() => exportRelay(report)).toThrow('Synthetic'); f.db.close();
  });
  it('preserves offline records, ownership proofs and event IDs when connecting to a known workspace', async () => {
    const source = fixture(), target = fixture(); await source.store.initialize(); await target.store.initialize();
    const created = await source.store.createReport(demoUser('citizen'), draft);
    const item = (await source.store.queue('demo-citizen'))[0];
    await target.store.adoptPendingWorkspace(source.store);
    await target.store.adoptPendingWorkspace(source.store);
    expect(await target.store.reports('demo-citizen')).toEqual([created]);
    expect((await target.store.queue('demo-citizen')).map(row => row.id)).toEqual([item.id]);
    expect((await target.store.reports('demo-citizen'))[0].delivery_state).toBe('pending');
    expect(await source.store.queue('demo-citizen')).toHaveLength(1);
    source.db.close(); target.db.close();
  });
  it('rolls back an offline workspace copy when a colliding report has different content', async () => {
    const source = fixture(), target = fixture(); await source.store.initialize(); await target.store.initialize();
    await source.store.createReport(demoUser('citizen'), draft);
    const existing = await target.store.createReport(demoUser('citizen'), { ...draft, description: 'Different report with deterministic fixture ID' });
    await expect(target.store.adoptPendingWorkspace(source.store)).rejects.toThrow('conflicts');
    expect(await target.store.reports('demo-citizen')).toEqual([existing]);
    expect(await target.store.queue('demo-citizen')).toHaveLength(1);
    source.db.close(); target.db.close();
  });
  it('rejects a stale human review baseline rather than replacing it with the current version', async () => {
    const f = fixture(); await f.store.initialize();
    const own = await f.store.createReport(demoUser('citizen'), draft);
    await f.store.mergeReports('demo-coordinator', [delivered(immutableInput(own), 3)]);
    await expect(f.store.enqueueAction(demoUser('coordinator'), 'report.review', own.id, { expected_version: 2, verification: 'verified', urgency: 'high', urgency_reasons: ['Old observation'], acknowledge: true })).rejects.toThrow('Report changed');
    expect(await f.store.queue('demo-coordinator')).toHaveLength(0); f.db.close();
  });
});
