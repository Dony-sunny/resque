import type { LocalStore } from './store';
import type { QueueItem, SyncEvent, SyncSummary, Transport, User } from './types';
import { confirmedReport } from './validation';

export function retryDelay(attempts: number): number { return Math.min(60000, 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6)); }
const wireEvent = ({ id, kind, report_id, payload }: QueueItem): SyncEvent => ({ id, kind, report_id, payload });

/** At-least-once delivery. Local deletion occurs only after a matching positive receipt. */
export class SyncEngine {
  private running = new Map<string, Promise<SyncSummary>>();
  constructor(private store: LocalStore, private clock: () => number = Date.now) {}
  run(user: User, api: Transport): Promise<SyncSummary> {
    const existing = this.running.get(user.id);
    if (existing) return existing;
    const task = this.perform(user, api).finally(() => this.running.delete(user.id));
    this.running.set(user.id, task);
    return task;
  }
  private async perform(user: User, api: Transport): Promise<SyncSummary> {
    let sent = 0, error = '', networkFailed = false, reachable = false;
    const stoppedReports = new Set<string>();
    const items = await this.store.queue(user.id);
    for (const item of items) {
      if (stoppedReports.has(item.report_id)) continue;
      if (['blocked', 'conflict'].includes(item.status) || item.next_attempt_at > this.clock()) { stoppedReports.add(item.report_id); continue; }
      try {
        const response = await api.sync([wireEvent(item)]);
        reachable = true;
        const result = response.results.find(row => row.event_id === item.id);
        if (!result) throw new Error('Server did not return a receipt for this action. It remains queued.');
        if (result.status === 'applied' || result.status === 'duplicate') {
          // Create receipts must include the stored report; an empty receipt never marks delivery.
          if (!result.report) throw new Error('Receipt omitted the report. The action remains pending.');
          const report = confirmedReport(result.report, item.report_id);
          await this.store.settle(user.id, item, report);
          sent++;
        } else {
          error = result.error || 'Action requires review.';
          await this.store.updateQueue(user.id, { ...item, status: result.status === 'conflict' ? 'conflict' : 'blocked', attempts: item.attempts + 1, last_error: error });
          stoppedReports.add(item.report_id);
          if (result.report) await this.store.mergeReports(user.id, [confirmedReport(result.report, item.report_id)]);
        }
      } catch (cause) {
        const attempts = item.attempts + 1;
        error = cause instanceof Error ? cause.message : 'Connection failed.';
        await this.store.updateQueue(user.id, { ...item, status: 'retry', attempts, next_attempt_at: this.clock() + retryDelay(attempts), last_error: error });
        networkFailed = true;
        reachable = false;
        break;
      }
    }
    if (!networkFailed) {
      try { await this.store.refreshReports(user, (await api.reports()).map(report => confirmedReport(report))); reachable = true; }
      catch (cause) { error = cause instanceof Error ? cause.message : 'Could not refresh reports.'; reachable = false; }
    }
    const remaining = (await this.store.queue(user.id)).length;
    return { sent, remaining, message: error || (remaining ? `${remaining} action(s) remain queued. Check retry or review status.` : 'Backend confirmed all queued actions. Feed refreshed.'), backend_reachable: reachable };
  }
}
