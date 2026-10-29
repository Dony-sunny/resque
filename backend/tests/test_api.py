import hashlib
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.config import Settings
from app.main import create_app
from app.models import Report, Note, Audit, SyncReceipt, User, AuthSession
from app.auth import issue_token
from app.seed import seed_database


@pytest.fixture
def client(tmp_path):
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", demo_mode=True))
    with TestClient(api) as client:
        yield client


def auth(client, role):
    result = client.post("/v1/auth/demo", json={"role": role})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["access_token"]}


def event(kind, report_id, payload, event_id=None):
    return {"id": event_id or str(uuid4()), "kind": kind, "report_id": report_id, "payload": payload}


def create_payload(origin="demo-citizen", token="a" * 64):
    return {"id": str(uuid4()), "incident_type": "flood", "affected_count": 3,
            "description": "Synthetic household at demo shelter",
            "location": {"label": "Demo shelter", "latitude": 9.95, "longitude": 76.25},
            "created_at": "2026-10-29T08:00:00Z", "origin_id": origin,
            "receipt_hash": hashlib.sha256(token.encode()).hexdigest(), "receipt_token": token}


def sync(client, headers, *events):
    response = client.post("/v1/sync", json={"events": list(events)}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["results"]


def create(client, headers=None):
    headers = headers or auth(client, "citizen")
    payload = create_payload()
    row = sync(client, headers, event("report.create", payload["id"], payload))[0]
    assert row["status"] == "applied", row
    return payload, row["report"]


def reviewed(client, payload, version=None):
    change = {"verification": "verified", "urgency": "high", "urgency_reasons": ["Human reviewed: flood surrounds shelter"], "acknowledge": True}
    if version is not None:
        change["expected_version"] = version
    return sync(client, auth(client, "coordinator"), event("report.review", payload["id"], change))[0]


def assigned(client, payload):
    reviewed(client, payload)
    auth(client, "responder")
    return sync(client, auth(client, "coordinator"), event("report.assign", payload["id"], {"responder_id": "demo-responder"}))[0]


def test_auth_required_and_forged_role_header_ignored(client):
    assert client.get("/v1/reports").status_code == 401
    assert client.get("/v1/reports", headers={"X-Role": "coordinator"}).status_code == 401
    assert client.get("/v1/reports", headers={"Authorization": "Bearer fake"}).status_code == 401
    health = client.get("/health").json()
    assert health["status"] == "ok" and health["demo_mode"] is True
    assert health["demo_access_key_required"] is False
    assert str(__import__('uuid').UUID(health["backend_id"])) == health["backend_id"]


def test_demo_login_is_opt_in(tmp_path):
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'non-demo.db'}"))
    with TestClient(api) as client:
        assert client.post("/v1/auth/demo", json={"role": "coordinator"}).status_code == 403
        assert not client.get("/health").json()["demo_mode"]


def test_session_token_stored_hashed_and_expires(client):
    headers = auth(client, "citizen")
    raw = headers["Authorization"].split()[1]
    with Session(client.app.state.engine) as db, db.begin():
        session = db.get(AuthSession, hashlib.sha256(raw.encode()).hexdigest())
        assert session is not None
        assert session.token_hash != raw
        session.expires_at = 1
    assert client.get("/v1/me", headers=headers).status_code == 401


def test_idempotency_and_changed_event_body_conflict(client):
    headers = auth(client, "citizen")
    payload = create_payload()
    queued = event("report.create", payload["id"], payload)
    first, second = sync(client, headers, queued, queued)
    assert (first["status"], second["status"]) == ("applied", "duplicate")
    changed = deepcopy(queued)
    changed["payload"]["affected_count"] = 7
    assert sync(client, headers, changed)[0]["status"] == "conflict"
    with Session(client.app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Report)) == 1
        assert db.scalar(select(func.count()).select_from(SyncReceipt)) == 1


def test_duplicate_report_under_new_event_is_safe(client):
    headers = auth(client, "citizen")
    payload, original = create(client, headers)
    assert sync(client, headers, event("report.create", payload["id"], payload))[0]["status"] == "duplicate"
    changed = deepcopy(payload)
    changed["description"] = "Different content for same id"
    assert sync(client, headers, event("report.create", payload["id"], changed))[0]["status"] == "conflict"
    assert client.get("/v1/reports", headers=headers).json()[0]["description"] == original["description"]


