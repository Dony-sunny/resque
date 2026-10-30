# RESQ rebuild audit

Checkpoint before changes: `git stash list` → `checkpoint before SAKSHAM rebuild` (tracked files) and a full copy of
tracked + untracked source at `../resque-checkpoint-pre-rebuild/`. Database backup: `../resq-relay-pre-rebuild.db`.

## Existing RESQ (inspected)
| Area | Finding |
|---|---|
| Framework | Expo SDK 55 / React Native 0.83 / TypeScript mobile app (kept; not converted to a PWA) |
| Backend | FastAPI + SQLAlchemy, SQLite (PostgreSQL via `DATABASE_URL`), bearer sessions, demo roles |
| Offline | SQLite outbox on the phone (IndexedDB equivalent), idempotent `/v1/sync` with receipts, retry with backoff, QR relay, SMS fallback |
| Screens | Workspace, New SOS, Relay (QR), Map (street + offline), Outbox, Settings, Report detail; alerts pop-up; web dashboard `/dashboard` |
| Roles | citizen, volunteer, coordinator, responder |
| Build | `npm run check` and `pytest` passed before the rebuild |
| Gaps | no rescue-team entity, no priority score, no resource estimate, no relief inventory/dispatch, no shelters, no duplicate review, no ops audit log, no Kottayam scenario |

## Reference repositories
- **SAKSHAM** (`Sanch2512/SIH_Saksham_FInal_Combined`): no licence file → all rights reserved; inspected only, no code copied.
  Real code is an NDMA *training/capacity-building* system: offline event + attendance capture (IndexedDB `syncQueue`),
  OfflineBanner, SyncPanel, geotagged media, KPI dashboard, district GIS map, Express/Mongo backend (Report, TrainingSession,
  District, User), USSD and Telegram bots, a prediction notebook. It has no live SOS workflow.
- **SURVORA-AI** (`Yashsrivastav2603/SURVORA-AI`): no licence → inspected only. Vite/React app with SOS reporting, rescue
  tracking, authority dispatch, safe zones and a deterministic resource estimator (`services/analytics.js`).
  RESQ's estimator uses its own documented formulas (`backend/app/estimate.py`).

## Feature-parity matrix
| Feature | Existing RESQ | SAKSHAM | SURVORA | Implementation in RESQ |
|---|---|---|---|---|
| Offline-first capture + sync queue | Yes (SQLite outbox) | Yes (IndexedDB) | Local store | Kept; sync panel + pending counts on victim home |
| Offline banner / sync status | Partial | Yes | – | Connection badge + sync panel |
| Victim SOS | Yes | – | Yes | Progressive SOS: 9 hazard types, people at risk, life threat, needs |
| Request tracking | Partial | – | Yes | 7-step tracker with team name and relief status |
| Explainable priority | – | – | Risk score | `priority.py` weighted score + life-safety override + "Why this priority?" |
| Resource estimation | – | – | Yes | `estimate.py` Required / Available / Shortfall + escalate action |
| Rescue teams + matching | Responder users only | – | Team assignment | Team entity, capability/proximity/readiness/capacity ranking, no double assignment |
| Mission workflow | accepted→completed | – | Status advance | + in_progress, backup / medical / supplies requests, availability toggle |
| Relief inventory + dispatch | – | – | Resource pool | Inventory, reservation, pack, dispatch, deliver, cancel; no negative stock |
| Shelters | Bundled demo list | District map | Safe zones | Shelter capacity/occupancy with limits |
| GIS map | Street + offline | Leaflet district map | Map | Incidents by priority, teams, shelters, hospitals |
| Alerts | Yes | – | Broadcast | Kept (pop-up once); alerts list in Safety |
| Preparedness / training | – | Yes (core purpose) | Calm space | Safety screen: contacts, hazard guides, kit checklist, drill steps |
| KPI dashboard | Web dashboard | Yes | Analytics | Government command-centre KPIs in app + web dashboard |
| Duplicate review | – | – | – | 250 m / 30 min suggestions, link without discarding |
| Audit | Per-report | Activity log | – | Chronological ops audit log with previous/new status |
| Demo scenario | 3 synthetic | Seed data | Seed data | Kottayam: 20 incidents, 5 teams, 4 shelters, 10 relief requests, simulate + reset |
| USSD / Telegram / ML prediction | – | Yes | – | Not implemented (P2) |

## Verification status (30 Oct 2026)
- Backend `pytest -q`: 53 passed, 1 skipped (priority formula, life-safety override, sorting, resources, duplicates,
  team matching / no double assignment, mission transitions, reservation + dispatch, over-allocation, shelter capacity,
  role authorisation, demo reset keeps real reports, full victim → government → rescue → relief workflow).
- Mobile `npm run check`: typecheck + 39 tests passed (offline details, role permissions, pending SOS survives restart,
  single delivery after sync). `npm run export:android`: bundle built.
- On a Redmi phone (Expo Go 55, USB): the 26-step workflow was run through the real UI; screenshots in
  `../resque-screenshots/e2e/`. Offline SOS stayed pending across an app restart and produced exactly one server copy.
- Not implemented: photo upload, real SMS gateway account, USSD, Telegram, ML prediction, production auth, push notifications.
