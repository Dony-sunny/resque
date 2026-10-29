"""Priority, resources, duplicates, teams, missions, relief, shelters, demo reset and the full role workflow."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import estimate, priority
from app.seed import seed_database
from tests.test_api import auth, create_payload, event, sync

NOW = datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc)


@pytest.fixture
def ops_client(tmp_path):
    api = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'ops.db'}", demo_mode=True))
    with TestClient(api) as client:
        seed_database(api.state.engine)
        yield client


def details(**people):
    life = people.pop("life", False)
    return {"people": people, "life_threat": life, "assistance": []}


# ---------- priority engine ----------
def test_priority_formula_weights_and_breakdown():
    result = priority.compute("flood", 10, details(children=2, elderly=1), "unverified", None, NOW - timedelta(minutes=60), now=NOW)
    rows = {r["factor"]: r for r in result["breakdown"]}
    assert rows["severity"]["value"] == 60 and rows["severity"]["weight"] == 0.40
    assert rows["vulnerability"]["value"] == round(3 / 10 * 70 + 15)
    assert rows["waiting"]["value"] == 50 and rows["confidence"]["value"] == 40
    expected = 0.4 * 60 + 0.25 * rows["vulnerability"]["value"] + 0.15 * rows["people"]["value"] + 0.15 * 50 + 0.05 * 40
    assert result["score"] == pytest.approx(expected, abs=0.2)
    assert result["level"] == priority.level_for(result["score"]) and result["override"] is None


def test_level_bands():
    assert [priority.level_for(v) for v in (100, 80, 79.9, 60, 59.9, 35, 34.9, 0)] == ["CRITICAL", "CRITICAL", "HIGH", "HIGH", "MEDIUM", "MEDIUM", "LOW", "LOW"]


def test_life_safety_override_floors_at_critical_unless_rejected():
    fresh = NOW
    low = priority.compute("other", 1, details(life=True), "unverified", "low", fresh, now=NOW)
    assert low["score"] >= 80 and low["level"] == "CRITICAL"
    trapped_injured = priority.compute("supplies", 1, details(trapped=1, injured=1), "unverified", None, fresh, now=NOW)
    assert trapped_injured["level"] == "CRITICAL" and trapped_injured["override"]
    rejected = priority.compute("other", 1, details(life=True), "rejected", None, fresh, now=NOW)
    assert rejected["override"] is None


def test_priority_sorting_puts_critical_first(ops_client):
    reports = ops_client.get("/v1/reports", headers=auth(ops_client, "coordinator")).json()
    scores = sorted((r["priority"]["score"] for r in reports), reverse=True)
    assert scores[0] >= 80
    order = [priority.level_for(s) for s in scores]
    assert order == sorted(order, key=["CRITICAL", "HIGH", "MEDIUM", "LOW"].index)


# ---------- resources ----------
def test_resource_formulas_and_shortfall():
    need = estimate.required("flood", "CRITICAL", {"affected": 20, "trapped": 7, "injured": 4, "children": 0, "elderly": 0, "disabled": 0})
    assert need == {"rescue_teams": 2, "rescue_personnel": 12, "ambulances": 2, "medical_personnel": 2, "boats": 3,
                    "medicine_kits": 10, "food_packets": 60, "water_bottles": 60, "shelter_places": 20}
    rows = {r["key"]: r for r in estimate.compare(need, {"rescue_teams": 1, "boats": 5})}
    assert rows["rescue_teams"]["shortfall"] == 1 and rows["boats"]["shortfall"] == 0 and rows["ambulances"]["shortfall"] == 2


# ---------- duplicates ----------
def test_duplicate_candidates_within_250m_and_30min_are_suggested_not_discarded(ops_client):
    coordinator = auth(ops_client, "coordinator")
    reports = {r["id"]: r for r in ops_client.get("/v1/reports", headers=coordinator).json()}
    first, second = "d0000000-0000-4000-8000-000000000001", "d0000000-0000-4000-8000-000000000002"
    assert second in reports[first]["duplicates"] and first in reports[second]["duplicates"]
    row = sync(ops_client, coordinator, event("report.link_duplicate", second, {"duplicate_of": first}))[0]
    assert row["status"] == "applied" and row["report"]["duplicate_of"] == first
    assert len(ops_client.get("/v1/reports", headers=coordinator).json()) == 20


# ---------- teams and missions ----------
def test_team_matching_and_no_double_assignment(ops_client):
    coordinator = auth(ops_client, "coordinator")
    target = "d0000000-0000-4000-8000-000000000005"  # fire
    ranked = ops_client.get(f"/v1/incidents/{target}/teams", headers=coordinator).json()
    assert ranked and all(t["available"] for t in ranked)
    assert {"team-bravo", "team-charlie"}.isdisjoint({t["id"] for t in ranked})  # already on missions
    assert ranked[0]["id"] == "team-alpha"
    assert sync(ops_client, coordinator, event("report.review", target, {"verification": "verified", "urgency": "high", "urgency_reasons": ["Fire confirmed"], "acknowledge": True}))[0]["status"] == "applied"
    assert sync(ops_client, coordinator, event("report.assign", target, {"team_id": "team-alpha"}))[0]["status"] == "applied"
    other = "d0000000-0000-4000-8000-000000000004"
    sync(ops_client, coordinator, event("report.review", other, {"verification": "verified", "urgency": "critical", "urgency_reasons": ["Cardiac"], "acknowledge": True}))
    clash = sync(ops_client, coordinator, event("report.assign", other, {"team_id": "team-alpha"}))[0]
    assert clash["status"] == "rejected" and "another mission" in clash["error"]
    busy = ops_client.post("/v1/teams/team-alpha/availability", json={"on_duty": False}, headers=auth(ops_client, "responder"))
    assert busy.status_code == 409


def test_mission_transitions_including_in_progress(ops_client):
    coordinator, team = auth(ops_client, "coordinator"), auth(ops_client, "responder")
    target = "d0000000-0000-4000-8000-000000000008"
    sync(ops_client, coordinator, event("report.review", target, {"verification": "verified", "urgency": "critical", "urgency_reasons": ["Collapse"], "acknowledge": True}))
    sync(ops_client, coordinator, event("report.assign", target, {"team_id": "team-alpha"}))
    skip = sync(ops_client, team, event("mission.status", target, {"status": "on_scene"}))[0]
    assert skip["status"] == "rejected"
    for status in ("accepted", "en_route", "on_scene", "in_progress", "completed"):
        assert sync(ops_client, team, event("mission.status", target, {"status": status}))[0]["status"] == "applied"
    teams = {t["id"]: t for t in ops_client.get("/v1/teams", headers=coordinator).json()}
    assert teams["team-alpha"]["available"] is True


# ---------- relief and inventory ----------
def stock(client):
    return {i["key"]: i for i in client.get("/v1/inventory", headers=auth(client, "relief")).json()}


def test_relief_reservation_dispatch_and_no_double_dispatch(ops_client):
    relief = auth(ops_client, "relief")
    rid = "d2000000-0000-4000-8000-000000000005"  # requested, medicine_kits 6
    before = stock(ops_client)["medicine_kits"]
    assert ops_client.post(f"/v1/relief/requests/{rid}/dispatch", headers=relief).status_code == 409  # must be approved and packed first
    assert ops_client.post(f"/v1/relief/requests/{rid}/approve", headers=relief).status_code == 200
    mid = stock(ops_client)["medicine_kits"]
    assert mid["reserved"] == before["reserved"] + 6 and mid["total"] == before["total"]
    assert ops_client.post(f"/v1/relief/requests/{rid}/pack", headers=relief).status_code == 200
    assert ops_client.post(f"/v1/relief/requests/{rid}/dispatch", headers=relief).status_code == 200
    after = stock(ops_client)["medicine_kits"]
    assert after["total"] == before["total"] - 6 and after["reserved"] == before["reserved"]
    assert ops_client.post(f"/v1/relief/requests/{rid}/dispatch", headers=relief).status_code == 409
    assert ops_client.post(f"/v1/relief/requests/{rid}/deliver", headers=relief).json()["status"] == "delivered"


def test_over_allocation_rejected_and_cancel_releases_stock(ops_client):
    coordinator, relief = auth(ops_client, "coordinator"), auth(ops_client, "relief")
    target = "d0000000-0000-4000-8000-000000000006"
    big = str(uuid4())
    sync(ops_client, coordinator, event("relief.request", target, {"id": big, "items": {"shelter_kits": 999}}))
    refused = ops_client.post(f"/v1/relief/requests/{big}/approve", headers=relief)
    assert refused.status_code == 409 and "Not enough stock" in refused.json()["detail"]
    small = str(uuid4())
    sync(ops_client, coordinator, event("relief.request", target, {"id": small, "items": {"shelter_kits": 5}}))
    reserved = stock(ops_client)["shelter_kits"]["reserved"]
    ops_client.post(f"/v1/relief/requests/{small}/approve", headers=relief)
    assert stock(ops_client)["shelter_kits"]["reserved"] == reserved + 5
    ops_client.post(f"/v1/relief/requests/{small}/cancel", headers=relief)
    assert stock(ops_client)["shelter_kits"]["reserved"] == reserved
    assert all(i["available"] >= 0 and i["reserved"] >= 0 for i in stock(ops_client).values())


def test_shelter_capacity_enforced(ops_client):
    relief = auth(ops_client, "relief")
    assert ops_client.post("/v1/shelters/shelter-pala/occupancy", json={"occupancy": 201}, headers=relief).status_code == 422
    row = ops_client.post("/v1/shelters/shelter-changanassery/occupancy", json={"occupancy": 250}, headers=relief).json()
    assert row["remaining"] == 0 and row["status"] == "full"
    assert ops_client.post("/v1/shelters/shelter-kottayam/occupancy", json={"occupancy": 10}, headers=auth(ops_client, "citizen")).status_code == 403


def test_role_authorization_for_operations(ops_client):
    citizen = auth(ops_client, "citizen")
    assert ops_client.post("/v1/relief/requests/d2000000-0000-4000-8000-000000000005/approve", headers=citizen).status_code == 403
    assert ops_client.post("/v1/inventory/food_packets/restock", json={"quantity": 5}, headers=auth(ops_client, "coordinator")).status_code == 403
    assert ops_client.get("/v1/ops/summary", headers=citizen).status_code == 403
    assert ops_client.post("/v1/demo/reset", headers=citizen).status_code == 403


def test_demo_reset_restores_scenario_and_keeps_real_reports(ops_client):
    citizen, coordinator = auth(ops_client, "citizen"), auth(ops_client, "coordinator")
    payload = create_payload()
    assert sync(ops_client, citizen, event("report.create", payload["id"], payload))[0]["status"] == "applied"
    ops_client.post("/v1/demo/simulate", headers=coordinator)
    assert len(ops_client.get("/v1/reports", headers=coordinator).json()) == 23
    ops_client.post("/v1/demo/reset", headers=coordinator)
    ids = [r["id"] for r in ops_client.get("/v1/reports", headers=coordinator).json()]
    assert len(ids) == 21 and payload["id"] in ids


# ---------- complete multi-role workflow ----------
def test_end_to_end_victim_government_rescue_relief(ops_client):
    victim, gov, team, relief = (auth(ops_client, role) for role in ("citizen", "coordinator", "responder", "relief"))
    payload = create_payload()
    payload["incident_type"] = "landslide"
    payload["details"] = {"people": {"trapped": 2, "injured": 1, "children": 1, "elderly": 1, "disabled": 0}, "life_threat": True, "assistance": ["rescue", "food"]}
    created = sync(ops_client, victim, event("report.create", payload["id"], payload))[0]
    assert created["status"] == "applied" and created["report"]["priority"]["level"] == "CRITICAL"
    queue = ops_client.get("/v1/reports", headers=gov).json()
    mine = next(r for r in queue if r["id"] == payload["id"])
    assert [r["factor"] for r in mine["priority"]["breakdown"]] == ["severity", "vulnerability", "people", "waiting", "confidence"]
    assert any(row["key"] == "rescue_teams" and row["required"] >= 1 for row in mine["resources"])
    assert mine["relief"] and mine["relief"][0]["items"] == {"food_packets": 9}  # auto request from the SOS
    sync(ops_client, gov, event("report.review", payload["id"], {"verification": "verified", "urgency": "critical", "urgency_reasons": ["Confirmed by phone"], "acknowledge": True}))
    best = ops_client.get(f"/v1/incidents/{payload['id']}/teams", headers=gov).json()[0]["id"]
    assert best == "team-alpha"
    assert sync(ops_client, gov, event("report.assign", payload["id"], {"team_id": best}))[0]["status"] == "applied"
    missions = ops_client.get("/v1/reports", headers=team).json()
    assert payload["id"] in [m["id"] for m in missions]
    for status in ("accepted", "en_route", "on_scene"):
        assert sync(ops_client, team, event("mission.status", payload["id"], {"status": status}))[0]["status"] == "applied"
    supplies = str(uuid4())
    requested = sync(ops_client, team, event("mission.request", payload["id"], {"id": supplies, "kind": "supplies", "items": {"medicine_kits": 2, "food_packets": 10}}))[0]
    assert requested["status"] == "applied"
    assert sync(ops_client, team, event("mission.request", payload["id"], {"id": supplies, "kind": "supplies", "items": {"medicine_kits": 2, "food_packets": 10}}))[0]["status"] == "applied"  # retried with a new event id: still one request
    pending = [r for r in ops_client.get("/v1/relief/requests", headers=relief).json() if r["id"] == supplies]
    assert len(pending) == 1 and pending[0]["status"] == "requested"
    for action in ("approve", "pack", "dispatch", "deliver"):
        assert ops_client.post(f"/v1/relief/requests/{supplies}/{action}", headers=relief).status_code == 200
    view = next(r for r in ops_client.get("/v1/reports", headers=victim).json() if r["id"] == payload["id"])
    assert view["mission_status"] == "on_scene" and view["team"]["id"] == "team-alpha"
    assert any(r["id"] == supplies and r["status"] == "delivered" for r in view["relief"])
    log = ops_client.get("/v1/audit", headers=gov).json()
    assert {"mission.assigned", "mission.status", "relief.delivered"} <= {row["action"] for row in log}
    assert any(row["previous_status"] == "en_route" and row["new_status"] == "on_scene" for row in log)
