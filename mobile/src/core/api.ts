import * as SecureStore from 'expo-secure-store';
import type { AssistantReply } from './assistant';
import type { AlertInput, AuditRow, AuthorityAlert, BackendHealth, FacilityView, InventoryView, OpsSummary, ReliefRequestView, Role, ServerReport, ShelterView, SyncEvent, SyncResponse, TeamView, Transport, User } from './types';

export function normalizeApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Enter a complete http:// or https:// backend URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the backend base URL without credentials, query, or a path.');
  return url.origin;
}
interface Auth { access_token: string; user: User }
export class ApiClient implements Transport {
  readonly baseUrl: string;
  private token: string | null = null;
  private authPromise: Promise<string> | null = null;
  constructor(baseUrl: string, private role: Role, private demoAccessKey = '') { this.baseUrl = normalizeApiUrl(baseUrl); }
  private async request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(`${this.baseUrl}/v1${path}`, { ...options, signal: abort.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
      if (!response.ok) {
        let detail = '';
        try { const body = await response.json(); detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); } catch { /* Preserve status when proxy returns non-JSON. */ }
        const error = new Error(`${response.status}: ${detail || 'Backend request failed.'}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return await response.json() as T;
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') throw new Error('Backend timed out. Saved actions remain on this device.');
      throw cause;
    } finally { clearTimeout(timeout); }
  }
  private async authorize(): Promise<string> {
    if (this.token) return this.token;
    if (this.authPromise) return this.authPromise;
    this.authPromise = (async () => {
      const key = `resq-relay-token-${this.role}`;
      try {
        const stored = await SecureStore.getItemAsync(key);
        if (stored) {
          const saved = JSON.parse(stored) as { url: string; token: string };
          if (saved.url === this.baseUrl && saved.token) { this.token = saved.token; return saved.token; }
        }
      } catch { /* Unavailable secure store means session remains memory-only. */ }
      const auth = await this.request<Auth>('/auth/demo', { method: 'POST', body: JSON.stringify({ role: this.role }), headers: this.demoAccessKey ? { 'X-Demo-Key': this.demoAccessKey } : {} });
      if (auth.user.role !== this.role || auth.user.id !== `demo-${this.role}`) throw new Error('Unexpected demo account returned by backend.');
      this.token = auth.access_token;
      try { await SecureStore.setItemAsync(key, JSON.stringify({ url: this.baseUrl, token: this.token })); } catch { /* Memory-only session is safe for demo. */ }
      return this.token;
    })().finally(() => { this.authPromise = null; });
    return this.authPromise;
  }
  private async authenticated<T>(path: string, options?: RequestInit): Promise<T> {
    try { return await this.request<T>(path, options, await this.authorize()); }
    catch (cause) {
      if ((cause as { status?: number }).status !== 401) throw cause;
      this.token = null;
      try { await SecureStore.deleteItemAsync(`resq-relay-token-${this.role}`); } catch { /* No persisted token. */ }
      return this.request<T>(path, options, await this.authorize());
    }
  }
  sync(events: SyncEvent[]): Promise<SyncResponse> { return this.authenticated('/sync', { method: 'POST', body: JSON.stringify({ events }) }); }
  reports(): Promise<ServerReport[]> { return this.authenticated('/reports'); }
  responders(): Promise<User[]> { return this.authenticated('/responders'); }
  me(): Promise<User> { return this.authenticated('/me'); }
  alerts(): Promise<AuthorityAlert[]> { return this.authenticated('/alerts'); }
  publishAlert(alert: AlertInput): Promise<AuthorityAlert> { return this.authenticated('/alerts', { method: 'POST', body: JSON.stringify(alert) }); }
  private post<T>(path: string, body: unknown = {}): Promise<T> { return this.authenticated(path, { method: 'POST', body: JSON.stringify(body) }); }
  summary(): Promise<OpsSummary> { return this.authenticated('/ops/summary'); }
  teams(): Promise<TeamView[]> { return this.authenticated('/teams'); }
  recommendTeams(reportId: string): Promise<TeamView[]> { return this.authenticated(`/incidents/${reportId}/teams`); }
  setAvailability(teamId: string, onDuty: boolean): Promise<TeamView> { return this.post(`/teams/${teamId}/availability`, { on_duty: onDuty }); }
  reliefRequests(): Promise<ReliefRequestView[]> { return this.authenticated('/relief/requests'); }
  reliefAction(id: string, action: 'approve' | 'pack' | 'dispatch' | 'deliver' | 'cancel'): Promise<ReliefRequestView> { return this.post(`/relief/requests/${id}/${action}`); }
  inventory(): Promise<InventoryView[]> { return this.authenticated('/inventory'); }
  restock(key: string, quantity: number): Promise<InventoryView> { return this.post(`/inventory/${key}/restock`, { quantity }); }
  shelters(): Promise<ShelterView[]> { return this.authenticated('/shelters'); }
  setOccupancy(id: string, occupancy: number): Promise<ShelterView> { return this.post(`/shelters/${id}/occupancy`, { occupancy }); }
  escalate(reportId: string): Promise<ServerReport> { return this.post(`/incidents/${reportId}/escalate`); }
  auditLog(): Promise<AuditRow[]> { return this.authenticated('/audit'); }
  facilities(): Promise<FacilityView[]> { return this.authenticated('/facilities'); }
  releaseTeam(reportId: string): Promise<ServerReport> { return this.post(`/incidents/${reportId}/release`); }
  ask(message: string, reportId?: string): Promise<AssistantReply> { return this.post('/assistant', reportId ? { message, report_id: reportId } : { message }); }
  demoReset(): Promise<Record<string, number>> { return this.post('/demo/reset'); }
  demoSimulate(): Promise<{ created: string[]; advanced: { team: string; status: string }[] }> { return this.post('/demo/simulate'); }
  health(): Promise<BackendHealth> { return this.request('/health'); }
}
