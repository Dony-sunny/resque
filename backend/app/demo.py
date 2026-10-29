"""SIMULATED Kottayam (Kerala) demonstration data, reset and simulation.

Every simulated incident ID starts with "d0000000-" and every description with "[SIMULATED]";
simulated alerts start with "d1000000-". Reset removes only those records (plus the legacy
"10000000-" synthetic seed) and restores teams, shelters and stock. Real reports are kept.
"""
import hashlib
from datetime import timedelta
from uuid import uuid4
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session
from . import ops
from .auth import ensure_demo_users
from .models import (Alert, Assignment, Audit, AuditLog, Dispatch, DuplicateLink, IncidentDetail, InventoryItem, MissionAssignment,
                     Note, ReliefRequest, Report, RescueTeam, Shelter, Submission, SyncReceipt, User, now)
from .schemas import ReportInput
from .service import digest

DEMO_PREFIXES = ("d0000000-", "10000000-0000-4000-8000-")
ALERT_PREFIX = "d1000000-"
TEAM_LEADS = {"team-alpha": "demo-responder", "team-bravo": "lead-bravo", "team-charlie": "lead-charlie", "team-delta": "lead-delta", "team-echo": "lead-echo"}
TEAMS = [
    ("team-alpha", "Team Alpha · Kottayam Fire & Rescue", ["fire", "collapse", "rope", "medical"], 8, "Kottayam town station", 9.5916, 76.5222, 95),
    ("team-bravo", "Team Bravo · Flood Rescue (simulated)", ["boat", "water", "medical"], 12, "Kumarakom jetty", 9.6175, 76.4300, 90),
    ("team-charlie", "Team Charlie · Pala Hill Rescue", ["collapse", "rope"], 6, "Pala", 9.7110, 76.6830, 85),
    ("team-delta", "Team Delta · Medical Response", ["medical"], 4, "Changanassery", 9.4447, 76.5413, 92),
    ("team-echo", "Team Echo · Vaikom Boat Squad", ["boat", "water"], 10, "Vaikom", 9.7490, 76.3960, 70),
]
SHELTERS = [
    ("shelter-kumarakom", "St. Mary's School, Kumarakom", "Kumarakom", 9.6190, 76.4290, 300, 180, ["food", "water", "medical"]),
    ("shelter-kottayam", "Govt. HSS Kottayam", "Kottayam town", 9.5870, 76.5250, 500, 420, ["food", "water", "toilets"]),
    ("shelter-pala", "Pala Parish Hall", "Pala", 9.7100, 76.6850, 200, 200, ["food", "water"]),
    ("shelter-changanassery", "Changanassery Community Centre", "Changanassery", 9.4460, 76.5400, 250, 60, ["food", "water", "medical", "power"]),
]
INVENTORY = [("food_packets", "Food packets", "packets", "supply", 2000, 300), ("water_bottles", "Water bottles", "1 L bottles", "supply", 3000, 500),
             ("medicine_kits", "Medicine kits", "kits", "supply", 150, 30), ("blankets", "Blankets", "pieces", "supply", 400, 60),
             ("shelter_kits", "Shelter kits", "kits", "supply", 80, 15), ("ambulances", "Ambulances", "vehicles", "asset", 6, 1),
             ("boats", "Rescue boats", "boats", "asset", 8, 1), ("medical_personnel", "Medical personnel", "people", "asset", 20, 3)]
