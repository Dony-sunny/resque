"""Operations layer shared by all roles: teams, relief inventory, shelters, duplicates and audit."""
import math
from datetime import timedelta, timezone
from sqlalchemy import select
from . import estimate, priority
from .models import (AuditLog, Dispatch, DuplicateLink, IncidentDetail, InventoryItem, MissionAssignment,
                     ReliefRequest, Report, RescueTeam, Shelter, now)

ACTIVE_MISSION = ("assigned", "accepted", "en_route", "on_scene", "in_progress")
RELIEF_FLOW = {"requested": ("approved", "cancelled"), "approved": ("packed", "cancelled"),
               "packed": ("dispatched", "cancelled"), "dispatched": ("delivered",), "delivered": (), "cancelled": ()}
DUPLICATE_METRES, DUPLICATE_MINUTES = 250, 30


class OpsError(Exception):
    def __init__(self, message, status=409):
        self.message, self.status = message, status


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def iso(value):
    return aware(value).astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if value else None


def log(db, actor, action, entity, entity_id, incident_id=None, previous=None, new=None, detail=""):
    db.add(AuditLog(actor_id=actor, action=action, entity=entity, entity_id=entity_id, incident_id=incident_id,
                    previous_status=previous, new_status=new, detail=detail))


def metres(a_lat, a_lon, b_lat, b_lon):
    rad = math.radians
    h = math.sin(rad(b_lat - a_lat) / 2) ** 2 + math.cos(rad(a_lat)) * math.cos(rad(b_lat)) * math.sin(rad(b_lon - a_lon) / 2) ** 2
    return 2 * 6371000 * math.asin(min(1, math.sqrt(h)))


def details_of(db, report_id):
    row = db.get(IncidentDetail, report_id)
    return dict(row.data) if row else {}


def is_resolved(report):
    return report.mission_status == "completed" or report.verification == "rejected"


# ---------- duplicates ----------
def duplicate_candidates(db, report):
    """Similar type, within 250 m and 30 minutes. Candidates are suggested, never discarded."""
    if report.latitude is None or report.longitude is None:
        return []
    created = aware(report.created_at)
    window = timedelta(minutes=DUPLICATE_MINUTES)
    rows = db.scalars(select(Report).where(Report.id != report.id, Report.incident_type == report.incident_type,
                                           Report.latitude.is_not(None))).all()
    return sorted(r.id for r in rows if abs(aware(r.created_at) - created) <= window
                  and metres(report.latitude, report.longitude, r.latitude, r.longitude) <= DUPLICATE_METRES)


# ---------- teams ----------
def active_assignment(db, team_id):
    for assignment in db.scalars(select(MissionAssignment).where(MissionAssignment.team_id == team_id, MissionAssignment.active.is_(True))):
        report = db.get(Report, assignment.report_id)
        if report and report.mission_status in ACTIVE_MISSION and report.assigned_to:
            return report
    return None


def team_view(db, team, origin=None):
    mission = active_assignment(db, team.id)
    view = {"id": team.id, "name": team.name, "capabilities": team.capabilities, "capacity": team.capacity,
            "base": team.base, "latitude": team.latitude, "longitude": team.longitude, "readiness": team.readiness,
            "on_duty": team.on_duty, "lead_user_id": team.lead_user_id, "simulated": team.simulated,
            "mission_id": mission.id if mission else None, "mission_status": mission.mission_status if mission else None,
            "available": team.on_duty and mission is None}
    if origin is not None and origin.latitude is not None:
        view["distance_km"] = round(metres(origin.latitude, origin.longitude, team.latitude, team.longitude) / 1000, 1)
    return view


def team_for_report(db, report):
    assignment = db.scalar(select(MissionAssignment).where(MissionAssignment.report_id == report.id, MissionAssignment.active.is_(True)))
    team = db.get(RescueTeam, assignment.team_id) if assignment else None
    return {"id": team.id, "name": team.name, "simulated": team.simulated} if team else None


