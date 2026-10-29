# Architecture and extension guide

ResQ Relay is a store-and-forward incident workflow. A phone can save an incident,
physically carry a QR copy, and submit it when an API connection becomes available.
It does not transmit across disconnected phones automatically.

## Boundaries

* `mobile/src/core`: domain types, SQLite repository, relay codec, API client, outbox,
  English/Malayalam strings, and the service facade shared by all screens.
* `mobile/src/features`: citizen capture, volunteer relay, coordinator review,
  responder missions, and settings. The feature registry is the extension point for screens.
* `mobile/src/ui`: accessible reusable presentation components and theme.
* `backend/app`: API routes, authentication, database models, policy and sync processing.
* `backend/tests` and `mobile/tests`: protocol, durability, authorization and retry tests.

Screens call services; services update SQLite; the queue sends authenticated events.
Each normalized backend URL selects its own SQLite database; each role selects its own
rows and outbox within that database. Configure the address before a demo. Changing an
address never silently submits an existing authority's queued reports to another server.
Returning to the exact previous address restores the retained local workspace.
Adding a feature should preserve those boundaries. Add a module to the screen registry,
extend shared types, add a validated event payload and explicit permission policy on
the server, and register an event handler. Add schema migrations before changing a
deployed database. Never give a new role permission by hiding or showing a button alone.

## Delivery and mission state are separate

`pending` means the phone has a durable local copy. `delivered` requires an API receipt.
`acknowledged` requires a coordinator review. Neither means rescuers have arrived.
Verification, human urgency assessment and mission progress are independent fields.
A volunteer QR scan is custody transfer only. The original citizen remains pending
until it reconnects and receives an authoritative server response.

## Identity and duplicates

Report UUIDs survive every hop. Event UUIDs survive every retry. Receipt records on the
server bind the event ID to its content and submitting identity. Repeating an ID with
different content must fail; repeating an immutable report through another volunteer
must not create another incident. The QR never contains a bearer credential or report
ownership secret. A public SHA-256 receipt hash binds a citizen's locally held secret
to the report. On reconnect the citizen presents the secret over the authenticated API
to claim its previously relayed report. The origin name/ID in a QR is an unverified claim.

## Durability and conflicts

Saving a report and enqueueing creation happen in one SQLite transaction. Queue entries
retain their event IDs after timeouts and app restarts. The sender processes events in
order, uses bounded backoff, and presents permanent rejections and stale-version conflicts
for human resolution. A lost HTTP response can cause a retry, but it cannot cause a
second accepted mutation. A locally queued mission note remains visible until confirmed.
Queued mission transitions project the next on-device status while retaining the last
server-confirmed status separately. Expected versions include preceding queued mutations;
an external concurrent change pauses the report queue for review rather than overwriting.

Foreground reconnect checks and a manual Sync button drive eventual delivery. Mobile
operating systems may suspend the app, so delivery is not guaranteed while it is closed.
All devices must eventually reach the same backend. QR export is one bounded incident
at a time; large attachments and multi-frame QR are outside this MVP.

## Deployment boundary

SQLAlchemy models target SQLite and PostgreSQL; changing `DATABASE_URL` requires the
appropriate database driver and a migration strategy. Production authentication,
organization membership, account enrollment, retention policies, secure local database
encryption, migrations and operational monitoring require further work. Demo identity
selection is a deliberately gated local exercise. Human urgency reasons are entered by
a coordinator; there is no automated medical triage or AI severity decision.