# (type, affected, trapped, injured, children, elderly, disabled, life_threat, assistance, place, lat, lon, minutes_ago, verification, urgency, team, mission)
INCIDENTS = [
    ("flood", 6, 2, 1, 2, 1, 0, True, ["rescue", "food", "water"], "Kumarakom, near boat jetty", 9.6170, 76.4310, 35, "verified", "critical", "team-bravo", "en_route"),
    ("flood", 5, 2, 0, 1, 1, 0, False, ["rescue"], "Kumarakom jetty road (possible duplicate)", 9.6178, 76.4318, 28, "unverified", None, None, "unassigned"),
    ("landslide", 9, 4, 3, 2, 2, 0, True, ["rescue", "ambulance", "medicine"], "Erattupetta, Teekoy road", 9.6870, 76.7760, 50, "verified", "critical", "team-charlie", "on_scene"),
    ("medical", 1, 0, 1, 0, 1, 0, True, ["ambulance"], "Ettumanoor, temple street", 9.6700, 76.5600, 12, "unverified", None, None, "unassigned"),
    ("fire", 4, 1, 1, 1, 0, 0, False, ["rescue", "ambulance"], "Kottayam, MC Road shop block", 9.5940, 76.5210, 20, "unverified", None, None, "unassigned"),
    ("flood", 30, 0, 0, 8, 6, 2, False, ["food", "water", "shelter"], "Thiruvarppu, low-lying ward 4", 9.5850, 76.4870, 95, "verified", "high", None, "unassigned"),
    ("cyclone", 12, 0, 2, 3, 2, 0, False, ["shelter", "food"], "Vaikom lakeside houses", 9.7480, 76.3990, 70, "unverified", None, None, "unassigned"),
    ("earthquake", 3, 1, 2, 0, 1, 0, True, ["rescue", "ambulance"], "Mundakayam, old church building", 9.5370, 76.8840, 15, "unverified", None, None, "unassigned"),
    ("flood", 18, 0, 1, 5, 4, 1, False, ["food", "water", "medicine"], "Changanassery, AC canal side", 9.4470, 76.5300, 140, "verified", "medium", None, "unassigned"),
    ("medical", 2, 0, 2, 0, 0, 0, False, ["medical", "medicine"], "Pala, near private bus stand", 9.7120, 76.6820, 40, "verified", "high", None, "unassigned"),
    ("landslide", 7, 0, 1, 2, 1, 0, False, ["shelter", "food"], "Kanjirappally, hillside colony", 9.5570, 76.7900, 110, "unverified", None, None, "unassigned"),
    ("flood", 4, 0, 0, 1, 2, 1, False, ["food", "water"], "Ayarkunnam, paddy field houses", 9.6200, 76.5900, 60, "unverified", None, None, "unassigned"),
    ("fire", 2, 0, 0, 0, 0, 0, False, [], "Puthuppally, rubber smokehouse", 9.5600, 76.5700, 25, "unverified", None, None, "unassigned"),
    ("supplies", 40, 0, 0, 10, 8, 3, False, ["food", "water"], "Kumarakom relief point", 9.6160, 76.4280, 180, "verified", "medium", None, "unassigned"),
    ("trapped", 3, 3, 1, 1, 0, 0, True, ["rescue"], "Kidangoor, collapsed wall", 9.6950, 76.6170, 18, "unverified", None, None, "unassigned"),
    ("flood", 10, 0, 0, 3, 2, 0, False, ["food"], "Vaikom ward 9", 9.7500, 76.3970, 200, "verified", "low", "team-echo", "completed"),
    ("other", 1, 0, 0, 0, 1, 0, False, [], "Kottayam railway station area", 9.5800, 76.5300, 45, "rejected", "low", None, "unassigned"),
    ("medical", 1, 0, 1, 0, 0, 1, False, ["medical"], "Meenachil, near panchayat office", 9.6800, 76.6500, 30, "unverified", None, None, "unassigned"),
    ("cyclone", 6, 0, 0, 2, 1, 0, False, ["shelter"], "Kumarakom backwater homestays", 9.6100, 76.4200, 85, "unverified", None, None, "unassigned"),
    ("flood", 15, 1, 0, 4, 3, 1, False, ["rescue", "food", "water"], "Thalayolaparambu, river bank", 9.7850, 76.4450, 55, "unverified", None, None, "unassigned"),
]
# (incident index or None, requester, role, items, status)
RELIEF = [
    (0, "demo-citizen", "citizen", {"food_packets": 18, "water_bottles": 18}, "approved"),
    (5, "demo-coordinator", "coordinator", {"food_packets": 90, "water_bottles": 90, "blankets": 30}, "packed"),
    (8, "demo-coordinator", "coordinator", {"food_packets": 54, "medicine_kits": 4}, "dispatched"),
    (13, "demo-coordinator", "coordinator", {"food_packets": 120, "water_bottles": 120}, "delivered"),
    (2, "demo-responder", "responder", {"medicine_kits": 6}, "requested"),
    (6, "demo-coordinator", "coordinator", {"blankets": 12, "shelter_kits": 3}, "requested"),
    (9, "demo-coordinator", "coordinator", {"medicine_kits": 4}, "approved"),
    (10, "demo-coordinator", "coordinator", {"shelter_kits": 2, "food_packets": 21}, "requested"),
    (11, "demo-citizen", "citizen", {"food_packets": 12, "water_bottles": 12}, "cancelled"),
    (19, "demo-coordinator", "coordinator", {"food_packets": 45, "water_bottles": 45}, "requested"),
]


def incident_id(index):
    return f"d0000000-0000-4000-8000-{index + 1:012d}"


