import { afterAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { LocalStore, demoUser } from '../src/core/store';
import { SyncEngine } from '../src/core/sync';
import { exportRelay } from '../src/core/relay';
import type { Role, ServerReport, SyncEvent, SyncResponse, Transport } from '../src/core/types';
import { hash, TestDatabase } from './helpers';

const baseUrl = process.env.RESQ_TEST_API_URL?.replace(/\/+$/, '');
describe.skipIf(!baseUrl)('real FastAPI ↔ mobile SQLite integration', () => {
  const database = new TestDatabase();
  const store = new LocalStore(database, { id: randomUUID, token: () => randomBytes(32).toString('hex'), hash });
  afterAll(() => database.close());
  async function transport(role: Role): Promise<Transport> {
    const accessKey = process.env.RESQ_TEST_DEMO_ACCESS_KEY;
    const login = await fetch(`${baseUrl}/v1/auth/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessKey ? { 'X-Demo-Key': accessKey } : {}) }, body: JSON.stringify({ role }) });
    if (!login.ok) throw new Error(`Demo login failed: ${login.status} ${await login.text()}`);
    const { access_token } = await login.json() as { access_token: string };
    const request = async <T>(path: string, events?: SyncEvent[]): Promise<T> => {
      const response = await fetch(`${baseUrl}/v1${path}`, { method: events ? 'POST' : 'GET', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, ...(events ? { body: JSON.stringify({ events }) } : {}) });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response.json() as Promise<T>;
    };
    return { sync: events => request<SyncResponse>('/sync', events), reports: () => request<ServerReport[]>('/reports') };
  }
  it('relays offline, claims ownership, queues review/assignment and sequential field progress, then receives audit history', async () => {
    await store.initialize();
    const engine = new SyncEngine(store);
    const citizen = demoUser('citizen'), volunteer = demoUser('volunteer'), coordinator = demoUser('coordinator'), responder = demoUser('responder');
    const created = await store.createReport(citizen, { incident_type: 'flood', affected_count: 3, description: '  SYNTHETIC automated integration report: three people waiting.  ', location: { label: '  Demo east shelter gate  ', latitude: 9.9816, longitude: 76.2999 } });
    expect(created.delivery_state).toBe('pending');
    const relay = exportRelay(created); expect(relay).not.toContain(created.receipt_token);
    expect((await store.importRelay(volunteer, relay)).imported).toBe(true);
    expect((await store.importRelay(volunteer, relay)).imported).toBe(false);
    const volunteerSync = await engine.run(volunteer, await transport('volunteer'));
    expect(volunteerSync.remaining, volunteerSync.message).toBe(0);
    expect((await store.reports(citizen.id)).find(row => row.id === created.id)?.delivery_state).toBe('pending');
    const citizenSync = await engine.run(citizen, await transport('citizen'));
    expect(citizenSync.remaining, citizenSync.message).toBe(0);
    const claimed = (await store.reports(citizen.id)).find(row => row.id === created.id)!;
    expect(claimed.delivery_state).toBe('delivered'); expect(claimed.receipt_token).toBe(created.receipt_token);
    expect(claimed.description).toBe(created.description); expect(claimed.location.label).toBe('Demo east shelter gate');

    const coordinatorApi = await transport('coordinator');
    await engine.run(coordinator, coordinatorApi);
    await store.enqueueAction(coordinator, 'report.review', created.id, { verification: 'verified', urgency: 'high', urgency_reasons: ['Human demo review: three people report flood isolation.'], acknowledge: true });
    await store.enqueueAction(coordinator, 'report.assign', created.id, { responder_id: responder.id });
    const coordinatorQueue = await store.queue(coordinator.id);
    expect(coordinatorQueue[1].payload.expected_version).toBe(Number(coordinatorQueue[0].payload.expected_version) + 1);
    const dispatch = await engine.run(coordinator, coordinatorApi);
    expect(dispatch.remaining, dispatch.message).toBe(0);

    const responderApi = await transport('responder');
    await engine.run(responder, responderApi);
    await store.enqueueAction(responder, 'mission.status', created.id, { status: 'accepted' });
    await store.enqueueAction(responder, 'mission.note', created.id, { text: 'SYNTHETIC offline field observation: approaching east entrance.' });
    await store.enqueueAction(responder, 'mission.status', created.id, { status: 'en_route' });
    await store.enqueueAction(responder, 'mission.status', created.id, { status: 'on_scene' });
    // A second service instance over the same durable DB simulates app restart before connectivity returns.
    const reopenedStore = new LocalStore(database, { id: randomUUID, token: () => randomBytes(32).toString('hex'), hash });
    const fieldSync = await new SyncEngine(reopenedStore).run(responder, responderApi);
    expect(fieldSync.remaining, fieldSync.message).toBe(0);
    const mission = (await reopenedStore.reports(responder.id)).find(row => row.id === created.id)!;
    expect(mission.mission_status).toBe('on_scene'); expect(mission.notes).toHaveLength(1);
    expect(mission.delivery_state).toBe('acknowledged'); expect(mission.audit.length).toBeGreaterThanOrEqual(6);
    expect(mission.urgency_reasons[0]).toContain('Human demo review');
  }, 30000);
});
