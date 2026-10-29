# Backend availability and persistent deployment

All four mobile roles connect to **one FastAPI instance and the same database**. A role
switch changes the authenticated demo identity, not the backend. Use the same API address
and demo access key on both judging phones. The app checks the persistent `backend_id`
from `/v1/health` to identify an authority across reachable addresses.

This guide provides a local service and a persistent HTTPS deployment template. Neither
a cloud deployment nor a physical-phone connection is claimed merely because a template
exists. Record the actual endpoint, device checks and outcomes in the readiness evidence.

## Local service on Windows

From the project directory, create the backend environment once:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
$env:RESQ_DEMO_ACCESS_KEY = (& backend/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(32))")
```

Keep the generated key available for mobile Settings, without putting it in screenshots,
Git, or a public presentation. Start the seeded persistent service:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -BindAddress 0.0.0.0 -Seed
```

The script uses `backend/data/resq-relay.db`. Restarting the service retains incidents,
sessions, assignments, notes, event receipts and backend identity. Seeding is repeatable
and does not reset existing incident data. Keep the same key between service restarts.
The command-scoped execution-policy option runs only this saved helper; it does not
change Windows' persistent execution policy.

Find your Wi-Fi IPv4 address using `ipconfig`. With both phones on the same trusted Wi-Fi,
open `http://LAPTOP-IP:8000/health` in a phone browser first. If it cannot connect, check
Wi-Fi client isolation and allow Python only on the intended private network/port.
Do not disable Windows Firewall. Native release APKs use a trusted HTTPS address; the
HTTP health check diagnoses LAN reachability and does not by itself prove APK connectivity.

If using a public HTTPS tunnel for the hackathon, forward only the local API port and
set `RESQ_DEMO_ACCESS_KEY` before starting it. Enter that key on every phone. An Expo
Metro tunnel does not tunnel FastAPI. The demo key gates identity selection; bearer
sessions enforce permissions afterward. Changing the key does not revoke existing
24-hour bearer sessions. This remains a controlled synthetic demo, not public enrollment.

## Private LAN HTTPS for a controlled demo APK

This fallback stays on the laptop/LAN and does not send the demo enrollment key through
an external tunnel. It does not disable certificate validation or enable global cleartext
traffic. A short-lived private CA is trusted **only for exact demo hosts in a dedicated
demo APK build**. The public CA certificate is safe to bundle; its private key is not.

From the project directory, replace `192.168.1.34` with the laptop's current private IP:

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-tls.txt
backend/.venv/Scripts/python.exe scripts/create-demo-tls.py --host 192.168.1.34 --export-ca mobile/assets/demo-ca.crt
```

The generator creates `backend/data/tls/ca.key`, `ca.crt`, `server.key`, `server.crt`, and
metadata. It refuses to overwrite an existing directory or asset. SAN hosts are exactly
`localhost`, `127.0.0.1`, `10.0.2.2` (the Android emulator's laptop alias), and the explicit
LAN IP. The server certificate is valid for 7 days; the private CA for 30 days. Protect
`backend/data` with your user account's filesystem permissions. It is ignored runtime
data and must be excluded entirely from source/download archives. No private key belongs
in `mobile/assets`, APK resources, Git, screenshots or mentor evidence.

For this demo build only, configure the Android host-scoped network security plugin:

```powershell
$env:RESQ_DEMO_TLS_HOSTS = "localhost,127.0.0.1,10.0.2.2,192.168.1.34"
$env:RESQ_DEMO_TLS_CA = "./assets/demo-ca.crt"
```

Run the Android prebuild/release build procedure with those variables present. Verify
the generated network-security XML references only these exact hosts and this public
CA, with standard system trust retained for ordinary HTTPS. The production/default build
must omit these variables and must not trust this private CA. This is a controlled local
demo artifact, not a general Android trust-store change.

Start the API with the **same persistent database and demo key** already used by the app:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -BindAddress 0.0.0.0 -Port 8443 -TlsCertificate backend/data/tls/server.crt -TlsPrivateKey backend/data/tls/server.key
```

If the existing service uses another database file, also supply `-DatabasePath` with its
absolute path. Stop the old service cleanly before reusing its port. Configure every
phone to `https://192.168.1.34:8443`; the Android emulator can use
`https://10.0.2.2:8443`. Confirm the same backend identity and key on all four role
workspaces. A normal phone browser still distrusts the private CA unless explicitly
installed there; the scoped demo APK can trust it without installing a system-wide CA.