def test_relay_first_then_private_proof_claims_report(client):
    citizen = auth(client, "citizen")
    volunteer = auth(client, "volunteer")
    payload = create_payload()
    relay = {key: value for key, value in payload.items() if key != "receipt_token"}
    result = sync(client, volunteer, event("report.create", payload["id"], relay))[0]
    assert result["status"] == "applied"
    assert result["report"]["delivery_state"] == "delivered"
    assert result["report"]["verification"] == "unverified"
    assert "receipt_token" not in result["report"]
    assert client.get("/v1/reports", headers=citizen).json() == []
    assert client.get(f"/v1/reports/{payload['id']}", headers=citizen).status_code == 404
    assert sync(client, citizen, event("report.create", payload["id"], relay))[0]["status"] == "rejected"
    invalid = {**payload, "receipt_token": "b" * 64}
    assert sync(client, citizen, event("report.create", payload["id"], invalid))[0]["status"] == "rejected"
    claim = sync(client, citizen, event("report.create", payload["id"], payload))[0]
    assert claim["status"] == "duplicate"
    assert claim["report"]["version"] == 2
    assert len(client.get("/v1/reports", headers=citizen).json()) == 1
    assert [row["action"] for row in claim["report"]["audit"]] == ["report.received", "report.claimed"]


def test_origin_claim_alone_does_not_grant_ownership(client):
    volunteer = auth(client, "volunteer")
    citizen = auth(client, "citizen")
    payload = create_payload()
    payload.pop("receipt_token")
    sync(client, volunteer, event("report.create", payload["id"], payload))
    assert client.get("/v1/reports", headers=citizen).json() == []
    assert client.get(f"/v1/reports/{payload['id']}", headers=citizen).status_code == 404


def test_citizen_cannot_claim_foreign_origin_even_with_token(client):
    payload = create_payload(origin="some-other-citizen")
    response = sync(client, auth(client, "citizen"), event("report.create", payload["id"], payload))[0]
    assert response["status"] == "rejected"


def test_receipt_event_id_cannot_be_replayed_by_different_identity(client):
    citizen, volunteer = auth(client, "citizen"), auth(client, "volunteer")
    payload = create_payload()
    queued = event("report.create", payload["id"], payload)
    sync(client, citizen, queued)
    replay = sync(client, volunteer, queued)[0]
    assert replay["status"] == "conflict"
    assert client.get("/v1/reports", headers=volunteer).json() == []


@pytest.mark.parametrize("role", ["citizen", "volunteer", "responder"])
def test_only_coordinator_reviews_assigns_and_lists_responders(client, role):
    payload, _ = create(client)
    headers = auth(client, role)
    assert client.get("/v1/responders", headers=headers).status_code == 403
    result = sync(client, headers, event("report.review", payload["id"], {"verification": "verified", "urgency": "high", "urgency_reasons": ["reason"], "acknowledge": True}))[0]
    assert result["status"] == "rejected"
    result = sync(client, headers, event("report.assign", payload["id"], {"responder_id": "demo-responder"}))[0]
    assert result["status"] == "rejected"


def test_human_urgency_reasons_required_and_bad_event_rolls_back(client):
    payload, initial = create(client)
    bad = event("report.review", payload["id"], {"verification": "verified", "urgency": "critical", "urgency_reasons": [], "acknowledge": True})
    assert sync(client, auth(client, "coordinator"), bad)[0]["status"] == "rejected"
    report = client.get(f"/v1/reports/{payload['id']}", headers=auth(client, "citizen")).json()
    assert report["version"] == 1
    assert report["verification"] == "unverified"
    assert report["delivery_state"] == "delivered"
    assert len(report["audit"]) == 1


def test_optimistic_conflict_rejects_stale_review(client):
    payload, _ = create(client)
    assert reviewed(client, payload, version=1)["status"] == "applied"
    assert reviewed(client, payload, version=1)["status"] == "conflict"
    report = client.get(f"/v1/reports/{payload['id']}", headers=auth(client, "citizen")).json()
    assert report["version"] == 2
    assert report["delivery_state"] == "acknowledged"


def test_assignment_requires_verified_report_and_active_responder(client):
    payload, _ = create(client)
    headers = auth(client, "coordinator")
    assign = event("report.assign", payload["id"], {"responder_id": "demo-responder"})
    assert sync(client, headers, assign)[0]["status"] == "rejected"
    reviewed(client, payload)
    # A terminal failure reserves its event ID. A new user action needs a new ID.
    assert sync(client, headers, assign)[0]["status"] == "rejected"
    assert sync(client, headers, event("report.assign", payload["id"], {"responder_id": "demo-citizen"}))[0]["status"] == "rejected"


