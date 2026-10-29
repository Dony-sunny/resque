# ResQ Relay v1 implementation contract

Roles: `citizen | volunteer | coordinator | responder`. Demo users have IDs `demo-<role>`.

All IDs for reports/events/notes/assignments are UUID strings. Times are ISO UTC strings.

Report input: `{id, incident_type: flood|medical|fire|trapped|supplies|other, affected_count: number, description: string, location: {label: string, latitude: number|null, longitude: number|null}, created_at: string, origin_id: string, receipt_hash: string}`. The hash is SHA-256 over the UTF-8 string of a random 64-hex-character private token. Citizen create additionally supplies `receipt_token`, retained locally and never exported in QR or returned by report APIs. A matching authenticated origin and token can claim a report that a volunteer relayed first. origin_id alone is untrusted. QR reports arrive unverified.

Bounds: affected_count integer 1–10,000; trimmed description 1–500 characters; trimmed location label 1–160 characters; complete valid coordinate pair or both null; note text 1–1,500 characters. Timestamp values normalize to UTC ISO format before immutable comparison. QR payload maximum 1,900 UTF-8 bytes, one report, version 1. Oversized reports remain stored but cannot use one-QR relay; the UI displays the size error.

Server report extends input with `{delivery_state: delivered|acknowledged, verification: unverified|verified|rejected, urgency: low|medium|high|critical|null, urgency_reasons: string[], assigned_to: string|null, mission_status: unassigned|assigned|accepted|en_route|on_scene|completed, updated_at: string, version: number, notes: {id, text, author_id, created_at}[], audit: {id, action, actor_id, detail, created_at}[]}`.

Client report extends with `delivery_state: pending|delivered|acknowledged`, `source: own|collected|relayed|server|seed`, optional local fields. Never mark delivered at QR export/import. Pending coordinator/mission changes remain queued separately until server confirmed. Seed incident labels explicitly synthetic.

Queue event: `{id, kind: report.create|report.review|report.assign|mission.status|mission.note, report_id, payload}`. Create payload is ReportInput. Review payload `{verification, urgency, urgency_reasons, acknowledge: boolean}`. Assign payload `{responder_id}`. Status payload `{status}`. Note payload `{id,text,created_at}`. Review/assign/status may contain expected_version; stale => conflict, no silent overwrite.

API prefix `/v1`. `POST /auth/demo {role}` -> `{access_token, user:{id,name,role}}` only when RESQ_DEMO_MODE=true. `GET /me` -> user. `GET /responders` coordinator -> user[]. `POST /sync {events: Event[]}` -> `{results:[{event_id,status: applied|duplicate|rejected|conflict,error?:string,report?:ServerReport}]}`. Per event atomic with idempotent receipt; retry same id same body, changed body conflicts. `GET /reports` -> ServerReport[] scoped by server identity: citizen own, volunteer submitted, coordinator all, responder assigned. `GET /reports/{id}` same visibility. `GET /health` (no auth) -> `{status:'ok',demo_mode:boolean}`. Bearer auth required except health/demo login. Report IDs immutable and conflicting create rejected; same identical report relay is duplicate-safe even with new event id. Events applied in list order.

Core mobile exports from `src/core/types.ts`, `src/core/store.ts`, `src/core/sync.ts`, `src/core/relay.ts`, `src/core/api.ts`, `src/core/i18n.ts`. UI receives App services through imports. Core publishes exact APIs to UI agent before implementation. Root owns package/config files; core agent owns src/core and tests; UI agent owns App.tsx, src/ui, src/features; backend agent owns backend/.
