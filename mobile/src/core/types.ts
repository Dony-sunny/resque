export const roles = ['citizen', 'coordinator', 'responder', 'relief', 'volunteer'] as const;
export type Role = typeof roles[number];
export type Language = 'en' | 'ml';
export type IncidentType = 'flood' | 'landslide' | 'fire' | 'earthquake' | 'cyclone' | 'medical' | 'trapped' | 'supplies' | 'other';
export type MissionStatus = 'unassigned' | 'assigned' | 'accepted' | 'en_route' | 'on_scene' | 'in_progress' | 'completed';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export interface User { id: string; name: string; role: Role }
export interface Location { label: string; latitude: number | null; longitude: number | null }
export type Assistance = 'rescue' | 'ambulance' | 'medical' | 'food' | 'water' | 'medicine' | 'shelter';
export interface People { trapped: number; injured: number; children: number; elderly: number; disabled: number }
/** Progressive SOS details: mutable, sent alongside the immutable report and updatable later. */
export interface Details { people: People; life_threat: boolean; assistance: Assistance[]; support?: SupportEntry[] }
export interface SupportEntry { id: string; kind: 'backup' | 'medical' | 'supplies' | 'escalation'; note: string; items: Record<string, number>; by: string; at: string }
export interface ReportDraft { incident_type: IncidentType; affected_count: number; description: string; location: Location; details?: Details }
export interface ReportInput extends ReportDraft { id: string; created_at: string; origin_id: string; receipt_hash: string }
export interface Note { id: string; text: string; author_id: string; created_at: string }
export interface Audit { id: string; action: string; actor_id: string; detail: string; created_at: string }
export interface ServerReport extends ReportInput {
  delivery_state: 'delivered' | 'acknowledged';
  verification: 'unverified' | 'verified' | 'rejected';
  urgency: Urgency | null; urgency_reasons: string[]; assigned_to: string | null;
  mission_status: MissionStatus; updated_at: string; version: number; notes: Note[]; audit: Audit[];
  /** Server-computed operational view (not part of the immutable report). */
  details?: Details; priority?: Priority; resources?: ResourceRow[]; team?: { id: string; name: string; simulated: boolean } | null;
  duplicates?: string[]; duplicate_of?: string | null; linked_duplicates?: string[]; relief?: ReliefSummary[]; support?: SupportEntry[];
}
export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export interface PriorityFactor { factor: 'severity' | 'vulnerability' | 'people' | 'waiting' | 'confidence'; weight: number; value: number; contribution: number; explanation: string }
export interface Priority { score: number; level: PriorityLevel; breakdown: PriorityFactor[]; override: string | null; waiting_minutes: number; people: People & { affected: number }; life_threat: boolean }
export interface ResourceRow { key: string; label: string; required: number; available: number; shortfall: number }
export type ReliefStatus = 'requested' | 'approved' | 'packed' | 'dispatched' | 'delivered' | 'cancelled';
export interface ReliefSummary { id: string; status: ReliefStatus; items: Record<string, number>; requester_role: string; updated_at: string }
export interface ReliefRequestView extends ReliefSummary { incident_id: string | null; requester_id: string; note: string; history: { status: string; actor: string; at: string }[]; simulated: boolean; created_at: string; dispatch: { id: string; created_at: string; delivered_at: string | null } | null }
export interface TeamView { id: string; name: string; capabilities: string[]; capacity: number; base: string; latitude: number; longitude: number; readiness: number; on_duty: boolean; lead_user_id: string; simulated: boolean; mission_id: string | null; mission_status: MissionStatus | null; available: boolean; distance_km?: number; match_score?: number; match_reason?: string }
export interface InventoryView { key: string; name: string; unit: string; kind: 'supply' | 'asset'; total: number; reserved: number; available: number; low_threshold: number; low: boolean }
export interface ShelterView { id: string; name: string; area: string; latitude: number; longitude: number; capacity: number; occupancy: number; remaining: number; facilities: string[]; status: 'open' | 'full' | 'closed'; simulated: boolean }
export interface OpsSummary { active_sos: number; critical: number; unassigned: number; teams_available: number; teams_total: number; pending_relief: number; dispatches_active: number; open_shelters: number; shelter_space: number; people_affected: number; low_stock: InventoryView[]; shortages: { key: string; required: number; available: number; shortfall: number }[] }
export interface AuditRow { id: string; actor: string; action: string; entity: string; entity_id: string; incident_id: string | null; previous_status: string | null; new_status: string | null; detail: string; created_at: string }
export interface Report extends Omit<ServerReport, 'delivery_state'> {
  delivery_state: 'pending' | 'delivered' | 'acknowledged';
  source: 'own' | 'collected' | 'relayed' | 'server' | 'seed';
  /** Device-only capability. Never export this field to QR, lists, or logs. */
  receipt_token?: string;
}
export type EventKind = 'report.create' | 'report.review' | 'report.assign' | 'mission.status' | 'mission.note' | 'report.details' | 'report.link_duplicate' | 'mission.request' | 'relief.request';
export interface SyncEvent { id: string; kind: EventKind; report_id: string; payload: Record<string, unknown> }
export interface QueueItem extends SyncEvent {
  status: 'pending' | 'retry' | 'blocked' | 'conflict'; attempts: number;
  next_attempt_at: number; last_error: string | null; created_at: string;
}
export interface SyncResult { event_id: string; status: 'applied' | 'duplicate' | 'rejected' | 'conflict'; error?: string; report?: ServerReport }
export interface SyncResponse { results: SyncResult[] }
export interface Config { apiUrl: string; language: Language; forceOffline: boolean; demoAccessKey?: string; smsNumber?: string }
export type AlertSeverity = 'info' | 'warning' | 'danger';
export interface AuthorityAlert { id: string; title: string; body: string; severity: AlertSeverity; area: string; created_by: string; created_at: string; expires_at: string }
export interface AlertInput { title: string; body: string; severity: AlertSeverity; area: string; hours: number }
/** Best location found by the fallback chain; `source` explains how it was obtained. */
export interface LocationFix { latitude: number; longitude: number; accuracy: number | null; source: 'gps' | 'network' | 'last-known' | 'saved'; at: number }
export interface ConnectionStatus {
  state: 'never' | 'checking' | 'reachable' | 'unreachable' | 'paused';
  last_attempt_at: string | null;
  last_success_at: string | null;
  error: string | null;
  backend_id: string | null;
}
export interface BackendHealth { status: string; demo_mode: boolean; backend_id: string; demo_access_key_required: boolean }
export interface SyncSummary { sent: number; remaining: number; message: string; backend_reachable?: boolean }
export interface Transport { sync(events: SyncEvent[]): Promise<SyncResponse>; reports(): Promise<ServerReport[]>; alerts?(): Promise<AuthorityAlert[]> }
