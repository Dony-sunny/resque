"""Impact Heatmap intensity, role-based privacy, duplicates, relief demand and report provenance."""
import pytest
from app import impact
from tests.test_api import auth, create_payload, event, sync
from tests.test_operations import ops_client  # noqa: F401  (pytest fixture)

DUPLICATE = "d0000000-0000-4000-8000-000000000002"


def test_intensity_formula():
    assert impact.intensity(100, 50, 0, True) == 1.0
    assert impact.intensity(100, 0, 0, True) == pytest.approx(0.6)
    assert impact.intensity(80, 50, 12, True) == pytest.approx(0.4)           # halves every 12 h
    assert impact.intensity(80, 50, 1000, True) == pytest.approx(0.2)         # recency floor 0.25
    assert impact.intensity(100, 50, 0, False) == pytest.approx(0.7)          # unverified counts less
    assert impact.intensity(100, 10_000, 0, True) == 1.0                       # people factor is capped


def get(client, role, path="/v1/map/impact"):
    response = client.get(path, headers=auth(client, role))
    assert response.status_code == 200, response.text
    return response.json()


def test_government_sees_precise_points_and_unverified_flag(ops_client):
    data = get(ops_client, "coordinator")
    assert data["mode"] == "precise" and not data["insufficient"]
    ids = {p["incident_id"] for p in data["points"]}
    assert ids and all(not p["aggregated"] for p in data["points"])
    assert {True, False} <= {p["verified"] for p in data["points"]}
    assert all(0 < p["weight"] <= 1 for p in data["points"])


def test_linked_duplicates_and_resolved_incidents_do_not_count(ops_client):
    gov = auth(ops_client, "coordinator")
    before = {p["incident_id"] for p in get(ops_client, "coordinator")["points"]}
    assert DUPLICATE in before
    assert sync(ops_client, gov, event("report.link_duplicate", DUPLICATE, {"duplicate_of": "d0000000-0000-4000-8000-000000000001"}))[0]["status"] == "applied"
    after = {p["incident_id"] for p in get(ops_client, "coordinator")["points"]}
    assert DUPLICATE not in after and len(after) == len(before) - 1


def test_public_roles_get_only_aggregated_cells_without_ids(ops_client):
    precise = {(p["latitude"], p["longitude"]) for p in get(ops_client, "coordinator")["points"]}
    for role in ("citizen", "volunteer", "relief"):
        data = get(ops_client, role)
        assert data["mode"] == "aggregated" and data["cell_km"] == 2.2
        for p in data["points"]:
            assert p["aggregated"] and "incident_id" not in p
            assert (p["latitude"], p["longitude"]) not in precise          # cell centres, never a victim's coordinates
            assert not (p["count"] == 1 and p["verified"] == 0)            # single unverified reports are suppressed


def test_responder_sees_only_assigned_incidents_precisely(ops_client):
    gov, team = auth(ops_client, "coordinator"), auth(ops_client, "responder")
    target = "d0000000-0000-4000-8000-000000000005"
    sync(ops_client, gov, event("report.review", target, {"verification": "verified", "urgency": "high", "urgency_reasons": ["Fire"], "acknowledge": True}))
    sync(ops_client, gov, event("report.assign", target, {"team_id": "team-alpha"}))
    data = get(ops_client, "responder")
    precise = [p for p in data["points"] if not p["aggregated"]]
    assert [p["incident_id"] for p in precise] == [target]


def test_insufficient_data_is_reported_not_faked(ops_client):
    from sqlalchemy import update
    from sqlalchemy.orm import Session
    from app.models import Report
    with Session(ops_client.app.state.engine) as db, db.begin():
        db.execute(update(Report).values(verification="rejected"))
    data = get(ops_client, "citizen")
    assert data["insufficient"] is True and data["points"] == []


def test_relief_demand_overlay_and_permissions(ops_client):
    data = get(ops_client, "relief", "/v1/map/relief-demand")
    assert data["points"] and all(p["requests"] >= 1 and p["items"] for p in data["points"])
    assert max(p["weight"] for p in data["points"]) == 1.0
    assert ops_client.get("/v1/map/relief-demand", headers=auth(ops_client, "citizen")).status_code == 403


def test_provenance_distinguishes_relayed_citizen_and_simulated(ops_client):
    reports = {r["id"]: r for r in ops_client.get("/v1/reports", headers=auth(ops_client, "coordinator")).json()}
    relayed = reports["d0000000-0000-4000-8000-000000000007"]["provenance"]
    assert relayed == {"source": "community_relay", "relay_carriers": 1, "simulated": True}
    citizen = auth(ops_client, "citizen")
    payload = create_payload()
    sync(ops_client, citizen, event("report.create", payload["id"], payload))
    mine = next(r for r in ops_client.get("/v1/reports", headers=auth(ops_client, "coordinator")).json() if r["id"] == payload["id"])
    assert mine["provenance"]["source"] == "citizen" and mine["provenance"]["simulated"] is False
