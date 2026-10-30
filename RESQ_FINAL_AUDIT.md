# RESQ final audit (30 Oct 2026)

Stack: Expo SDK 55 / React Native app (`mobile/`) + FastAPI / SQLAlchemy / SQLite backend (`backend/`).
Checkpoints on branch `feature/saksham-rebuild`: `faa943d` (four roles), `b972564` (redesign + assistant),
`031d6ba` (Safe Zones + directions). This round is uncommitted on top of `031d6ba`.

References: SAKSHAM, SURVORA-AI (inspected in `../_refs`, no licence → nothing copied). RakshakMesh and Crisis Connect
were **not cloned or inspected in this round**; RESQ's store-and-forward outbox, stable report UUIDs, idempotent
`/v1/sync` and QR relay predate this round and were built independently.

Status key: WORKING (tested), PARTIAL, MISSING, NOT TESTED (code exists, not exercised on a device this round).

| Feature | Implementation | Status | Evidence |
|---|---|---|---|
| Citizen SOS (one-tap + 4-step) | `features/QuickSos.tsx`, `CreateReport.tsx`, `core/store.ts` | WORKING | 26-step phone run (earlier round); `mobile/tests/store.test.ts` |
| Offline outbox, stable UUID, idempotent sync, restart recovery | `core/store.ts`, `core/sync.ts`, `/v1/sync` | WORKING | `ops-store.test.ts` (restart + single delivery); phone offline run (earlier round) |
| Delivery states (saved / pending / syncing / not sent-retry / server received / acknowledged) | `features/Reports.tsx` `DeliveryBadge` | PARTIAL | Code + type check; "Verification pending" is shown as the tracker step, not a separate badge |
| Explainable priority (40/25/15/15/5, bands, life-safety override, "Why this priority?") | `backend/app/priority.py`, `features/Ops.tsx` | WORKING | `test_operations.py` priority tests; phone run |
| Team recommendation, human-approved assignment, no double assignment, Release Team | `ops.recommend`, `service.py`, `operations_api.py` | WORKING | `test_operations.py`, `test_assistant.py::test_release_team…` |
| Resource estimate Required / Available / Shortfall + escalate | `backend/app/estimate.py`, `ResourceTable` | WORKING | `test_resource_formulas_and_shortfall`; phone run |
| Relief inventory, reservation, dispatch once, no negative stock | `ops.advance_relief` | WORKING | relief tests; phone run |
| Shelters capacity/occupancy | `/v1/shelters`, `SheltersScreen` | WORKING | `test_shelter_capacity_enforced` |
| Safe Zones (facilities, filters, synced cards, detail sheet) | `backend` `facilities` table, `features/SafeZones.tsx` | WORKING | `test_facilities.py`; seen on phone (used by a person) |
| Google Maps directions (origin = current position, destination = facility) | `core/facilities.ts` `directionsUrl`, `features/location.ts` | WORKING | `safezones.test.ts`; on phone "Opened Google Maps from your current location…" |
| **Incident Impact Map** shared by all roles, Street Map default, Impact Heatmap toggle | `features/MapScreen.tsx`, `ImpactLayer.tsx`, `WebMap.tsx` (Leaflet + leaflet.heat) | NOT TESTED on device | type check, Android bundle; `heat.test.ts` |
| Heatmap data and privacy (precise for officials, assigned-precise for rescue, ~2.2 km cells for others, single unverified cells suppressed, duplicates/resolved excluded, insufficient-data state) | `backend/app/impact.py`, `GET /v1/map/impact` | WORKING (server) | `test_impact.py` (8 tests) |
| Relief Demand overlay | `impact.relief_demand`, `GET /v1/map/relief-demand` | WORKING (server) / NOT TESTED on device | `test_relief_demand_overlay_and_permissions` |
| Government filters (level, verified/unverified), incident → detail | `MapScreen.tsx` | NOT TESTED on device | type check |
| Report provenance (citizen / community relay / responder / simulated) | `ops.provenance`, `IncidentRow` badge | WORKING (server) | `test_provenance…` |
| Community QR Relay (generate, scan, validate, store, upload once, ack) | `features/Relay.tsx`, `core/relay.ts`, `store.importRelay` | WORKING (unit) / two-device NOT TESTED | `store.test.ts`, `relay-check.test.ts`; checksum added this round |
| RESQ AI assistant (server, Claude when keyed, offline guide) + sparkles header icon | `backend/app/assistant.py`, `features/Assistant.tsx`, `App.tsx` | WORKING (guide) / live AI NOT TESTED | `test_assistant.py`, `assistant.test.ts` |
| RESQ logo (header, loading, settings/role screen, icon, adaptive icon, splash, favicon) | `mobile/assets/*`, `app.json`, `App.tsx`, `Settings.tsx` | NOT TESTED on device | assets generated from the supplied image; bundle builds |
| Alerts (publish by officials, pop-up once, notifications list) | `Alerts.tsx`, `App.tsx` | WORKING | earlier phone runs |
| Demo data (20 incidents incl. duplicate + life-threat, 5 teams, 4 shelters, 9 facilities, 10 relief requests, 1 QR-relayed) / Run Simulation / Reset | `backend/app/demo.py` | WORKING | `test_demo_reset…`; offline SOS is demonstrated live on a phone, not seeded |
| Lint | — | MISSING | the project has no linter configured |
| Telegram, USSD, Bluetooth mesh, ML forecasting, photo upload, push notifications, production auth | — | Deferred (P2) | |
