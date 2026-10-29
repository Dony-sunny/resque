# ResQ Relay backend

Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic 2. Run from this directory.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
$env:RESQ_DEMO_MODE='true'
$env:DATABASE_URL='sqlite:///./resq-relay.db'
.venv\Scripts\python -m app.seed
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

POSIX shells: `export RESQ_DEMO_MODE=true`, `export DATABASE_URL=sqlite:///./resq-relay.db`, use `.venv/bin/python`.

Interactive API documentation: http://localhost:8000/docs. Health: http://localhost:8000/health.

```powershell
python -m pytest -q
```

`POST /v1/auth/demo` with `{"role":"citizen"}` returns a random bearer token and the corresponding server identity. Supported roles: citizen, volunteer, coordinator, responder. Tokens expire after 24 hours; only their SHA256 hashes are stored. Demo role selection works only when `RESQ_DEMO_MODE=true`. If `RESQ_DEMO_ACCESS_KEY` is set, login also requires the same key in `X-Demo-Key`; set a random key before exposing a controlled demo endpoint beyond the trusted local network. All four roles intentionally share this enrollment key, then receive separate role-scoped bearer sessions. With demo mode disabled there is no public provisioning/login API; managed production authentication remains an explicit extension point. Authenticated role, ownership, report visibility and mission assignment are checked on the server for every request/event.

`GET /health` and `GET /v1/health` return the persisted `backend_id`, `demo_mode`, and `demo_access_key_required`, without returning any credentials. Backend identity survives restarts and travels with backups, so the app can safely recognize the same database through a different reachable address. A new independent database gets a new identity. Use one database/service for all four demo roles.

`POST /v1/sync` accepts up to 100 events. Each event applies atomically and returns `applied`, `duplicate`, `rejected` or `conflict`. Retry a transient failure with the **same event ID and unchanged body**. A successful receipt is persisted transactionally with the report mutation; terminal rejected/conflict IDs are also reserved. A reused event ID with a changed body or identity conflicts. A report ID with different immutable content conflicts. Permanent failures do not partially mutate reports. A stale `expected_version` requires refresh and a human decision using a new event ID. Events are processed in request order. Safe retries after a lost HTTP response cannot duplicate notes, report creation or audit entries.

Receipt ownership: every report carries the SHA256 hash of a private 64-hex-character `receipt_token`. SHA256 is computed over the token's **UTF8 string**, not decoded bytes. QR contains only `receipt_hash`. A citizen's direct create event additionally includes `receipt_token`; it must match the hash and authenticated `origin_id`. A volunteer can upload without the token but cannot establish citizen ownership. If relay arrives first, the original citizen later retries its unchanged original report with its private proof, safely attaches ownership and receives the server receipt. Never log or put the token in QR, audit, or API report output. All new reports remain unverified until a coordinator reviews them.

Coordinators supply human urgency reasons, acknowledge, verify and assign only verified reports. Responder transitions follow assigned → accepted → en_route → on_scene → completed. Only the assigned responder adds notes or changes mission state. Assignments, human reviews, ownership claims, relay receipt and field updates are audited. Reassignment creates an assignment history row, invalidating the prior active assignment.

SQLite uses foreign keys, WAL, a busy timeout and `BEGIN IMMEDIATE` writer serialization so optimistic checks are atomic. For PostgreSQL set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/resq`; models use portable SQLAlchemy types, UUID strings, JSON and row locks. PostgreSQL is supported by the model/engine design but not exercised in this local test environment. `create_all` initializes a fresh database; schema migrations, TLS, rate limits, identity provisioning, token revocation UI and operational deployment are not shipped as production features.

The seed command is opt-in, repeatable and inserts 3 explicitly synthetic reports, one assigned mission and four demo identities. It never resets an existing database. To start a fresh demonstration use a new database filename. Client SQLite storage and server database are independent; restart either process without losing its queued data.

Docker local demo:

```sh
docker build -t resq-relay-api .
docker run --rm -p 127.0.0.1:8000:8000 -e RESQ_DEMO_MODE=true -v resq-data:/data resq-relay-api
```

The container does not seed automatically. Run `docker exec <container-id> python -m app.seed` with the demo environment enabled if synthetic incidents are desired. The current image runs as a non-root user and exposes a health check. For persistent storage plus a protected demo key and optional HTTPS reverse proxy, use [the deployment guide](../docs/DEPLOYMENT.md) and `deploy/compose.yaml`.

Create a consistent online SQLite backup with `python -m app.backup --output data/backups/unique-name.db`, using the same `DATABASE_URL` as the server. The helper never overwrites an existing file and checks database integrity. Automated tests include restore into a fresh application, preserving backend identity, sessions, reports and audit history.