NEEDS = {"flood": {"boat", "water"}, "cyclone": {"boat", "water"}, "landslide": {"collapse", "rope"},
         "earthquake": {"collapse"}, "trapped": {"collapse", "rope"}, "fire": {"fire"}, "medical": {"medical"}}


def recommend(db, report):
    """Rank available teams: capability fit 40, proximity 30, readiness 20, spare capacity 10."""
    affected = priority.people_counts(details_of(db, report.id), report.affected_count)["affected"]
    need = NEEDS.get(report.incident_type, set())
    ranked = []
    for team in db.scalars(select(RescueTeam)).all():
        view = team_view(db, team, report)
        if not view["available"]:
            continue
        fit = len(need & set(team.capabilities)) / len(need) if need else 1
        km = view.get("distance_km", 15)
        score = 40 * fit + 30 * max(0, 1 - km / 30) + 20 * team.readiness / 100 + 10 * min(1, team.capacity / max(affected, 1))
        view["match_score"] = round(score)
        view["match_reason"] = f"capability {round(fit * 100)}% · {km} km · readiness {team.readiness}% · capacity {team.capacity}"
        ranked.append(view)
    return sorted(ranked, key=lambda v: -v["match_score"])


# ---------- availability pool and estimates ----------
def pool(db):
    teams = [team_view(db, t) for t in db.scalars(select(RescueTeam)).all()]
    free = [t for t in teams if t["available"]]
    stock = {item.key: item.total - item.reserved for item in db.scalars(select(InventoryItem)).all()}
    shelters = db.scalars(select(Shelter).where(Shelter.open.is_(True))).all()
    return {"rescue_teams": len(free), "rescue_personnel": sum(t["capacity"] for t in free),
            "ambulances": stock.get("ambulances", 0), "medical_personnel": stock.get("medical_personnel", 0),
            "boats": stock.get("boats", 0), "medicine_kits": stock.get("medicine_kits", 0),
            "food_packets": stock.get("food_packets", 0), "water_bottles": stock.get("water_bottles", 0),
            "shelter_places": sum(max(0, s.capacity - s.occupancy) for s in shelters)}


def insight(db, report, available=None):
    details = details_of(db, report.id)
    candidates = duplicate_candidates(db, report)
    link = db.get(DuplicateLink, report.id)
    linked_here = [row.report_id for row in db.scalars(select(DuplicateLink).where(DuplicateLink.duplicate_of == report.id))]
    rank = priority.compute(report.incident_type, report.affected_count, details, report.verification, report.urgency,
                            report.created_at, is_resolved(report), corroborations=len(candidates))
    need = estimate.required(report.incident_type, rank["level"], rank["people"])
    relief = [{"id": r.id, "status": r.status, "items": r.items, "requester_role": r.requester_role, "updated_at": iso(r.updated_at)}
              for r in db.scalars(select(ReliefRequest).where(ReliefRequest.incident_id == report.id).order_by(ReliefRequest.created_at))]
    return {"details": details, "priority": rank, "resources": estimate.compare(need, available if available is not None else pool(db)),
            "team": team_for_report(db, report), "duplicates": candidates, "duplicate_of": link.duplicate_of if link else None,
            "linked_duplicates": linked_here, "relief": relief, "support": details.get("support", [])}


# ---------- relief ----------
def relief_view(db, row):
    dispatch = db.scalar(select(Dispatch).where(Dispatch.request_id == row.id))
    return {"id": row.id, "incident_id": row.incident_id, "requester_id": row.requester_id, "requester_role": row.requester_role,
            "items": row.items, "note": row.note, "status": row.status, "history": row.history, "simulated": row.simulated,
            "created_at": iso(row.created_at), "updated_at": iso(row.updated_at),
            "dispatch": {"id": dispatch.id, "created_at": iso(dispatch.created_at), "delivered_at": iso(dispatch.delivered_at)} if dispatch else None}


