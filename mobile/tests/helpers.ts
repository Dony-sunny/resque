import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { LocalStore, type SqlConnection, type SqlDatabase } from '../src/core/store';
import type { ReportDraft, ReportInput, ServerReport } from '../src/core/types';

export class TestDatabase implements SqlDatabase {
  readonly native: DatabaseSync;
  failOutbox = false;
  failDelete = false;
  constructor(path = ':memory:') { this.native = new DatabaseSync(path); }
  async execAsync(sql: string) { this.native.exec(sql); }
  async runAsync(sql: string, ...params: any[]) {
    if (this.failOutbox && sql.startsWith('INSERT INTO outbox')) throw new Error('Simulated full disk');
    if (this.failDelete && sql.startsWith('DELETE FROM outbox')) throw new Error('Simulated process failure before receipt commit');
    return this.native.prepare(sql).run(...params);
  }
  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> { return (this.native.prepare(sql).get(...params) as T) || null; }
  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> { return this.native.prepare(sql).all(...params) as T[]; }
  async withExclusiveTransactionAsync(task: (tx: SqlConnection) => Promise<void>) {
    this.native.exec('BEGIN IMMEDIATE');
    try { await task(this); this.native.exec('COMMIT'); } catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}
export const draft: ReportDraft = { incident_type: 'flood', affected_count: 3, description: 'Three people waiting at the shelter gate.', location: { label: 'Shelter gate', latitude: null, longitude: null } };
export const hash = (value: string) => Promise.resolve(createHash('sha256').update(value).digest('hex'));
export function fixture() {
  let sequence = 0, time = Date.parse('2026-10-29T09:00:00Z');
  const db = new TestDatabase();
  const deps = { id: () => `20000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`, token: () => 'a'.repeat(64), hash, now: () => time };
  const store = new LocalStore(db, deps);
  return { db, store, deps, now: () => time, advance: (amount: number) => { time += amount; } };
}
export function delivered(input: ReportInput, version = 1): ServerReport {
  return { ...input, delivery_state: 'delivered', verification: 'unverified', urgency: null, urgency_reasons: [], assigned_to: null, mission_status: 'unassigned', updated_at: input.created_at, version, notes: [], audit: [] };
}
