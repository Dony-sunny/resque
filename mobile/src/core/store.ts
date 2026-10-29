import type { Config, Details, EventKind, QueueItem, Report, ReportDraft, ReportInput, Role, ServerReport, User } from './types';
import { immutableInput, parseRelay, validateDraft } from './relay';

export interface SqlConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: any[]): Promise<any>;
  getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
}
export interface SqlDatabase extends SqlConnection { withExclusiveTransactionAsync(task: (tx: SqlConnection) => Promise<void>): Promise<void> }
export interface StoreDependencies { id(): string; token(): string; hash(text: string): Promise<string>; now?(): number }
export const demoUser = (role: Role): User => ({ id: `demo-${role}`, name: ({ citizen: 'Anu · Citizen', volunteer: 'Maya · Volunteer', coordinator: 'Arun · Government', responder: 'Nila · Rescue Team Alpha', relief: 'Riya · Food & Relief' })[role], role });
export const DEFAULT_CONFIG: Config = { apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000', language: 'en', forceOffline: false, smsNumber: process.env.EXPO_PUBLIC_SMS_NUMBER || '' };
const baseReport = (input: ReportInput, source: Report['source']): Report => ({ ...input, source, delivery_state: 'pending', verification: 'unverified', urgency: null, urgency_reasons: [], assigned_to: null, mission_status: 'unassigned', updated_at: input.created_at, version: 0, notes: [], audit: [] });
/** Whitelist and bound progressive SOS details before they are queued. */
export function cleanDetails(value: Details): Details {
  const count = (n: unknown) => Math.max(0, Math.min(10000, Math.floor(Number(n) || 0)));
  const people = value.people || ({} as Details['people']);
  const needs = ['rescue', 'ambulance', 'medical', 'food', 'water', 'medicine', 'shelter'];
  return { people: { trapped: count(people.trapped), injured: count(people.injured), children: count(people.children), elderly: count(people.elderly), disabled: count(people.disabled) },
    life_threat: !!value.life_threat, assistance: [...new Set((value.assistance || []).filter(a => needs.includes(a)))] as Details['assistance'] };
}
const sameInput = (a: ReportInput, b: ReportInput) => JSON.stringify(immutableInput(a)) === JSON.stringify(immutableInput(b));

export class LocalStore {
  private tail: Promise<unknown> = Promise.resolve();
  private now: () => number;
  constructor(private db: SqlDatabase, private deps: StoreDependencies) { this.now = deps.now || Date.now; }
  async initialize(): Promise<void> {
    await this.db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (user_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,id));
      CREATE TABLE IF NOT EXISTS outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE, report_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS outbox_user ON outbox(user_id,sequence);
      PRAGMA user_version=1;`);
  }
  private atomic<T>(task: (tx: SqlConnection) => Promise<T>): Promise<T> {
    let result: T;
    const run = this.tail.then(() => this.db.withExclusiveTransactionAsync(async tx => { result = await task(tx); })).then(() => result!);
    this.tail = run.catch(() => undefined);
    return run;
  }
  async config(): Promise<Config> {
    const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key=?', 'config');
    return { ...DEFAULT_CONFIG, ...(row ? JSON.parse(row.value) : {}) };
  }
  async setConfig(partial: Partial<Config>): Promise<void> {
    await this.atomic(async tx => {
      const old = await tx.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key=?', 'config');
      const value = { ...DEFAULT_CONFIG, ...(old ? JSON.parse(old.value) : {}), ...partial };
      await tx.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'config', JSON.stringify(value));
    });
  }
  async metadata<T>(key: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key=?', `meta:${key}`);
    return row ? JSON.parse(row.value) as T : null;
  }
  async setMetadata<T>(key: string, value: T): Promise<void> {
    await this.atomic(tx => tx.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', `meta:${key}`, JSON.stringify(value)));
  }
  async hasConfirmedData(): Promise<boolean> {
    const rows = await this.db.getAllAsync<{ data: string }>('SELECT data FROM reports');
    return rows.some(row => { const report = JSON.parse(row.data) as Report; return report.source !== 'seed' && report.delivery_state !== 'pending'; });
  }
  /** Copy never-confirmed offline work into a known authority without changing IDs.
   * The source remains intact; retrying either copy against the same authority is idempotent. */
  async adoptPendingWorkspace(source: LocalStore): Promise<void> {
    if (await source.hasConfirmedData()) throw new Error('Confirmed reports cannot be moved to a different backend workspace.');
    const reports = (await source.db.getAllAsync<{ user_id: string; data: string }>('SELECT user_id,data FROM reports')).filter(row => (JSON.parse(row.data) as Report).source !== 'seed');
    const queue = await source.db.getAllAsync<{ user_id: string; data: string }>('SELECT user_id,data FROM outbox ORDER BY sequence');
    await this.atomic(async tx => {
      for (const row of reports) {
        const incoming = JSON.parse(row.data) as Report;
        const saved = await tx.getFirstAsync<{ data: string }>('SELECT data FROM reports WHERE user_id=? AND id=?', row.user_id, incoming.id);
        if (!saved) await this.putReport(tx, row.user_id, incoming);
        else {
          const old = JSON.parse(saved.data) as Report;
          if (!sameInput(old, incoming)) throw new Error('An offline report conflicts with the destination workspace. No reports were moved.');
          if (incoming.receipt_token && !old.receipt_token) await this.putReport(tx, row.user_id, { ...old, receipt_token: incoming.receipt_token });
        }
      }
      for (const row of queue) {
        const incoming = JSON.parse(row.data) as QueueItem;
        const saved = await tx.getFirstAsync<{ user_id: string; data: string }>('SELECT user_id,data FROM outbox WHERE id=?', incoming.id);
        if (saved) {
          const old = JSON.parse(saved.data) as QueueItem;
          const content = (item: QueueItem) => JSON.stringify({ id: item.id, kind: item.kind, report_id: item.report_id, payload: item.payload });
          if (saved.user_id !== row.user_id || content(old) !== content(incoming)) throw new Error('An offline event conflicts with the destination workspace. No reports were moved.');
        } else await this.putQueue(tx, row.user_id, incoming);
      }
    });
  }
  async reports(userId: string): Promise<Report[]> {
    const rows = await this.db.getAllAsync<{ data: string }>('SELECT data FROM reports WHERE user_id=? ORDER BY id', userId);
    return rows.map(row => JSON.parse(row.data) as Report).sort((a,b) => b.created_at.localeCompare(a.created_at));
  }
  async queue(userId: string): Promise<QueueItem[]> {
    return (await this.db.getAllAsync<{ data: string }>('SELECT data FROM outbox WHERE user_id=? ORDER BY sequence', userId)).map(row => JSON.parse(row.data));
  }
  private async putReport(tx: SqlConnection, userId: string, report: Report): Promise<void> {
    await tx.runAsync('INSERT OR REPLACE INTO reports(user_id,id,data) VALUES(?,?,?)', userId, report.id, JSON.stringify(report));
  }
  private async putQueue(tx: SqlConnection, userId: string, item: QueueItem): Promise<void> {
    // UPDATE preserves sequence; INSERT OR REPLACE would move a retried event behind its dependents.
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM outbox WHERE user_id=? AND id=?', userId, item.id);
    if (existing) await tx.runAsync('UPDATE outbox SET data=? WHERE user_id=? AND id=?', JSON.stringify(item), userId, item.id);
    else await tx.runAsync('INSERT INTO outbox(user_id,id,report_id,data) VALUES(?,?,?,?)', userId, item.id, item.report_id, JSON.stringify(item));
  }
  private event(kind: EventKind, reportId: string, payload: Record<string, unknown>): QueueItem {
    return { id: this.deps.id(), kind, report_id: reportId, payload, status: 'pending', attempts: 0, next_attempt_at: 0, last_error: null, created_at: new Date(this.now()).toISOString() };
  }
  async createReport(user: User, draft: ReportDraft): Promise<Report> {
    if (!['citizen', 'volunteer'].includes(user.role)) throw new Error('This role cannot create reports.');
    const checked = validateDraft(draft), token = this.deps.token();
    const input: ReportInput = { ...checked, id: this.deps.id(), origin_id: user.id, created_at: new Date(this.now()).toISOString(), receipt_hash: await this.deps.hash(token) };
    const details = draft.details ? cleanDetails(draft.details) : undefined;
    const report = { ...baseReport(input, user.role === 'citizen' ? 'own' : 'collected'), ...(user.role === 'citizen' ? { receipt_token: token } : {}), ...(details ? { details } : {}) };
    const payload = { ...input, ...(user.role === 'citizen' ? { receipt_token: token } : {}), ...(details ? { details } : {}) };
    await this.atomic(async tx => { await this.putReport(tx, user.id, report); await this.putQueue(tx, user.id, this.event('report.create', report.id, payload)); });
    return report;
  }
  async importRelay(user: User, value: string): Promise<{ imported: boolean; report: Report }> {
    if (user.role !== 'volunteer') throw new Error('Only volunteers can import relay reports.');
    const input = parseRelay(value);
    return this.atomic(async tx => {
      const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM reports WHERE user_id=? AND id=?', user.id, input.id);
      if (row) {
        const existing = JSON.parse(row.data) as Report;
        if (!sameInput(existing, input)) throw new Error('This report ID already exists with different content. Import stopped.');
        return { imported: false, report: existing };
      }
      const report = baseReport(input, 'relayed');
      await this.putReport(tx, user.id, report);
      await this.putQueue(tx, user.id, this.event('report.create', report.id, { ...input }));
      return { imported: true, report };
    });
  }
  async enqueueAction(user: User, kind: EventKind, reportId: string, payload: Record<string, unknown>): Promise<void> {
    const allowed = ({ coordinator: ['report.review', 'report.assign', 'report.link_duplicate', 'report.details', 'relief.request'], responder: ['mission.status', 'mission.note', 'mission.request'],
      citizen: ['report.details', 'relief.request'], volunteer: ['report.details', 'relief.request'], relief: [] } as Record<Role, EventKind[]>)[user.role];
    if (!allowed.includes(kind)) throw new Error('This role cannot perform this action.');
    await this.atomic(async tx => {
      const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM reports WHERE user_id=? AND id=?', user.id, reportId);
      if (!row) throw new Error('Report is not available on this device.');
      const report = JSON.parse(row.data) as Report;
      if (report.source === 'seed') throw new Error('This is a synthetic preview. Connect to the seeded demo backend to take actions.');
      if (payload.expected_version !== undefined && payload.expected_version !== report.version) throw new Error('Report changed since this form was opened. Refresh and review the latest state before saving.');
      const prior = (await tx.getAllAsync<{ data: string }>('SELECT data FROM outbox WHERE user_id=? AND report_id=? ORDER BY sequence', user.id, reportId)).map(saved => JSON.parse(saved.data) as QueueItem);
      if (prior.some(item => item.status === 'blocked' || item.status === 'conflict')) throw new Error('Resolve or dismiss the earlier blocked action before queueing more changes for this report.');
      if (kind === 'report.details') payload = cleanDetails(payload as unknown as Details) as unknown as Record<string, unknown>;
      if (kind === 'mission.request' || kind === 'relief.request') payload = { ...payload, id: payload.id || this.deps.id() };
      if (kind === 'mission.note') {
        if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 1500) throw new Error('Note must contain 1–1,500 characters.');
        payload = { ...payload, text: payload.text.trim(), id: payload.id || this.deps.id(), created_at: payload.created_at || new Date(this.now()).toISOString() };
      }
      // Backend contract: each distinct applied mutation advances version by exactly one.
      // Compute while holding the same transaction as enqueue. Frozen event bodies are never rebased during retry.
      if (['report.review', 'report.assign', 'mission.status'].includes(kind)) payload = { ...payload, expected_version: report.version + prior.length };
      await this.putQueue(tx, user.id, this.event(kind, reportId, payload));
    });
  }
  async settle(userId: string, item: QueueItem, report?: ServerReport): Promise<void> {
    await this.atomic(async tx => {
      if (report) await this.mergeOne(tx, userId, report);
      await tx.runAsync('DELETE FROM outbox WHERE user_id=? AND id=?', userId, item.id);
    });
  }
  private async mergeOne(tx: SqlConnection, userId: string, incoming: ServerReport): Promise<void> {
    const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM reports WHERE user_id=? AND id=?', userId, incoming.id);
    const old: Report | undefined = row ? JSON.parse(row.data) : undefined;
    if (old && old.source !== 'seed' && !sameInput(old, incoming)) throw new Error('Server report identity does not match the saved report.');
    // A stale pull or duplicate receipt cannot move a newer local server snapshot backwards.
    if (old && old.source !== 'seed' && old.version > incoming.version) return;
    await this.putReport(tx, userId, { ...incoming, source: old && old.source !== 'seed' ? old.source : 'server', ...(old?.receipt_token ? { receipt_token: old.receipt_token } : {}) });
  }
  async mergeReports(userId: string, reports: ServerReport[]): Promise<void> {
    await this.atomic(async tx => { for (const report of reports) await this.mergeOne(tx, userId, report); });
  }
  async refreshReports(user: User, reports: ServerReport[]): Promise<void> {
    await this.atomic(async tx => {
      for (const report of reports) await this.mergeOne(tx, user.id, report);
      if (user.role !== 'responder') return;
      const visible = new Set(reports.map(report => report.id));
      const cached = await tx.getAllAsync<{ id: string }>('SELECT id FROM reports WHERE user_id=?', user.id);
      for (const row of cached) {
        if (visible.has(row.id)) continue;
        await tx.runAsync('DELETE FROM reports WHERE user_id=? AND id=?', user.id, row.id);
        const queued = await tx.getAllAsync<{ data: string }>('SELECT data FROM outbox WHERE user_id=? AND report_id=?', user.id, row.id);
        for (const saved of queued) {
          const item: QueueItem = JSON.parse(saved.data);
          await this.putQueue(tx, user.id, { ...item, status: 'blocked', last_error: 'This mission is no longer assigned to you. The unsent action or note is retained on this device for review.' });
        }
      }
    });
  }
  async updateQueue(userId: string, item: QueueItem): Promise<void> { await this.atomic(tx => this.putQueue(tx, userId, item)); }
  async retry(userId: string, eventId: string): Promise<void> {
    const item = (await this.queue(userId)).find(row => row.id === eventId);
    if (!item) return;
    if (item.status === 'blocked' || item.status === 'conflict') throw new Error('Refresh the report, dismiss this action, and submit a corrected action.');
    await this.updateQueue(userId, { ...item, status: 'pending', next_attempt_at: 0, last_error: null });
  }
  async discard(userId: string, eventId: string): Promise<void> {
    await this.atomic(async tx => {
      const row = await tx.getFirstAsync<{ data: string }>('SELECT data FROM outbox WHERE user_id=? AND id=?', userId, eventId);
      if (!row) return;
      const event: QueueItem = JSON.parse(row.data);
      if (event.kind === 'report.create') throw new Error('Unsent SOS reports are retained. Fix connectivity or relay the report.');
      await tx.runAsync('DELETE FROM outbox WHERE user_id=? AND id=?', userId, eventId);
    });
  }
  async seed(user: User): Promise<void> {
    const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];
    const samples: Report[] = [
      { ...baseReport({ id: ids[0], incident_type: 'flood', affected_count: 6, description: 'SYNTHETIC · Six people waiting upstairs near the canal. Road access reported blocked.', location: { label: 'Demo · Canal Road, Kochi', latitude: 9.9816, longitude: 76.2999 }, created_at: '2026-10-29T07:40:00Z', origin_id: 'demo-citizen', receipt_hash: '0'.repeat(64) }, 'seed'), urgency: 'high', urgency_reasons: ['Synthetic example: access blocked; coordinator review required.'] },
      { ...baseReport({ id: ids[1], incident_type: 'medical', affected_count: 1, description: 'SYNTHETIC · One person requesting a medical team at the relief shelter.', location: { label: 'Demo · School shelter', latitude: 9.965, longitude: 76.283 }, created_at: '2026-10-29T07:35:00Z', origin_id: 'demo-citizen', receipt_hash: '0'.repeat(64) }, 'seed'), urgency: 'critical', assigned_to: 'demo-responder', mission_status: 'assigned' },
      { ...baseReport({ id: ids[2], incident_type: 'supplies', affected_count: 12, description: 'SYNTHETIC · Drinking water requested by a group at the community hall.', location: { label: 'Demo · Community hall', latitude: null, longitude: null }, created_at: '2026-10-29T07:20:00Z', origin_id: 'demo-citizen', receipt_hash: '0'.repeat(64) }, 'seed'), urgency: 'medium' },
    ];
    await this.atomic(async tx => {
      for (const report of samples) {
        if (user.role === 'responder' && report.assigned_to !== user.id) continue;
        const old = await tx.getFirstAsync('SELECT id FROM reports WHERE user_id=? AND id=?', user.id, report.id);
        if (!old) await this.putReport(tx, user.id, report);
      }
    });
  }
}