def create_relief(db, request_id, incident_id, actor, items, note="", simulated=False):
    existing = db.get(ReliefRequest, request_id)
    if existing:
        if existing.items != items or existing.incident_id != incident_id:
            raise OpsError("Relief request ID already used with different content")
        return existing, True
    known = {item.key for item in db.scalars(select(InventoryItem).where(InventoryItem.kind == "supply"))}
    clean = {key: int(qty) for key, qty in items.items() if int(qty) > 0}
    if not clean or any(key not in known for key in clean):
        raise OpsError(f"Request supplies from: {', '.join(sorted(known))}", 422)
    row = ReliefRequest(id=request_id, incident_id=incident_id, requester_id=actor["id"], requester_role=actor["role"], items=clean,
                        note=note[:300], status="requested", simulated=simulated,
                        history=[{"status": "requested", "actor": actor["id"], "at": iso(now())}])
    db.add(row)
    log(db, actor["id"], "relief.requested", "relief", request_id, incident_id, None, "requested", ", ".join(f"{k}×{v}" for k, v in clean.items()))
    return row, False


def advance_relief(db, row, target, actor):
    if target not in RELIEF_FLOW.get(row.status, ()):
        raise OpsError(f"Cannot move relief request from {row.status} to {target}")
    stock = {key: db.get(InventoryItem, key) for key in row.items}
    if target == "approved":
        short = [f"{key} (need {qty}, free {stock[key].total - stock[key].reserved})" for key, qty in row.items.items() if stock[key].total - stock[key].reserved < qty]
        if short:
            raise OpsError("Not enough stock to allocate: " + "; ".join(short))
        for key, qty in row.items.items():
            stock[key].reserved += qty
    elif target == "cancelled" and row.status in ("approved", "packed"):
        for key, qty in row.items.items():
            stock[key].reserved = max(0, stock[key].reserved - qty)
    elif target == "dispatched":
        if db.scalar(select(Dispatch).where(Dispatch.request_id == row.id)):
            raise OpsError("This request has already been dispatched")
        for key, qty in row.items.items():
            if stock[key].reserved < qty or stock[key].total < qty:
                raise OpsError(f"Stock for {key} changed; re-approve the request")
            stock[key].reserved -= qty
            stock[key].total -= qty
        db.add(Dispatch(request_id=row.id, created_by=actor["id"]))
    elif target == "delivered":
        dispatch = db.scalar(select(Dispatch).where(Dispatch.request_id == row.id))
        dispatch.delivered_at = now()
    previous, row.status, row.updated_at = row.status, target, now()
    row.history = [*row.history, {"status": target, "actor": actor["id"], "at": iso(now())}]
    log(db, actor["id"], f"relief.{target}", "relief", row.id, row.incident_id, previous, target)


# ---------- shelters ----------
def shelter_view(row):
    remaining = max(0, row.capacity - row.occupancy)
    status = "closed" if not row.open else "full" if remaining == 0 else "open"
    return {"id": row.id, "name": row.name, "area": row.area, "latitude": row.latitude, "longitude": row.longitude,
            "capacity": row.capacity, "occupancy": row.occupancy, "remaining": remaining, "facilities": row.facilities,
            "status": status, "simulated": row.simulated}


def set_occupancy(db, row, occupancy, actor):
    if occupancy < 0 or occupancy > row.capacity:
        raise OpsError(f"Occupancy must be between 0 and capacity ({row.capacity})", 422)
    previous, row.occupancy = row.occupancy, occupancy
    log(db, actor["id"], "shelter.occupancy", "shelter", row.id, None, str(previous), str(occupancy))


def inventory_view(row):
    available = row.total - row.reserved
    return {"key": row.key, "name": row.name, "unit": row.unit, "kind": row.kind, "total": row.total, "reserved": row.reserved,
            "available": available, "low_threshold": row.low_threshold, "low": available <= row.low_threshold}
