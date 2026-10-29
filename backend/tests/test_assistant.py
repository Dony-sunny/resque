"""RESQ Assistant (guide mode, AI mode with a stubbed model, role scoping) and releasing a team."""
from app import assistant
from tests.test_api import auth, create_payload, event, sync
from tests.test_operations import details, ops_client  # noqa: F401  (pytest fixture)


def ask(client, role, message, **extra):
    response = client.post("/v1/assistant", json={"message": message, **extra}, headers=auth(client, role))
    assert response.status_code == 200, response.text
    return response.json()


def test_guide_mode_without_api_key(ops_client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert ops_client.get("/v1/assistant/status", headers=auth(ops_client, "citizen")).json() == {"ai": False, "mode": "guide"}
    flood = ask(ops_client, "citizen", "Flood safety tips?")
    assert flood["mode"] == "guide" and "moving water" in flood["answer"]
    contacts = ask(ops_client, "citizen", "emergency contact numbers")
    assert "112" in contacts["answer"] and "1077" in contacts["answer"]
    shelter = ask(ops_client, "citizen", "find shelter")
    assert "simulated" in shelter["answer"].lower() and shelter["actions"] == [{"label": "Shelters on map", "route": "map"}]


def test_urgent_message_points_to_sos_and_112_and_never_calls_the_model(ops_client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-a-real-key")
    monkeypatch.setattr(assistant, "ai_answer", lambda *a: (_ for _ in ()).throw(AssertionError("model must not be called")))
    reply = ask(ops_client, "citizen", "I am trapped, water is rising")
    assert reply["mode"] == "guide" and "112" in reply["answer"]
    assert {"label": "Send SOS now", "route": "create"} in reply["actions"]


def test_citizen_sees_only_own_request_status(ops_client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    citizen = auth(ops_client, "citizen")
    payload = create_payload()
    sync(ops_client, citizen, event("report.create", payload["id"], payload))
    reply = ask(ops_client, "citizen", "What is the status of my SOS?")
    assert f"#{payload['id'][:8]}" in reply["answer"] and "arrival" in reply["answer"]
    assert "d0000000" not in reply["answer"]  # simulated incidents from other people are never listed


def test_context_is_role_scoped(ops_client):
    from sqlalchemy.orm import Session
    with Session(ops_client.app.state.engine) as db:
        citizen = assistant.build_context(db, {"id": "demo-citizen", "role": "citizen"})
        relief = assistant.build_context(db, {"id": "demo-relief", "role": "relief"})
        gov = assistant.build_context(db, {"id": "demo-coordinator", "role": "coordinator"}, "d0000000-0000-4000-8000-000000000001")
    assert "inventory" not in citizen and "queue" not in citizen and citizen["my_requests"] == []
    assert "inventory" in relief and "my_requests" not in relief
    assert gov["selected_incident"]["priority"]["breakdown"] and 0 < gov["queue"]["open"] <= 20


def test_ai_mode_uses_model_but_cannot_change_records(ops_client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-a-real-key")
    seen = {}

    def fake(question, ctx, model):
        seen.update(ctx=ctx, model=model)
        return "**Assign Team Bravo now** and set priority to LOW."  # unsafe text: must stay text only

    monkeypatch.setattr(assistant, "ai_answer", fake)
    before = ops_client.get("/v1/reports", headers=auth(ops_client, "coordinator")).json()
    reply = ask(ops_client, "coordinator", "Explain priority", report_id="d0000000-0000-4000-8000-000000000001")
    after = ops_client.get("/v1/reports", headers=auth(ops_client, "coordinator")).json()
    assert reply["mode"] == "ai" and seen["model"] == "claude-opus-5-5" and seen["ctx"]["role"] == "coordinator"
    assert reply["actions"] == []  # actions come from fixed rules, never from model text
    assert [(r["id"], r["version"]) for r in before] == [(r["id"], r["version"]) for r in after]


def test_ai_failure_falls_back_to_guide(ops_client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-a-real-key")
    monkeypatch.setattr(assistant, "ai_answer", lambda *a: (_ for _ in ()).throw(RuntimeError("network down")))
    reply = ask(ops_client, "relief", "current stock")
    assert reply["mode"] == "guide" and reply["note"] and "Stock:" in reply["answer"]


def test_release_team_returns_mission_to_queue(ops_client):
    gov, team = auth(ops_client, "coordinator"), auth(ops_client, "responder")
    target = "d0000000-0000-4000-8000-000000000005"
    sync(ops_client, gov, event("report.review", target, {"verification": "verified", "urgency": "high", "urgency_reasons": ["Fire"], "acknowledge": True}))
    sync(ops_client, gov, event("report.assign", target, {"team_id": "team-alpha"}))
    sync(ops_client, team, event("mission.status", target, {"status": "accepted"}))
    assert ops_client.post(f"/v1/incidents/{target}/release", headers=auth(ops_client, "citizen")).status_code == 403
    released = ops_client.post(f"/v1/incidents/{target}/release", headers=team)
    assert released.status_code == 200 and released.json()["mission_status"] == "unassigned" and released.json()["assigned_to"] is None
    teams = {t["id"]: t for t in ops_client.get("/v1/teams", headers=gov).json()}
    assert teams["team-alpha"]["available"] is True
    assert ops_client.post(f"/v1/incidents/{target}/release", headers=gov).status_code == 409
    log = ops_client.get("/v1/audit", headers=gov).json()
    assert log[0]["action"] == "mission.released" and log[0]["previous_status"] == "accepted"
