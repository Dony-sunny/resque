# ResQ Relay

Android-first disaster reporting for **Project Nevermore 2026**. React Native + Expo +
TypeScript, durable Expo SQLite outbox, FastAPI, and SQLAlchemy models for SQLite or
PostgreSQL. This repository contains a working hackathon MVP and synthetic demo data.

The latest readiness-audit changes and unfinished Android build/device checks are
recorded in [the readiness checkpoint](docs/READINESS_CHECKPOINT.md). An APK has not
yet been produced or tested on physical phones.

**An offline SOS is saved, not delivered.** A QR scan transfers a copy to a volunteer.
Only a backend receipt changes delivery state. Acknowledgment is a separate human action.

## Start on Windows

Install **Node 22.14+ (or Node 24 LTS)** and **Python 3.12+**. Use two terminals.

Terminal 1, from this repository:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:RESQ_DEMO_MODE = "true"
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal 2, from this repository:

```powershell
cd mobile
npm ci
npm start
```

Open the app in a compatible **Expo Go for SDK 55** on Android, or press `a` with an
Android emulator running. SDK 55 is deliberately pinned; the current Play Store Expo Go
may support a different SDK. Obtain the SDK 55 Android client from
[Expo Go downloads](https://expo.dev/go?sdkVersion=55&platform=android&device=true), or
build the preview APK described below.

In **Settings**, choose a demo role and set the API URL. On the Android emulator use
`http://10.0.2.2:8000`. Tap **Sync**. The API explorer is at
[localhost:8000/docs](http://localhost:8000/docs); health is at
[localhost:8000/health](http://localhost:8000/health).

Set the API address and demo access key in Settings. The app verifies the backend's
persistent identity before changing the active connection. Reachable addresses for the
same backend retain the same reports and queue; a different backend uses a separate
workspace. Reports created before the first connection are retained during enrollment.
If a server check fails, the previous workspace and pending reports stay available.

On macOS/Linux use `python3 -m venv .venv`, `.venv/bin/python`, and
`export RESQ_DEMO_MODE=true`; the remaining commands are the same.

## Physical Android phones

1. Connect the laptop and phones to the same trusted Wi-Fi/hotspot. Disable client
   isolation on that network. Start the backend with `--host 0.0.0.0` as above.
2. Find the laptop's Wi-Fi IPv4 address with `ipconfig`, for example `192.168.1.20`.
   Set the app's API URL to `http://192.168.1.20:8000` for the Expo Go LAN demo.
   `localhost` on a phone means that phone, not the laptop.
3. On the phone browser open `http://192.168.1.20:8000/health` first. If it cannot
   connect, allow Python on the private network in Windows Firewall and check the
   network's client isolation. Do not disable the firewall globally.
4. Scan the Expo development QR to load the app while connected. The Expo bundler
   and the API are two separate connections. An Expo tunnel only tunnels the bundler;
   it does not make your API accessible.
5. Use airplane mode or the app's **Simulate offline** setting to demonstrate pending
   reports. Keep the Expo Go app loaded. Use an installed preview APK for offline
   cold starts without a development computer.

The native build does not opt into unrestricted Android HTTP traffic. Use a trusted
**HTTPS** API address for an installed APK. A private HTTPS reverse proxy can point to
the local FastAPI service. Use a certificate the phone trusts and limit access to the
demo audience. Do not publish the demo login service as an operational rescue system.

## Four roles

| Workspace | Working MVP behavior |
| --- | --- |
| Citizen | Save an SOS offline with incident type, affected count, description, GPS or manual location; see pending/delivered/acknowledged state; export an offline QR copy. |
| Community volunteer | Collect reports offline; scan or paste a QR; reject malformed payloads; import repeated reports safely; carry and sync reports later. |
| Rescue coordinator | Read scoped incident feed, verify/reject reports, enter urgency with human reasons, acknowledge, assign a responder, inspect audit history. |
| Field responder | Read assigned missions, accept, advance mission status, save notes offline, and sync queued work. |

The demo role picker selects a **demo identity**. Real permissions are checked again by
the API using its authenticated user record. The server ignores any client claim to a
different role. Role switching on one phone is for judging; two phones better demonstrate
physical relay. All demo phones choosing the same role share that synthetic identity.

## Standalone demo and judging walkthrough

Without the API the app can save reports, retain them across restarts, show clearly
marked synthetic sample cards, collect reports, display and import QR, and queue actions.
Offline actions stay pending. Connect the local seeded backend for the full four-role
workflow. No hosted service or API key is required.

1. Choose **Citizen**, simulate offline, create a small flood SOS with a manual landmark.
   Close/reopen the installed app to show SQLite persistence. It must still say pending.
2. Display the report QR. On a second phone choose **Volunteer**, simulate offline and
   scan it twice. The second import must not add another report. A QR receipt does not
   mean the rescue coordinator has the SOS.
3. Reconnect the volunteer and tap Sync. The volunteer can now show a server-delivered
   copy. The disconnected citizen still shows pending until it receives a server receipt.
4. Reconnect and sync the original citizen. Its locally held ownership proof lets it
   retrieve its own relayed report. The QR does not contain that proof.
5. Choose **Coordinator** and Sync. Inspect the incident, enter urgency reasons, verify
   and acknowledge, then assign **Demo Responder**. Sync queued changes and inspect audit.
6. Choose **Responder**, Sync, accept the mission, progress en route/on scene/completed,
   and save an offline note. Reconnect and Sync to confirm the note exactly once.
7. Reconnect the citizen to see the coordinator acknowledgment. This does not promise
   a rescue arrival time.

Run the same flow against the real HTTP API with synthetic data:

```powershell
python scripts/demo_walkthrough.py http://127.0.0.1:8000
```

The script refuses to run unless the server reports demo mode. It verifies relay,
idempotent retries, ownership proof, role denial, review, assignment, mission progression,
notes and audit history. It creates one clearly synthetic exercise incident per run.
For a protected backend, set `RESQ_DEMO_ACCESS_KEY` in the script's environment.

## Checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
cd ../mobile
npm run check
npx expo install --check
npm run export:android
```

Tests cover important failure cases, including interrupted/repeated sync, duplicate QR
imports, receipt persistence, authorization, optimistic conflicts and invalid mission
transitions. See [verification results](docs/VALIDATION.md) for checks actually run on
this delivered snapshot and device testing limits.

To also run the mobile repository/sync integration against a running local demo API:

```powershell
$env:RESQ_TEST_API_URL = "http://127.0.0.1:8000"
$env:RESQ_TEST_DEMO_ACCESS_KEY = $env:RESQ_DEMO_ACCESS_KEY
npm test
```

Run this from `mobile`; it adds one real HTTP workflow test to the offline test suite.

## Installable Android build

Source and setup are included; an APK is not prebuilt in this delivery. An EAS build
requires your Expo account and network access. From `mobile`:

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Install the resulting APK, set your HTTPS API URL, and test airplane-mode cold starts,
camera permission denial, manual location, QR scanning between real devices, reconnect,
and queue recovery. The APK bundles the JavaScript so Metro is unnecessary. Alternatively
use `npx expo run:android` with a local Android SDK/JDK and USB-debugging device.
The `production` EAS profile creates an Android App Bundle for later distribution.

## Functional versus future work

**Functional:** four role workspaces, native offline SQLite storage, transactional outbox,
manual/foreground retries with backoff, idempotent backend mutations, QR generation and
camera/paste import, strict relay validation, human review/urgency, server permissions,
assignments, mission progression, offline notes, audit history, synthetic local/backend
seeds, and an English/Malayalam navigation and status skeleton.

**Partial or intentionally deferred:** Malayalam is a UI skeleton, not a reviewed full
translation; demo identity selection is not production enrollment/authentication;
foreground sync is not a guaranteed background service; urgency is human-entered;
there is no push notification system, offline map/routing engine, media attachment
pipeline, SMS gateway, automatic nearby-device discovery, Bluetooth mesh, Internet-free
long-range transport, or integration with real rescue dispatch. Production authentication,
multi-organization policies, encrypted incident storage, retention/consent operations,
schema migrations and PostgreSQL deployment validation remain future work. These are
listed as boundaries rather than displayed as working features.

The bounded QR format supports one report up to 1,900 UTF-8 bytes. Long Malayalam text
may exceed that limit; the app retains the SOS and explains why QR export is unavailable.
Transfers between backend workspaces, background sync guarantees and full web support
are also outside this snapshot. Package audit findings and their scope are recorded in
[package evaluation](docs/PACKAGES.md).

Backend deployment has not been performed. The local demo and real-device connection
procedure are included. Before real use, replace demo enrollment, deploy behind HTTPS,
configure persistent backups, review data access and test with the responsible response
organization. A report saved only on a disconnected phone cannot summon help by itself.

## Extend later

The module registry, service facade, domain types, and server event handlers are the
extension points. See [architecture](docs/ARCHITECTURE.md), [protocol](docs/CONTRACT.md),
[package evaluation](docs/PACKAGES.md), and [backend setup](backend/README.md).
Add future features as modules with explicit server policies and durable events. Keep
the delivery state invariant even when adding new communication adapters.

MIT license. Sample locations, users and incidents are synthetic.