def test_mission_flow_notes_audit_and_scoping(client):
    payload, _ = create(client)
    volunteer = auth(client, "volunteer")
    responder = auth(client, "responder")
    assert client.get("/v1/reports", headers=responder).json() == []
    assert client.get("/v1/reports", headers=volunteer).json() == []
    assert assigned(client, payload)["status"] == "applied"
    assert len(client.get("/v1/reports", headers=responder).json()) == 1
    assert sync(client, responder, event("mission.status", payload["id"], {"status": "completed"}))[0]["status"] == "rejected"
    for status in ["accepted", "en_route", "on_scene", "completed"]:
        row = sync(client, responder, event("mission.status", payload["id"], {"status": status}))[0]
        assert row["status"] == "applied", row
    note = {"id": str(uuid4()), "text": "Synthetic field note saved offline at demo site", "created_at": "2026-10-29T09:00:00Z"}
    assert sync(client, responder, event("mission.note", payload["id"], note))[0]["status"] == "applied"
    assert sync(client, responder, event("mission.note", payload["id"], note))[0]["status"] == "duplicate"
    final = client.get(f"/v1/reports/{payload['id']}", headers=auth(client, "coordinator")).json()
    assert len(final["notes"]) == 1
    assert final["mission_status"] == "completed"
    assert len(final["audit"]) == 8
    assert sync(client, auth(client, "coordinator"), event("report.assign", payload["id"], {"responder_id": "demo-responder"}))[0]["status"] == "rejected"


def test_unassigned_responder_cannot_change_or_read_another_mission(client):
    payload, _ = create(client)
    assigned(client, payload)
    with Session(client.app.state.engine) as db, db.begin():
        other = User(id="other-responder", name="Other", role="responder", active=True)
        db.add(other)
        db.flush()
        token = issue_token(db, other)
    headers = {"Authorization": "Bearer " + token}
    assert client.get("/v1/reports", headers=headers).json() == []
    assert client.get(f"/v1/reports/{payload['id']}", headers=headers).status_code == 404
    assert sync(client, headers, event("mission.status", payload["id"], {"status": "accepted"}))[0]["status"] == "rejected"
    assert sync(client, headers, event("mission.note", payload["id"], {"id": str(uuid4()), "text": "forbidden", "created_at": "2026-10-29T09:00:00Z"}))[0]["status"] == "rejected"


def test_batch_partial_failure_preserves_successes_without_partial_bad_mutation(client):
    headers = auth(client, "citizen")
    good = create_payload()
    bad = create_payload()
    bad["affected_count"] = -2
    outcomes = sync(client, headers, event("report.create", good["id"], good), event("report.create", bad["id"], bad))
    assert [row["status"] for row in outcomes] == ["applied", "rejected"]
    assert len(client.get("/v1/reports", headers=headers).json()) == 1


@pytest.mark.parametrize("field,value", [("affected_count", True), ("affected_count", 0), ("affected_count", 10001), ("description", "a" * 501), ("incident_type", "unknown"), ("created_at", "2026-10-29T08:00:00"), ("receipt_hash", "not-a-hash")])
def test_invalid_report_payloads_rejected(client, field, value):
    payload = create_payload()
    payload[field] = value
    assert sync(client, auth(client, "citizen"), event("report.create", payload["id"], payload))[0]["status"] == "rejected"


def test_coordinate_bounds_pairing_and_strict_payload(client):
    headers = auth(client, "citizen")
    for location in [{"label": "demo", "latitude": 200, "longitude": 10}, {"label": "demo", "latitude": 10, "longitude": None}, {"label": "", "latitude": None, "longitude": None}, {"label": "a" * 161, "latitude": None, "longitude": None}]:
        payload = create_payload()
        payload["location"] = location
        assert sync(client, headers, event("report.create", payload["id"], payload))[0]["status"] == "rejected"


def test_semantically_identical_timestamps_and_trimmed_text_are_duplicate_safe(client):
    headers = auth(client, "citizen")
    payload, _ = create(client, headers)
    equivalent = deepcopy(payload)
    equivalent["created_at"] = "2026-10-29T13:30:00.000+05:30"
    equivalent["description"] = "  " + equivalent["description"] + "  "
    equivalent["location"]["label"] += "  "
    assert sync(client, headers, event("report.create", payload["id"], equivalent))[0]["status"] == "duplicate"


def test_seed_is_repeatable_and_contains_only_synthetic_reports(client):
    seed_database(client.app.state.engine)
    seed_database(client.app.state.engine)
    reports = client.get("/v1/reports", headers=auth(client, "coordinator")).json()
    assert len(reports) == 20
    assert all(row["description"].startswith("[SIMULATED]") for row in reports)
    assert all(row["location"]["label"].startswith("Simulated") for row in reports)


