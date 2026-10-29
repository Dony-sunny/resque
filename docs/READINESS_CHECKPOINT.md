# Hackathon readiness checkpoint

This repository contains the current implementation, including work from the readiness
audit. Source availability does not imply that an APK or a deployment has been verified.

## Completed and tested in the readiness audit

- Existing four-role workflow retained: offline SOS, QR relay, citizen ownership recovery,
  human coordinator review, assignment, responder status updates and offline notes.
- Protected demo enrollment with a server-side demo access key and role enforcement.
- Persistent backend identity, so a phone can reconnect to the same backend through a
  different reachable address without stranding its pending reports.
- Improved connection indicators, retry/conflict handling and stale-review protection.
- Critical English/Malayalam workflow messages and affected-count guidance corrected.
- UI guards for repeated SOS saves and QR imports; camera failure and paste fallback.
- Persistent deployment templates, an online SQLite backup command and a backend starter.

The latest completed automated runs recorded during the audit were **34 backend tests**
and **31 mobile tests**, including the protected local HTTP workflow, with TypeScript
passing. Earlier `VALIDATION.md` records the original delivery and its earlier test counts.

## Not yet verified or completed

- A standalone installable APK has **not** yet been produced. The first native build
  exposed an incompatible auto-installed font package; it is now explicitly pinned to
  Expo SDK 55. A subsequent Windows native autolinking failure still needs resolution.
- Physical Android startup, native camera/QR, location and two-phone relay testing remain
  pending. Automated repository tests do not substitute for these device checks.
- Docker Compose configuration was validated, but the local Docker engine was unavailable;
  running a persistent hosted deployment has not been verified.
- A temporary protected HTTPS tunnel was tested with the HTTP demo script. It depends on
  the laptop and tunnel process running; it is not an always-on deployment. Further
  automated credential transmission through it requires the pending approval.
- Private-LAN TLS support is being prepared; certificate generation and Android runtime
  integration are not yet verified. Private keys and access keys are excluded from Git.
- Incident maps, rescue-team resource matching and bundled safety instructions remain
  deferred until Android deployment and priorities 1–4 have passed the required checks.

Demo account IDs are `demo-citizen`, `demo-volunteer`, `demo-coordinator` and
`demo-responder`. Use the same configured backend for all roles. Demo enrollment is
available only with `RESQ_DEMO_MODE=true`; protected deployments additionally require
the generated `RESQ_DEMO_ACCESS_KEY` entered in mobile Settings.
