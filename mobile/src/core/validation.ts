import { validateReportInput } from './relay';
import type { ServerReport } from './types';

/** Only a complete server snapshot with a confirmed delivery state can settle an event. */
export function confirmedReport(value: unknown, expectedId?: string): ServerReport {
  const input = validateReportInput(value);
  const data = value as ServerReport;
  if (expectedId && input.id !== expectedId) throw new Error('Server receipt refers to a different report. The action remains queued.');
  if (!['delivered', 'acknowledged'].includes(data.delivery_state)) throw new Error('Server did not confirm delivery.');
  if (!Number.isInteger(data.version) || data.version < 1) throw new Error('Invalid server report version.');
  if (!['unverified', 'verified', 'rejected'].includes(data.verification) || !['unassigned', 'assigned', 'accepted', 'en_route', 'on_scene', 'completed'].includes(data.mission_status)) throw new Error('Invalid server report status.');
  if (data.urgency !== null && !['low', 'medium', 'high', 'critical'].includes(data.urgency)) throw new Error('Invalid urgency.');
  if (!Array.isArray(data.urgency_reasons) || !data.urgency_reasons.every(reason => typeof reason === 'string') || !Array.isArray(data.notes) || !Array.isArray(data.audit)) throw new Error('Incomplete server report history.');
  if (data.assigned_to !== null && typeof data.assigned_to !== 'string') throw new Error('Invalid assignment.');
  if (!Number.isFinite(Date.parse(data.updated_at))) throw new Error('Invalid server update time.');
  return { ...input, delivery_state: data.delivery_state, verification: data.verification, mission_status: data.mission_status, urgency: data.urgency, urgency_reasons: data.urgency_reasons, assigned_to: data.assigned_to, version: data.version, updated_at: new Date(data.updated_at).toISOString(), notes: data.notes, audit: data.audit };
}