def relief_id(index):
    return f"d2000000-0000-4000-8000-{index + 1:012d}"


def is_demo(report_id):
    return report_id.startswith(DEMO_PREFIXES)


def insert_incident(db, report_id, spec, created):
    kind, affected, trapped, injured, children, elderly, disabled, life, assistance, place, lat, lon = spec[:12]
    people = f"{affected} people" + (f", {trapped} trapped" if trapped else "") + (f", {injured} injured" if injured else "")
    payload = {"id": report_id, "incident_type": kind, "affected_count": affected, "description": f"[SIMULATED] {kind.title()} SOS: {people}.",
               "location": {"label": f"Simulated · {place}", "latitude": lat, "longitude": lon}, "created_at": created.isoformat(),
               "origin_id": "simulated-caller", "receipt_hash": hashlib.sha256(report_id.encode()).hexdigest()}
    immutable = ReportInput.model_validate(payload).model_dump(mode="json")
    report = Report(id=report_id, origin_id="simulated-caller", owner_id=None, receipt_hash=immutable["receipt_hash"],
                    immutable_hash=digest(immutable), immutable_payload=immutable, incident_type=kind, affected_count=affected,
                    description=immutable["description"], location_label=immutable["location"]["label"], latitude=lat, longitude=lon,
                    created_at=created, updated_at=created, version=1)
    db.add(report)
    db.flush()
    db.add(IncidentDetail(report_id=report_id, simulated=True, data={"people": {"trapped": trapped, "injured": injured, "children": children, "elderly": elderly, "disabled": disabled},
                                                                    "life_threat": life, "assistance": assistance, "support": []}))
    db.add(Audit(report_id=report_id, actor_id="demo-coordinator", action="report.received", detail="SIMULATED incident created by the demo seed"))
    return report


def clear_demo(db):
    ids = [rid for rid in db.scalars(select(Report.id)) if is_demo(rid)]
    reliefs = [r.id for r in db.scalars(select(ReliefRequest).where(or_(ReliefRequest.simulated.is_(True), ReliefRequest.incident_id.in_(ids))))]
    db.execute(delete(Dispatch).where(Dispatch.request_id.in_(reliefs)))
    db.execute(delete(ReliefRequest).where(ReliefRequest.id.in_(reliefs)))
    db.execute(delete(AuditLog).where(or_(AuditLog.incident_id.in_(ids), AuditLog.entity_id.in_(reliefs))))
    for model, column in ((DuplicateLink, DuplicateLink.report_id), (DuplicateLink, DuplicateLink.duplicate_of), (IncidentDetail, IncidentDetail.report_id),
                          (MissionAssignment, MissionAssignment.report_id), (Assignment, Assignment.report_id), (Note, Note.report_id),
                          (Audit, Audit.report_id), (Submission, Submission.report_id), (SyncReceipt, SyncReceipt.report_id)):
        db.execute(delete(model).where(column.in_(ids)))
    db.execute(delete(Report).where(Report.id.in_(ids)))
    db.execute(delete(Alert).where(Alert.id.like(ALERT_PREFIX + "%")))


