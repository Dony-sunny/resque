import type { ReportInput } from './types';
import { immutableInput } from './relay';

/** SMS fallback wire format, decoded by backend/app/sms.py:
 * RQ1|id|type|count|lat|lon|created_ms|origin_id|receipt_hash|landmark|description
 * Every immutable field travels exactly, so a later app sync of the same report is an
 * idempotent duplicate. The private receipt token is never sent by SMS. */
export const SMS_PREFIX = 'RQ1';
export const MAX_SMS_CHARS = 918; // six concatenated GSM segments; most phones send this as one message

export function encodeSmsReport(report: ReportInput): string {
  const input = immutableInput(report);
  if (input.location.label.includes('|')) throw new Error('Remove the "|" character from the landmark before sending by SMS.');
  const { latitude, longitude } = input.location;
  const text = [SMS_PREFIX, input.id, input.incident_type, String(input.affected_count),
    latitude === null ? '-' : String(latitude), longitude === null ? '-' : String(longitude),
    String(Date.parse(input.created_at)), input.origin_id, input.receipt_hash, input.location.label, input.description].join('|');
  if (text.length > MAX_SMS_CHARS) throw new Error('This report is too long for SMS. Show its QR to a volunteer or sync when connected.');
  return text;
}

/** Approximate number of SMS segments (GSM-7 when ASCII, UCS-2 otherwise). */
export function smsSegments(text: string): number {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}
