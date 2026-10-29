import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, normalizeApiUrl } from './api';
import { localAnswer, type AssistantReply } from './assistant';
import { LocalStore, demoUser } from './store';
import { SyncEngine } from './sync';
import type { AlertInput, AuthorityAlert, BackendHealth, Config, ConnectionStatus, EventKind, LocationFix, ReportDraft, Role, SyncSummary } from './types';
import type { SqlDatabase } from './store';
import { connectWorkspace, emptyWorkspaceIndex, resolveWorkspace, type WorkspaceIndex } from './workspace';
export { demoUser } from './store';
export { exportRelay } from './relay';
export type * from './types';

let settingsReady: Promise<LocalStore> | undefined;
const workspaces = new Map<string, Promise<{ local: LocalStore; engine: SyncEngine }>>();
const checking = new Set<string>();
let directoryTail: Promise<unknown> = Promise.resolve();
const DEMO_KEY_STORAGE = 'resq-relay-demo-access-key';
let memoryDemoKey: string | undefined;
const blankConnection = (): ConnectionStatus => ({ state: 'never', last_attempt_at: null, last_success_at: null, error: null, backend_id: null });
async function openLocal(filename: string): Promise<LocalStore> {
    const db = await SQLite.openDatabaseAsync(filename);
    const local = new LocalStore(db as unknown as SqlDatabase, { id: () => Crypto.randomUUID(), token: () => Array.from(Crypto.getRandomBytes(32), b => b.toString(16).padStart(2, '0')).join(''), hash: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value) });
    await local.initialize(); return local;
}
async function settings(): Promise<LocalStore> {
  if (!settingsReady) settingsReady = openLocal('resq-relay-settings-v1.db').catch(cause => { settingsReady = undefined; throw cause; });
  return settingsReady;
}
async function index(): Promise<WorkspaceIndex> { return (await settings()).metadata<WorkspaceIndex>('workspace-index').then(value => value || emptyWorkspaceIndex()); }
async function openWorkspace(key: string): Promise<{ local: LocalStore; engine: SyncEngine }> {
  let ready = workspaces.get(key);
  if (!ready) {
    ready = (async () => {
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
      const local = await openLocal(`resq-relay-v1-${hash.slice(0, 32)}.db`);
      return { local, engine: new SyncEngine(local) };
    })().catch(cause => { workspaces.delete(key); throw cause; });
    workspaces.set(key, ready);
  }
  return ready;
}
async function workspace(baseUrl?: string): Promise<{ local: LocalStore; engine: SyncEngine }> {
  const url = normalizeApiUrl(baseUrl || (await loadConfig()).apiUrl);
  return openWorkspace(resolveWorkspace(await index(), url));
}
async function store(): Promise<LocalStore> {
  return (await workspace()).local;
}
async function demoKey(): Promise<string> {
  if (memoryDemoKey !== undefined) return memoryDemoKey;
  try { memoryDemoKey = await SecureStore.getItemAsync(DEMO_KEY_STORAGE) || ''; }
  catch { memoryDemoKey = ''; }
  return memoryDemoKey;
}
async function saveDemoKey(value: string): Promise<void> {
  // A protected public demo must not silently lose its enrollment key after restart.
  if (value) await SecureStore.setItemAsync(DEMO_KEY_STORAGE, value);
  else await SecureStore.deleteItemAsync(DEMO_KEY_STORAGE);
  memoryDemoKey = value;
}
function serializedDirectory<T>(task: () => Promise<T>): Promise<T> {
  const result = directoryTail.then(task);
  directoryTail = result.catch(() => undefined);
  return result;
}
async function bindServer(currentUrl: string, nextUrl: string, health: BackendHealth, explicitSwitch: boolean): Promise<{ local: LocalStore; engine: SyncEngine }> {
  return serializedDirectory(async () => {
    const directory = await index(), currentKey = resolveWorkspace(directory, currentUrl);
    const current = await openWorkspace(currentKey);
    const known = directory.bindings[currentKey];
    if (!explicitSwitch && known && known !== health.backend_id) throw new Error('The backend identity at this address changed. Saved reports remain with the previous backend. Check and save the server address in Settings to select the new workspace.');
    const target = connectWorkspace(directory, currentUrl, nextUrl, health.backend_id, await current.local.hasConfirmedData());
    const selected = await openWorkspace(target.key);
    if (target.key !== currentKey && !known && !(await current.local.hasConfirmedData())) await selected.local.adoptPendingWorkspace(current.local);
    await (await settings()).setMetadata('workspace-index', target.index);
    return selected;
  });
}
export async function loadConfig(): Promise<Config> {
  const stored = await (await settings()).config();
  return { ...stored, demoAccessKey: await demoKey() };
}
export async function setConfig(partial: Partial<Config>): Promise<void> {
  const previous = await loadConfig();
  const nextKey = partial.demoAccessKey !== undefined ? partial.demoAccessKey.trim() : previous.demoAccessKey || '';
  if (partial.apiUrl !== undefined) {
    const nextUrl = normalizeApiUrl(partial.apiUrl);
    const api = new ApiClient(nextUrl, 'citizen', nextKey);
    const health = await api.health();
    if (health.status !== 'ok' || !health.demo_mode) throw new Error('This backend is not running the ResQ Relay demo. Check the server address and enable demo access.');
    if (health.demo_access_key_required && !nextKey) throw new Error('Enter the demo access key before connecting to this protected backend.');
    // Validate enrollment before moving the active URL or the offline workspace.
    await api.me();
    const selected = await bindServer(normalizeApiUrl(previous.apiUrl), nextUrl, health, true);
    await selected.local.setMetadata('connection', { state: 'reachable', last_attempt_at: new Date().toISOString(), last_success_at: new Date().toISOString(), error: null, backend_id: health.backend_id } satisfies ConnectionStatus);
    partial = { ...partial, apiUrl: nextUrl };
  }
  if (partial.demoAccessKey !== undefined) await saveDemoKey(nextKey);
  const { demoAccessKey: _secret, ...publicConfig } = partial;
  await (await settings()).setConfig(publicConfig);
}
export async function loadConnectionStatus(): Promise<ConnectionStatus> {
  const config = await loadConfig(), key = resolveWorkspace(await index(), normalizeApiUrl(config.apiUrl));
  const status = await (await openWorkspace(key)).local.metadata<ConnectionStatus>('connection') || blankConnection();
  return { ...status, state: config.forceOffline ? 'paused' : checking.has(key) ? 'checking' : status.state === 'checking' ? 'never' : status.state };
}
export async function loadReports(role: Role) { return (await store()).reports(demoUser(role).id); }
export async function loadQueue(role: Role) { return (await store()).queue(demoUser(role).id); }
export async function createReport(role: Role, draft: ReportDraft) { return (await store()).createReport(demoUser(role), draft); }
export async function enqueueAction(role: Role, kind: EventKind, reportId: string, payload: Record<string, unknown>) { return (await store()).enqueueAction(demoUser(role), kind, reportId, payload); }
export async function importRelay(role: Role, value: string) { return (await store()).importRelay(demoUser(role), value); }
export async function seedDemo(role: Role) { return (await store()).seed(demoUser(role)); }
export async function retryEvent(role: Role, eventId: string) { return (await store()).retry(demoUser(role).id, eventId); }
export async function discardEvent(role: Role, eventId: string) { return (await store()).discard(demoUser(role).id, eventId); }
export async function runSync(role: Role, baseUrl: string) {
  const config = await loadConfig(), url = normalizeApiUrl(baseUrl);
  let selected = await workspace(url), key = resolveWorkspace(await index(), url);
  const old = await selected.local.metadata<ConnectionStatus>('connection') || blankConnection();
  if (config.forceOffline) return { sent: 0, remaining: (await selected.local.queue(demoUser(role).id)).length, message: 'Offline practice is on. Reports are saved locally and have not been sent.', backend_reachable: false };
  checking.add(key);
  const attempted = new Date().toISOString();
  await selected.local.setMetadata('connection', { ...old, state: 'checking', last_attempt_at: attempted });
  try {
    const api = new ApiClient(url, role, config.demoAccessKey || '');
    const health = await api.health();
    if (health.status !== 'ok') throw new Error('Backend health check failed. Saved actions remain on this device.');
    selected = await bindServer(url, url, health, false);
    const nextKey = resolveWorkspace(await index(), url);
    checking.delete(key); key = nextKey; checking.add(key);
    const result = await selected.engine.run(demoUser(role), api);
    // Authority alerts ride along with every successful sync and stay readable offline.
    if (result.backend_reachable) {
      try { await selected.local.setMetadata('alerts', await api.alerts()); } catch { /* Keep the last alerts we had. */ }
    }
    const current = await selected.local.metadata<ConnectionStatus>('connection') || old;
    await selected.local.setMetadata('connection', { state: result.backend_reachable ? 'reachable' : 'unreachable', last_attempt_at: attempted, last_success_at: result.backend_reachable ? new Date().toISOString() : current.last_success_at, error: result.backend_reachable ? null : result.message, backend_id: health.backend_id } satisfies ConnectionStatus);
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : 'Connection failed. Saved reports remain on this device.';
    const current = await selected.local.metadata<ConnectionStatus>('connection') || old;
    await selected.local.setMetadata('connection', { ...current, state: 'unreachable', last_attempt_at: attempted, error } satisfies ConnectionStatus);
    return { sent: 0, remaining: (await selected.local.queue(demoUser(role).id)).length, message: error, backend_reachable: false } satisfies SyncSummary;
  } finally { checking.delete(key); }
}
export async function loadResponders(baseUrl: string) { return new ApiClient(baseUrl, 'coordinator', await demoKey()).responders(); }
/** Active alerts from the last successful sync; expired ones are hidden even offline. */
export async function loadAlerts(): Promise<AuthorityAlert[]> {
  const alerts = await (await store()).metadata<AuthorityAlert[]>('alerts') || [];
  return alerts.filter(alert => Date.parse(alert.expires_at) > Date.now());
}
export async function publishAlert(baseUrl: string, alert: AlertInput) {
  const config = await loadConfig();
  if (config.forceOffline) throw new Error('Turn off offline practice to publish an alert. Alerts need a server connection.');
  const created = await new ApiClient(baseUrl, 'coordinator', await demoKey()).publishAlert(alert);
  const local = await store();
  await local.setMetadata('alerts', [created, ...(await local.metadata<AuthorityAlert[]>('alerts') || []).filter(row => row.id !== created.id)]);
  return created;
}
/** Live operations data (teams, relief, stock, shelters, KPIs). Each successful read is cached per
 * server workspace, so the last known picture stays visible offline, clearly marked as cached. */
