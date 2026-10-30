# RESQ UI feature audit — dashboard, Safe Zones, directions, assistant (30 Oct 2026)

Checkpoint before this work: commit `b972564` on branch `feature/saksham-rebuild`.
The three reference screenshots mentioned in the brief were not attached to the conversation; the SURVORA and
SAKSHAM source (inspected earlier, `../_refs`) and the written spec were used instead.

## Found before the change
| Area | Current implementation (file) | Status |
|---|---|---|
| Victim dashboard | `mobile/src/features/Reports.tsx` `HomeScreen`: SOS block, sync card, active requests, alert, "Shelters with space" list, 4-tile shortcut grid incl. **Ask RESQ Assistant** | Working; Help/assistant duplicated (header icon + grid tile + Help tab) |
| Help entry points | Header chat icon, `Help` tab (`registry.ts`), grid tile | Duplicated |
| Assistant | `features/Assistant.tsx`, `core/assistant.ts`, backend `app/assistant.py` (`POST /v1/assistant`) | Working (guide mode tested; AI mode with stubbed model) |
| Safe zones | No dedicated screen. Shelters in `/v1/shelters` (4 rows, capacity/occupancy); hospitals etc. hard-coded in `core/resources.ts` | Missing |
| Map | `features/WebMap.tsx` (Leaflet + OSM in a WebView), used by `MapScreen.tsx` (incidents map) | Working; no categories/glyphs, no selection, no tile-error signal |
| GPS | `features/location.ts` `locateWithFallback` (GPS → network → last known → saved fix) | Working; the saved-fix fallback is unsuitable as a route origin |
| Navigation | `registry.ts` tabs per role; victim: Home · SOS · Requests · Safety · Help | Needs Safe Zones + More |
| Data/persistence | FastAPI + SQLAlchemy; phone caches operations data per role (`services.operations`) | Working |

## Changes made
| Requirement | Implementation | Files |
|---|---|---|
| Facility data model | New `facilities` table (id, name, category, lat/lon, address, locality, district, state, services, phone, notes, verification, simulated, updated_at, linked shelter). Capacity/occupancy/status come **only** from the linked shelter row; hospitals and relief centres show none. `GET /v1/facilities[?category=]`; invalid coordinates are never served. Demo seed: 9 SIMULATED Kottayam facilities, no phone numbers (none verified) | `backend/app/models.py`, `ops.py`, `operations_api.py`, `demo.py` |
| Safe Zones screen | Real OSM street map, category glyph + colour pins, selected-pin highlight, Locate me, Recenter, search, filter chips (All / Shelters / Relief camps / Hospitals / Relief centres) driving both pins and cards, cards with distance (straight-line), spaces, status, services, updated time, View on map + Get directions, detail bottom sheet (directions, call only if a phone exists, close), GPS-denied / loading / empty / offline-cache / tile-failure states. Filter, selection and travel mode survive leaving the screen | `mobile/src/features/SafeZones.tsx`, `WebMap.tsx`, `core/facilities.ts` |
| Google Maps directions | `directionsUrl()` builds `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=…&dir_action=navigate`; `openGoogleMapsDirections()` gets a **current** position (GPS, network, or phone fix < 5 min; never an old saved fix). No position → origin omitted, so Google Maps uses the device location or asks. Driving / Walking | `core/facilities.ts`, `features/location.ts` |
| Dashboard | Shortcut grid (incl. Ask RESQ Assistant) and shelters list removed; replaced by **Nearby Safe Zones** card (non-interactive mini map of 5 nearest, nearest facility with Get directions, View all) | `features/Reports.tsx` |
| Header | Left: RESQ logo, tagline, role + Kottayam region, connection. Right: **Ask RESQ AI**, Notifications (unread badge), Profile/settings. Sync button removed from header (pull to refresh and Sync card remain) | `mobile/App.tsx` |
| Victim navigation | Home · SOS · Safe Zones · Requests · More. More: guides/contacts/preparedness, alerts, QR relay, incident map, outbox, settings. Help tab removed | `registry.ts`, `App.tsx` |
| Assistant | Online/offline indicator; quick prompts per spec; "Find nearest shelter" offers **Open Safe Zones** (normal routing) | `Assistant.tsx`, `core/assistant.ts`, `backend/app/assistant.py` |

## Retained
SOS (one-tap and detailed), offline outbox and sync, request tracking, government queue and explainable priority,
resource estimate, team assignment, rescue missions, relief inventory and dispatch, shelters occupancy, alerts,
QR relay, SMS fallback, incident map (`MapScreen`), Release Team.

## Not implemented / limits
- Geocoding search of arbitrary towns: search filters the facility list by name, town and service; no external geocoder.
- Satellite view: not offered (no suitable tile provider configured).
- Offline map tiles and offline routing: not implemented; offline the cached facility list remains, directions need Google Maps.
- Facility data is SIMULATED demo data; a live source can be added by writing rows to `facilities`.

## Verification
See the final report in the conversation: backend `pytest`, mobile `npm run check`, Android export. Phone end-to-end
run of the 30-step flow: NOT TESTED (the phone was in use by a person during this session).