def reset_demo(engine):
    with Session(engine) as db, db.begin():
        ensure_demo_users(db)
        for team_id, lead in TEAM_LEADS.items():
            if db.get(User, lead) is None:
                db.add(User(id=lead, name=f"{team_id.split('-')[1].title()} lead (simulated)", role="responder", active=True))
        db.flush()
        clear_demo(db)
        db.flush()
        for team_id, name, caps, capacity, base, lat, lon, readiness in TEAMS:
            team = db.get(RescueTeam, team_id) or RescueTeam(id=team_id)
            team.name, team.capabilities, team.capacity, team.base, team.latitude, team.longitude = name, caps, capacity, base, lat, lon
            team.readiness, team.on_duty, team.lead_user_id, team.simulated = readiness, True, TEAM_LEADS[team_id], team_id != "team-alpha"
            db.merge(team)
        for shelter_id, name, area, lat, lon, capacity, occupancy, facilities in SHELTERS:
            db.merge(Shelter(id=shelter_id, name=name, area=area, latitude=lat, longitude=lon, capacity=capacity, occupancy=occupancy,
                             facilities=facilities, open=True, simulated=True))
        for key, name, unit, kind, total, low in INVENTORY:
            db.merge(InventoryItem(key=key, name=name, unit=unit, kind=kind, total=total, reserved=0, low_threshold=low))
        db.flush()
        clock = now()
        for index, spec in enumerate(INCIDENTS):
            report = insert_incident(db, incident_id(index), spec, clock - timedelta(minutes=spec[12]))
            verification, urgency, team_id, mission = spec[13:]
            report.verification, report.urgency = verification, urgency
            if urgency:
                report.urgency_reasons = ["SIMULATED coordinator review for the demonstration"]
                report.delivery_state = "acknowledged"
                report.version += 1
            if team_id:
                team = db.get(RescueTeam, team_id)
                report.assigned_to, report.mission_status = team.lead_user_id, mission
                db.add(MissionAssignment(report_id=report.id, team_id=team_id, assigned_by="demo-coordinator"))
                db.add(Assignment(report_id=report.id, responder_id=team.lead_user_id, coordinator_id="demo-coordinator"))
                report.version += 1
        db.flush()
        for index, (incident, requester, role, items, status) in enumerate(RELIEF):
            row = ReliefRequest(id=relief_id(index), incident_id=incident_id(incident) if incident is not None else None, requester_id=requester,
                                requester_role=role, items=items, note="SIMULATED demo request", status=status, simulated=True,
                                history=[{"status": status, "actor": "demo-seed", "at": ops.iso(clock)}])
            db.add(row)
            db.flush()
            if status in ("approved", "packed"):
                for key, qty in items.items():
                    db.get(InventoryItem, key).reserved += qty
            if status in ("dispatched", "delivered"):
                db.add(Dispatch(request_id=row.id, created_by="demo-relief", delivered_at=clock if status == "delivered" else None))
        # Real (non-demo) requests that are approved/packed keep their reservations across a reset.
        for row in db.scalars(select(ReliefRequest).where(ReliefRequest.simulated.is_(False), ReliefRequest.status.in_(("approved", "packed")))):
            for key, qty in row.items.items():
                db.get(InventoryItem, key).reserved += qty
        db.add(Alert(id=f"{ALERT_PREFIX}0000-4000-8000-000000000001", title="[SIMULATED] Orange alert: heavy rain in Kottayam district",
                     body="Meenachil river rising. Residents of low-lying areas in Kumarakom and Thiruvarppu should move to relief camps.",
                     severity="warning", area="Kottayam district", created_by="demo-coordinator", expires_at=clock + timedelta(hours=24)))
        ops.log(db, "demo-coordinator", "demo.reset", "demo", "kottayam", None, None, None, "Simulated Kottayam scenario restored")
    return {"incidents": len(INCIDENTS), "teams": len(TEAMS), "shelters": len(SHELTERS), "relief_requests": len(RELIEF)}


SIM_PLACES = [("flood", "Kumarakom north canal", 9.6250, 76.4350), ("landslide", "Melukavu hill road", 9.7400, 76.7400),
              ("medical", "Kottayam KSRTC stand", 9.5890, 76.5240), ("fire", "Ettumanoor market", 9.6710, 76.5590)]


def simulate(engine):
    """Adds two SIMULATED SOS calls and advances missions of simulated teams by one step."""
    steps = {"assigned": "accepted", "accepted": "en_route", "en_route": "on_scene", "on_scene": "in_progress", "in_progress": "completed"}
    created, advanced = [], []
    with Session(engine) as db, db.begin():
        count = sum(1 for rid in db.scalars(select(Report.id)) if rid.startswith("d0000000-0000-4000-9000-"))
        for offset in range(2):
            kind, place, lat, lon = SIM_PLACES[(count + offset) % len(SIM_PLACES)]
            rid = f"d0000000-0000-4000-9000-{uuid4().int % 10**12:012d}"
            spec = (kind, 3 + offset * 2, offset, 1, 1, 1, 0, offset == 0, ["rescue", "food"], place, lat + offset * 0.002, lon)
            insert_incident(db, rid, spec, now())
            created.append(rid)
        for team in db.scalars(select(RescueTeam).where(RescueTeam.simulated.is_(True))):
            mission = ops.active_assignment(db, team.id)
            if mission and mission.mission_status in steps:
                previous, mission.mission_status = mission.mission_status, steps[mission.mission_status]
                mission.version += 1
                mission.updated_at = now()
                db.add(Audit(report_id=mission.id, actor_id=team.lead_user_id, action="mission.status", detail=f"SIMULATED: {mission.mission_status}"))
                ops.log(db, team.lead_user_id, "mission.status", "incident", mission.id, mission.id, previous, mission.mission_status, "SIMULATED progress")
                advanced.append({"team": team.name, "status": mission.mission_status})
    return {"created": created, "advanced": advanced}