When the LAN IP changes, the certificate must include the new IP **and** the APK's exact
host list must include it. Generate a new certificate set into a new output directory,
export the matching public CA to a new asset path, and rebuild/reinstall the demo APK.
Do not solve an IP/certificate error by disabling verification, accepting every host,
or broadening trust to all domains. Reusing a previously generated matching certificate
is preferable to generating a new CA before every run.

The automated optional TLS tests establish a real HTTPS connection with the generated
CA and reject an untrusted CA or wrong hostname. That test verifies the generator and
local TLS behavior; physical Android connectivity is verified only after the APK
successfully connects on an actual phone.

## Persistent container deployment

Prerequisites: a running Docker engine and Compose plugin. The delivered machine had the
Compose CLI but its Docker Linux engine was not running at the initial audit; treat a
container runtime as unverified until the commands below actually complete.

```powershell
cd deploy
Copy-Item .env.example .env
# Edit .env: replace RESQ_DEMO_ACCESS_KEY with a freshly generated random key.
docker compose up -d --build
docker compose ps
docker compose exec api python -m app.seed
```

The `incident_data` named volume persists SQLite data independently of the container.
The API runs as a non-root user and has a database-aware health check. `docker compose
restart api` retains data; `docker compose down` also retains the named volume. Removing
the named volume erases the incident database and must not be part of a demo reset.
For a fresh demonstration choose a separate volume/project, rather than deleting evidence.
There is no automatic seeding or destructive startup reset.

The default port binding is loopback (`127.0.0.1`). For an explicitly trusted LAN demo,
set `RESQ_BIND_ADDRESS` to the laptop's private IP. For hosted HTTPS retain loopback and
use the proxy overlay below. All four role requests must reach the same Compose service;
do not start one database/container per role.

## Trusted HTTPS endpoint

Use an existing host/domain you control. Set its DNS A/AAAA record to the server and
permit inbound TCP ports 80 and 443. In `deploy/.env`, set `RESQ_API_DOMAIN`,
`RESQ_TLS_EMAIL`, and a random `RESQ_DEMO_ACCESS_KEY`, then run:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
docker compose -f compose.yaml -f compose.https.yaml ps
docker compose -f compose.yaml -f compose.https.yaml logs proxy
```

The Caddy overlay proxies to `api:8000`; its certificate data and configuration persist
in separate named volumes. With valid DNS/reachability, Caddy obtains a trusted certificate.
Set every phone's API address to `https://YOUR-API-DOMAIN` and enter the demo key.
Check `/health`, log in as every role, and execute the full demo before judging.
Local/self-signed HTTPS certificates are not automatically trusted by Android; a browser
warning bypass is not evidence that the native app will trust the certificate.

## Verify availability and retention

1. Open `/v1/health` from a phone; note its `backend_id` and confirm key-required is true.
2. Enter the same address/key on both phones. Log in to citizen, volunteer, coordinator
   and responder workspaces, checking each can Sync.
3. Create one labelled synthetic citizen SOS and deliver it. Note the report UUID.
4. Restart only the API process/container. Reconnect and confirm the same backend UUID,
   report UUID, audit entries and assignment remain. Retry the same outbox event after
   a lost request; it must return a duplicate receipt, not add an incident.
5. Complete volunteer relay, coordinator review/assignment, and responder progression.
   The original citizen's copy remains pending until its phone receives an API receipt.

## Backups

Use the SQLite online backup command instead of copying a live `.db` file while WAL
writes are active. From `backend`, with the same `DATABASE_URL` as the running server:

```powershell
.venv/Scripts/python.exe -m app.backup --output data/backups/before-mentor-evaluation.db
```

The command creates a new file, never overwrites an existing backup, and checks SQLite
integrity. In the container:

```sh
docker compose exec api python -m app.backup --output /data/backups/before-evaluation.db
docker compose cp api:/data/backups/before-evaluation.db ./before-evaluation.db
```

For restoration, stop API writers and point `DATABASE_URL` at a verified backup copy.
The restored file retains backend identity and event receipts. Test restoration separately
before replacing an operational database. PostgreSQL uses `pg_dump`/restore; the SQLite
backup helper deliberately rejects PostgreSQL URLs.

## Deployment scope

SQLite is the tested hackathon path. PostgreSQL-ready SQLAlchemy models and the driver
are supplied; PostgreSQL runtime and migrations still require validation. This snapshot
initializes missing tables with `create_all`; it does not migrate existing columns.
Production enrollment, session revocation UI, rate limiting, organization membership and
managed monitoring remain separate deployment work. Protect the demo key and use only
synthetic incidents during the competition.

Primary references: [FastAPI container deployment](https://fastapi.tiangolo.com/deployment/docker/),
[Caddy automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https), and
[SQLite online backup API](https://www.sqlite.org/backup.html).