def test_rejected_event_id_cannot_be_corrected_in_place(client):
    headers = auth(client, "citizen")
    payload = create_payload()
    payload["affected_count"] = 0
    queued = event("report.create", payload["id"], payload)
    assert sync(client, headers, queued)[0]["status"] == "rejected"
    queued["payload"]["affected_count"] = 3
    assert sync(client, headers, queued)[0]["status"] == "conflict"
    queued["id"] = str(uuid4())
    assert sync(client, headers, queued)[0]["status"] == "applied"


def test_concurrent_create_retries_have_one_report_and_receipt(client):
    from concurrent.futures import ThreadPoolExecutor
    headers = auth(client, "citizen")
    payload = create_payload()
    queued = event("report.create", payload["id"], payload)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(sync, client, headers, queued) for _ in range(2)]
        statuses = [future.result()[0]["status"] for future in futures]
    assert sorted(statuses) == ["applied", "duplicate"]
    with Session(client.app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Report)) == 1
        assert db.scalar(select(func.count()).select_from(SyncReceipt)) == 1
        assert db.scalar(select(func.count()).select_from(Audit)) == 1


def test_concurrent_stale_reviews_have_only_one_winner(client):
    from concurrent.futures import ThreadPoolExecutor
    payload, _ = create(client)
    headers = auth(client, "coordinator")
    review = {"verification": "verified", "urgency": "high", "urgency_reasons": ["Human reviewed synthetic flood"], "acknowledge": True, "expected_version": 1}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(sync, client, headers, event("report.review", payload["id"], review)) for _ in range(2)]
        statuses = [future.result()[0]["status"] for future in futures]
    assert sorted(statuses) == ["applied", "conflict"]
    report = client.get(f"/v1/reports/{payload['id']}", headers=headers).json()
    assert report["version"] == 2
    assert len(report["audit"]) == 2


def test_demo_access_key_protects_all_four_roles(tmp_path):
    key = "synthetic-test-key-" + "x" * 32
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'protected.db'}", demo_mode=True, demo_access_key=key))
    with TestClient(api) as protected:
        health = protected.get("/health").json()
        assert health["demo_access_key_required"] is True
        assert key not in str(health)
        for role in ("citizen", "volunteer", "coordinator", "responder"):
            assert protected.post("/v1/auth/demo", json={"role": role}).status_code == 401
            assert protected.post("/v1/auth/demo", json={"role": role}, headers={"X-Demo-Key": "wrong"}).status_code == 401
            response = protected.post("/v1/auth/demo", json={"role": role}, headers={"X-Demo-Key": key})
            assert response.status_code == 200
            token = response.json()["access_token"]
            me = protected.get("/v1/me", headers={"Authorization": "Bearer " + token})
            assert me.json()["role"] == role
            assert key not in response.text


def test_backend_restart_preserves_identity_reports_sessions_and_receipts(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'persistent.db'}", demo_mode=True)
    with TestClient(create_app(settings)) as first:
        backend_id = first.get("/v1/health").json()["backend_id"]
        headers = auth(first, "citizen")
        payload = create_payload()
        queued = event("report.create", payload["id"], payload)
        assert sync(first, headers, queued)[0]["status"] == "applied"
    # A fresh FastAPI app and engine opens the same file after disposal/restart.
    with TestClient(create_app(settings)) as second:
        assert second.get("/health").json()["backend_id"] == backend_id
        stored = second.get(f"/v1/reports/{payload['id']}", headers=headers)
        assert stored.status_code == 200
        assert stored.json()["delivery_state"] == "delivered"
        duplicate = sync(second, headers, queued)[0]
        assert duplicate["status"] == "duplicate"
        assert len(duplicate["report"]["audit"]) == 1
    with TestClient(create_app(Settings(database_url=f"sqlite:///{tmp_path / 'different.db'}", demo_mode=True))) as other:
        assert other.get("/health").json()["backend_id"] != backend_id


def test_online_sqlite_backup_restores_reports_identity_and_receipts(tmp_path):
    from app.backup import backup_database
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'source.db'}", demo_mode=True)
    backup = tmp_path / "backups" / "snapshot.db"
    with TestClient(create_app(settings)) as original:
        headers = auth(original, "citizen")
        payload, _ = create(original, headers)
        authority = original.get("/health").json()["backend_id"]
        assert backup_database(settings.database_url, backup) == backup.resolve()
        with pytest.raises(ValueError, match="never overwritten"):
            backup_database(settings.database_url, backup)
    with TestClient(create_app(Settings(database_url=f"sqlite:///{backup}", demo_mode=True))) as restored:
        assert restored.get("/health").json()["backend_id"] == authority
        reports = restored.get("/v1/reports", headers=headers).json()
        assert reports[0]["id"] == payload["id"]
        assert len(reports[0]["audit"]) == 1


