import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendHealth, ServerReport, SyncEvent } from '../src/core/types';
import { draft, delivered } from './helpers';
import type { TestDatabase } from './helpers';

const native = vi.hoisted(() => ({ databases: new Map<string, TestDatabase>(), secrets: new Map<string, string>() }));
vi.mock('expo-sqlite', async () => {
  const { TestDatabase } = await import('./helpers');
  return { openDatabaseAsync: async (name: string) => {
    if (!native.databases.has(name)) native.databases.set(name, new TestDatabase());
    return native.databases.get(name);
  } };
});
vi.mock('expo-crypto', async () => {
  const crypto = await import('node:crypto');
  return { randomUUID: crypto.randomUUID, getRandomBytes: crypto.randomBytes, CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: async (_algorithm: string, value: string) => crypto.createHash('sha256').update(value).digest('hex') };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => native.secrets.get(key) || null,
  setItemAsync: async (key: string, value: string) => { native.secrets.set(key, value); },
  deleteItemAsync: async (key: string) => { native.secrets.delete(key); },
}));

const backendId = '50000000-0000-4000-8000-000000000001';
const otherId = '50000000-0000-4000-8000-000000000002';
const lan = 'http://192.168.1.20:8000', tunnel = 'https://exercise.example.org';
let service: typeof import('../src/core/services');
let health: BackendHealth;
let unavailable: string | null;
let uploads: SyncEvent[];
let reports: ServerReport[];

beforeEach(async () => {
  vi.resetModules();
  native.secrets.clear();
  health = { status: 'ok', demo_mode: true, backend_id: backendId, demo_access_key_required: true };
  unavailable = null; uploads = []; reports = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    if (unavailable && input.startsWith(unavailable)) throw new Error('Network request failed');
    const path = new URL(input).pathname;
    if (path === '/v1/health') return Response.json(health);
    if (path === '/v1/auth/demo') {
      const headers = init.headers as Record<string, string>;
      if (headers['X-Demo-Key'] !== 'training-key') return Response.json({ detail: 'Demo access key required' }, { status: 403 });
      const role = JSON.parse(init.body as string).role;
      return Response.json({ access_token: `token-${role}`, user: { id: `demo-${role}`, role, name: role } });
    }
    if (path === '/v1/me') return Response.json({ id: 'demo-citizen', role: 'citizen', name: 'Citizen' });
    if (path === '/v1/sync') {
      const events = JSON.parse(init.body as string).events as SyncEvent[];
      uploads.push(...events);
      return Response.json({ results: events.map(event => {
        const { receipt_token: _private, ...input } = event.payload;
        const report = delivered(input as unknown as ServerReport);
        reports = [report];
        return { event_id: event.id, status: 'applied', report };
      }) });
    }
    if (path === '/v1/reports') return Response.json(reports);
    return Response.json({ detail: 'Unknown endpoint' }, { status: 404 });
  }));
  service = await import('../src/core/services');
});
afterEach(() => {
  for (const db of native.databases.values()) db.close();
  native.databases.clear(); vi.unstubAllGlobals();
});

describe('native service facade with real SQLite storage', () => {
  it('keeps the original offline workspace when a protected server key is missing', async () => {
    const created = await service.createReport('citizen', draft);
    const previous = (await service.loadConfig()).apiUrl;
    await expect(service.setConfig({ apiUrl: lan })).rejects.toThrow('demo access key');
    expect((await service.loadConfig()).apiUrl).toBe(previous);
    expect((await service.loadReports('citizen'))[0]).toEqual(created);
    expect(await service.loadQueue('citizen')).toHaveLength(1);
  });
  it('keeps an offline SOS when the first LAN endpoint is configured and secures the enrollment key', async () => {
    await service.setConfig({ forceOffline: true });
    const created = await service.createReport('citizen', draft);
    const pending = (await service.loadQueue('citizen'))[0];
    await service.setConfig({ apiUrl: lan, demoAccessKey: 'training-key' });
    expect((await service.loadConfig()).apiUrl).toBe(lan);
    expect(await service.loadReports('citizen')).toEqual([created]);
    expect((await service.loadQueue('citizen'))[0].id).toBe(pending.id);
    const settings = native.databases.get('resq-relay-settings-v1.db')!;
    const saved = settings.native.prepare('SELECT value FROM settings').all();
    expect(JSON.stringify(saved)).not.toContain('training-key');
    expect(native.secrets.get('resq-relay-demo-access-key')).toBe('training-key');
    expect((await service.loadConnectionStatus()).state).toBe('paused');
  });
  it('uses the same authority for LAN and HTTPS aliases without losing confirmed data or pending relay IDs', async () => {
    await service.setConfig({ apiUrl: lan, demoAccessKey: 'training-key' });
    const created = await service.createReport('citizen', draft);
    await service.importRelay('volunteer', service.exportRelay(created));
    const relayEvent = (await service.loadQueue('volunteer'))[0];
    const result = await service.runSync('citizen', lan);
    expect(result.remaining, result.message).toBe(0);
    expect((await service.loadReports('citizen'))[0].delivery_state).toBe('delivered');
    await service.setConfig({ apiUrl: tunnel });
    expect((await service.loadReports('citizen'))[0].id).toBe(created.id);
    expect((await service.loadQueue('volunteer'))[0].id).toBe(relayEvent.id);
    const status = await service.loadConnectionStatus();
    expect(status.state).toBe('reachable'); expect(status.backend_id).toBe(backendId); expect(status.last_success_at).toBeTruthy();
  });
  it('does not change the configured endpoint or lose pending work when a new connection fails', async () => {
    await service.setConfig({ apiUrl: lan, demoAccessKey: 'training-key' });
    const created = await service.createReport('citizen', draft);
    unavailable = tunnel;
    await expect(service.setConfig({ apiUrl: tunnel })).rejects.toThrow('Network request failed');
    expect((await service.loadConfig()).apiUrl).toBe(lan);
    expect((await service.loadReports('citizen'))[0]).toEqual(created);
    expect(await service.loadQueue('citizen')).toHaveLength(1);
  });
  it('refuses to send existing authority events when the database identity at an address changes', async () => {
    await service.setConfig({ apiUrl: lan, demoAccessKey: 'training-key' });
    const created = await service.createReport('citizen', draft);
    health = { ...health, backend_id: otherId };
    const result = await service.runSync('citizen', lan);
    expect(result.backend_reachable).toBe(false); expect(result.message).toContain('identity');
    expect(uploads).toHaveLength(0); expect((await service.loadReports('citizen'))[0]).toEqual(created);
    expect((await service.loadConnectionStatus()).state).toBe('unreachable');
    await service.setConfig({ apiUrl: lan });
    expect(await service.loadReports('citizen')).toHaveLength(0);
    health = { ...health, backend_id: backendId };
    await service.setConfig({ apiUrl: lan });
    expect((await service.loadReports('citizen'))[0].id).toBe(created.id);
  });
});