export interface Cached<T> { data: T; at: string | null; stale: boolean; error?: string }
export async function operations<T>(role: Role, name: string, read: (api: ApiClient) => Promise<T>): Promise<Cached<T>> {
  const config = await loadConfig(), local = await store(), key = `ops:${role}:${name}`;
  const cached = await local.metadata<{ data: T; at: string }>(key);
  if (config.forceOffline) return { data: cached?.data as T, at: cached?.at || null, stale: true, error: 'Offline practice is on. Showing the last saved copy.' };
  try {
    const data = await read(new ApiClient(config.apiUrl, role, config.demoAccessKey || ''));
    const at = new Date().toISOString();
    await local.setMetadata(key, { data, at });
    return { data, at, stale: false };
  } catch (cause) {
    return { data: cached?.data as T, at: cached?.at || null, stale: true, error: cause instanceof Error ? cause.message : 'Server unavailable.' };
  }
}
/** An operation that changes server state immediately (relief, stock, shelters, demo). Requires a connection. */
export async function act<T>(role: Role, run: (api: ApiClient) => Promise<T>): Promise<T> {
  const config = await loadConfig();
  if (config.forceOffline) throw new Error('Turn off offline practice. This action needs a server connection.');
  return run(new ApiClient(config.apiUrl, role, config.demoAccessKey || ''));
}
/** Asks the server assistant (role-scoped data, AI when configured); offline or on error, answers from the on-phone guide. */
export async function askAssistant(role: Role, message: string, reportId?: string): Promise<AssistantReply> {
  const config = await loadConfig();
  if (!config.forceOffline) {
    try { return await new ApiClient(config.apiUrl, role, config.demoAccessKey || '').ask(message, reportId); }
    catch { /* fall through to the offline guide */ }
  }
  return { ...localAnswer(message, role, await loadReports(role)), note: config.forceOffline ? 'Offline practice is on.' : 'Server unreachable.' };
}
export async function saveKitChecklist(items: number[]) { await (await settings()).setMetadata('kit-checklist', items); }
export async function loadKitChecklist(): Promise<number[]> { return await (await settings()).metadata<number[]>('kit-checklist') || []; }
/** IDs of official alerts already read on this device, so each pops up only once. */
export async function saveReadAlerts(ids: string[]) { await (await settings()).setMetadata('read-alerts', ids); }
export async function loadReadAlerts(): Promise<string[]> { return await (await settings()).metadata<string[]>('read-alerts') || []; }
/** Last good location fix, kept device-wide so a later SOS can fall back to it. */
export async function saveLastFix(fix: LocationFix) { await (await settings()).setMetadata('last-fix', fix); }
export async function loadLastFix(): Promise<LocationFix | null> { return (await settings()).metadata<LocationFix>('last-fix'); }
