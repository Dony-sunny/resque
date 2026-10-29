export const roles = ['citizen', 'volunteer', 'coordinator', 'responder'] as const;
export type Role = typeof roles[number];
export type Language = 'en' | 'ml';
export type IncidentType = 'flood' | 'medical' | 'fire' | 'trapped' | 'supplies' | 'other';
export type MissionStatus = 'unassigned' | 'assigned' | 'accepted' | 'en_route' | 'on_scene' | 'completed';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export interface User { id: string; name: string; role: Role }
export interface Location { label: string; latitude: number | null; longitude: number | null }
export interface ReportDraft { incident_type: IncidentType; affected_count: number; description: string; location: Location }
export interface ReportInput extends ReportDraft { id: string; created_at: string; origin_id: string; receipt_hash: string }
export interface Note { id: string; text: string; author_id: string; created_at: string }
export interface Audit { id: string; action: string; actor_id: string; detail: string; created_at: string }
export interface ServerReport extends ReportInput {
  delivery_state: 'delivered' | 'acknowledged';
  verification: 'unverified' | 'verified' | 'rejected';
  urgency: Urgency | null; urgency_reasons: string[]; assigned_to: string | null;
  mission_status: MissionStatus; updated_at: string; version: number; notes: Note[]; audit: Audit[];
}
export interface Report extends Omit<ServerReport, 'delivery_state'> {
  delivery_state: 'pending' | 'delivered' | 'acknowledged';
  source: 'own' | 'collected' | 'relayed' | 'server' | 'seed';
  /** Device-only capability. Never export this field to QR, lists, or logs. */
  receipt_token?: string;
}
export type EventKind = 'report.create' | 'report.review' | 'report.assign' | 'mission.status' | 'mission.note';
export interface SyncEvent { id: string; kind: EventKind; report_id: string; payload: Record<string, unknown> }
export interface QueueItem extends SyncEvent {
  status: 'pending' | 'retry' | 'blocked' | 'conflict'; attempts: number;
  next_attempt_at: number; last_error: string | null; created_at: string;
}
export interface SyncResult { event_id: string; status: 'applied' | 'duplicate' | 'rejected' | 'conflict'; error?: string; report?: ServerReport }
export interface SyncResponse { results: SyncResult[] }
export interface Config { apiUrl: string; language: Language; forceOffline: boolean; demoAccessKey?: string }
export interface ConnectionStatus {
  state: 'never' | 'checking' | 'reachable' | 'unreachable' | 'paused';
  last_attempt_at: string | null;
  last_success_at: string | null;
  error: string | null;
  backend_id: string | null;
}
export interface BackendHealth { status: string; demo_mode: boolean; backend_id: string; demo_access_key_required: boolean }
export interface SyncSummary { sent: number; remaining: number; message: string; backend_reachable?: boolean }
export interface Transport { sync(events: SyncEvent[]): Promise<SyncResponse>; reports(): Promise<ServerReport[]> }