def sms_text(payload):
    created_ms = int(datetime.fromisoformat(payload["created_at"].replace("Z", "+00:00")).timestamp() * 1000)
    loc = payload["location"]
    lat = "-" if loc["latitude"] is None else repr(loc["latitude"])
    lon = "-" if loc["longitude"] is None else repr(loc["longitude"])
    return "|".join(["RQ1", payload["id"], payload["incident_type"], str(payload["affected_count"]), lat, lon,
                     str(created_ms), payload["origin_id"], payload["receipt_hash"], loc["label"], payload["description"]])


def test_alerts_published_by_coordinator_reach_every_role(client):
    alert = {"title": "Evacuate Ward 5", "body": "Move to GHSS relief camp", "severity": "danger", "area": "Aluva Ward 5", "hours": 6}
    assert client.post("/v1/alerts", json=alert, headers=auth(client, "citizen")).status_code == 403
    created = client.post("/v1/alerts", json=alert, headers=auth(client, "coordinator"))
    assert created.status_code == 200, created.text
    for role in ("citizen", "volunteer", "responder", "coordinator"):
        rows = client.get("/v1/alerts", headers=auth(client, role)).json()
        assert [row["title"] for row in rows] == ["Evacuate Ward 5"]
    assert client.get("/v1/alerts").status_code == 401
    assert client.post("/v1/alerts", json={**alert, "severity": "panic"}, headers=auth(client, "coordinator")).status_code == 422


def test_sms_sos_creates_report_replies_and_app_sync_is_duplicate(client):
    payload = create_payload()
    payload["description"] = "Water rising | two elderly people upstairs"
    form = client.post("/v1/sms/inbound", data={"From": "+919876543210", "Body": sms_text(payload)})
    assert form.status_code == 200 and "<Message>ResQ: SOS" in form.text
    again = client.post("/v1/sms/inbound", json={"from": "+919876543210", "body": sms_text(payload)}).json()
    assert again["status"] == "duplicate"
    report = client.get(f"/v1/reports/{payload['id']}", headers=auth(client, "coordinator")).json()
    assert report["description"] == payload["description"]
    assert any(row["action"] == "sms.received" and "+91****210" in row["detail"] for row in report["audit"])
    # The citizen's own app later syncs the identical report: no new incident, ownership claimed.
    citizen = auth(client, "citizen")
    row = sync(client, citizen, event("report.create", payload["id"], payload))[0]
    assert row["status"] == "duplicate"
    assert [r["id"] for r in client.get("/v1/reports", headers=citizen).json()] == [payload["id"]]
    status = client.post("/v1/sms/inbound", json={"from": "x", "body": "STATUS " + payload["id"][:8]}).json()
    assert payload["id"][:8] in status["reply"] and "delivered" in status["reply"]


def test_sms_rejects_garbage_and_requires_secret_outside_demo(tmp_path):
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'sms.db'}", demo_mode=False))
    with TestClient(api) as plain:
        assert plain.post("/v1/sms/inbound", json={"body": "hello"}).status_code == 403
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'sms2.db'}", sms_secret="s3cret"))
    with TestClient(api) as keyed:
        assert keyed.post("/v1/sms/inbound", json={"body": "hello"}).status_code == 401
        result = keyed.post("/v1/sms/inbound?key=s3cret", json={"body": "help me"}).json()
        assert result["status"] == "rejected" and "112" in result["reply"]


def test_dashboard_page_is_served(client):
    page = client.get("/dashboard")
    assert page.status_code == 200 and "ResQ Control Room" in page.text


def test_sms_shared_vector_matches_mobile_encoder():
    # Exact string produced by mobile/tests/sms-geo.test.ts (encodeSmsReport).
    from app.sms import decode
    text = ("RQ1|30000000-0000-4000-8000-000000000001|trapped|2|10.107612|76.351634|1793261730123|demo-citizen|"
            + "b" * 64 + "|Near St. Mary's Church, Aluva|Water at first floor | two elderly people")
    payload = decode(text)
    assert payload["location"] == {"label": "Near St. Mary's Church, Aluva", "latitude": 10.107612, "longitude": 76.351634}
    assert payload["description"] == "Water at first floor | two elderly people"
    from app.schemas import ReportInput
    assert ReportInput.model_validate(payload).created_at == datetime(2026, 10, 29, 8, 15, 30, 123000, tzinfo=timezone.utc)
