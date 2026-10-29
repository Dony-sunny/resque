# Delivered snapshot verification

Verified locally on **29 October 2026 (Asia/Kolkata)** using Windows, Node 24.9.0 and
Python 3.12.10. This records completed checks, not promises about untested devices.

| Check | Result |
| --- | --- |
| Backend `python -m pytest -q` | **31 passed**. Auth, gated demo login, scoped feeds, ownership proofs, relay duplicates, idempotent receipts, rollback, validation, optimistic conflicts, concurrent writes, human urgency, assignments, mission states, notes and audit. |
| Mobile `npm run typecheck` | **Passed** with strict TypeScript. |
| Mobile tests without API | **17 passed**, one gated live API test skipped by design. Real SQLite adapter tests include restart/reopen, rollback, atomic receipt/outbox settlement and role isolation. |
| Mobile tests with `RESQ_TEST_API_URL` | **18 passed**, including mobile LocalStore + SyncEngine over real HTTP to FastAPI. |
| Full HTTP demo script | **Passed** against local Uvicorn with an explicitly synthetic incident. Relay → duplicate retry → citizen proof → human review → assignment → completed mission → duplicate-safe note; permissions and audit checked. |
| `npx expo install --check` | **Dependencies up to date**, checked with network access against the SDK compatibility data. |
| `npx expo config --type introspect` | **Passed**: native plugins and Android configuration resolve for `org.nevermore.resqrelay`. |
| `npm run export:android` | **Passed**, Metro bundled 1,041 modules and generated a 3.3 MB Hermes Android bundle plus assets. This is JavaScript bytecode, **not an APK**. |
| Dependency audit | No critical findings after updating Vitest. Eight findings remain in the SDK 55 Expo toolchain tree: 3 high, 5 low (including parent-package propagation). Details in PACKAGES.md. |

The test runner uses a real Node SQLite database behind the same repository interface as
Expo SQLite. Live integration tests validate the actual API serialization, UTC timestamp
normalization, report hash/secret proof, queued version projection, and note ordering.
They do not load Expo native modules on a physical device.

## Still requires device or deployment testing

* Install/run the Android APK or compatible Expo Go client on actual Android hardware.
* Verify camera QR scan/readability between two phones, permissions denied, GPS disabled,
  and manual landmark entry.
* Exercise airplane-mode cold starts, process termination, real reconnects, large system
  text, screen readers, and the Malayalam layout on a physical device.
* Validate a preview APK against a trusted HTTPS endpoint. No APK was built here because
  an Android native toolchain/device and Expo build account were not available in this run.
* Run migrations and integration checks against PostgreSQL before deploying that option.
* Add reviewed production authentication and operational controls before real incidents.

No backend has been deployed or public demo login exposed. SQLite demo data and transient
test artifacts are excluded from the downloadable source archive. The README provides
the seeded local demo, physical-phone connection steps and APK build procedure.
