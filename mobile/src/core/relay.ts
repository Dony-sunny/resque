import type { Report, ReportDraft, ReportInput } from './types';

export const MAX_RELAY_BYTES = 1900;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set(['flood', 'landslide', 'fire', 'earthquake', 'cyclone', 'medical', 'trapped', 'supplies', 'other']);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, name: string): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new Error(`Invalid ${name}.`);
  return value.trim();
}
export function validateDraft(value: unknown): ReportDraft {
  const data = record(value), location = record(data.location);
  if (!kinds.has(data.incident_type as string)) throw new Error('Choose a valid incident type.');
  if (!Number.isInteger(data.affected_count) || Number(data.affected_count) < 1 || Number(data.affected_count) > 10000) throw new Error('Affected count must be 1–10,000.');
  const latitude = location.latitude, longitude = location.longitude;
  const bothNull = latitude === null && longitude === null;
  if (!bothNull && !(typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180)) throw new Error('Use a complete, valid coordinate pair.');
  const label = text(location.label, 1, 160, 'location label');
  return { incident_type: data.incident_type as ReportDraft['incident_type'], affected_count: Number(data.affected_count), description: text(data.description, 1, 500, 'description'), location: { label, latitude: latitude as number | null, longitude: longitude as number | null } };
}
export function immutableInput(value: ReportInput): ReportInput {
  return { ...validateDraft(value), id: value.id.toLowerCase(), created_at: new Date(value.created_at).toISOString(), origin_id: value.origin_id.trim(), receipt_hash: value.receipt_hash };
}
export function validateReportInput(value: unknown): ReportInput {
  const data = record(value), draft = validateDraft(value);
  if (typeof data.id !== 'string' || !uuid.test(data.id)) throw new Error('Invalid report ID.');
  if (typeof data.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(data.created_at) || !Number.isFinite(Date.parse(data.created_at))) throw new Error('Invalid report time.');
  if (typeof data.receipt_hash !== 'string' || !/^[0-9a-f]{64}$/.test(data.receipt_hash)) throw new Error('Invalid receipt hash.');
  return { ...draft, id: data.id.toLowerCase(), created_at: new Date(data.created_at).toISOString(), origin_id: text(data.origin_id, 1, 100, 'origin ID'), receipt_hash: data.receipt_hash };
}
export function utf8Bytes(value: string): number {
  // TextEncoder is not available on every React Native runtime.
  return unescape(encodeURIComponent(value)).length;
}
export function exportRelay(report: Report): string {
  if (report.source === 'seed') throw new Error('Synthetic examples cannot be relayed. Create a real demo report first.');
  const value = JSON.stringify({ format: 'resq-relay', version: 1, report: validateReportInput(immutableInput(report)) });
  if (utf8Bytes(value) > MAX_RELAY_BYTES) throw new Error('Report is too large for one QR. Shorten the description before creating a new report.');
  return value;
}
export function parseRelay(value: string): ReportInput {
  if (typeof value !== 'string' || value.length > MAX_RELAY_BYTES || utf8Bytes(value) > MAX_RELAY_BYTES) throw new Error('QR is too large. One report per QR is supported.');
  let data: Record<string, unknown>;
  try { data = record(JSON.parse(value)); } catch { throw new Error('This is not a valid ResQ Relay QR.'); }
  if (data.format !== 'resq-relay' || data.version !== 1) throw new Error('Unsupported QR format or version.');
  // Whitelist input fields: QR cannot import a delivery state, role, review, token, or assignment.
  return validateReportInput(data.report);
}
