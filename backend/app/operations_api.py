"""HTTP routes for teams, relief, inventory, shelters, KPIs, audit, the assistant and demo controls."""
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from . import assistant, demo, impact, ops
from .auth import current_user
from .models import Assignment, AuditLog, Facility, IncidentDetail, InventoryItem, MissionAssignment, ReliefRequest, Report, RescueTeam, Shelter, now
from .service import audit, serialize_report, visible

router = APIRouter(prefix="/v1")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Availability(Strict):
    on_duty: bool


class Occupancy(Strict):
    occupancy: int = Field(ge=0, le=100000, strict=True)


class Restock(Strict):
    quantity: int = Field(gt=0, le=100000, strict=True)


class Question(Strict):
    message: str = Field(min_length=1, max_length=500)
    report_id: str | None = Field(default=None, max_length=36)


def engine_of(request: Request):
    return request.app.state.engine


def need(user, *roles):
    if user["role"] not in roles:
        raise HTTPException(403, "Your role cannot perform this action")


def fail(exc: ops.OpsError):
    raise HTTPException(exc.status, exc.message)


@router.get("/ops/summary")
def summary(request: Request, user=Depends(current_user)):
    need(user, "coordinator", "relief")
    with Session(engine_of(request)) as db:
        available = ops.pool(db)
        open_reports = [r for r in db.scalars(select(Report)) if not ops.is_resolved(r)]
        ranked = [ops.insight(db, r, available) for r in open_reports]
        teams = [ops.team_view(db, t) for t in db.scalars(select(RescueTeam))]
        shelters = [ops.shelter_view(s) for s in db.scalars(select(Shelter))]
        stock = [ops.inventory_view(i) for i in db.scalars(select(InventoryItem))]
        demand = {}
        for info in ranked:
            for row in info["resources"]:
                demand[row["key"]] = demand.get(row["key"], 0) + row["required"]
        shortages = [{"key": key, "required": total, "available": available.get(key, 0), "shortfall": total - available.get(key, 0)}
                     for key, total in demand.items() if total > available.get(key, 0)]
        return {"active_sos": len(open_reports), "critical": sum(i["priority"]["level"] == "CRITICAL" for i in ranked),
                "unassigned": sum(1 for r in open_reports if not r.assigned_to), "teams_available": sum(t["available"] for t in teams),
                "teams_total": len(teams), "pending_relief": db.query(ReliefRequest).filter(ReliefRequest.status.in_(("requested", "approved", "packed"))).count(),
                "dispatches_active": db.query(ReliefRequest).filter(ReliefRequest.status == "dispatched").count(),
                "open_shelters": sum(s["status"] == "open" for s in shelters), "shelter_space": sum(s["remaining"] for s in shelters),
                "people_affected": sum(i["priority"]["people"]["affected"] for i in ranked),
                "low_stock": [s for s in stock if s["low"]], "shortages": shortages}


@router.get("/teams")
def teams(request: Request, user=Depends(current_user)):
    need(user, "coordinator", "responder", "relief")
    with Session(engine_of(request)) as db:
        return [ops.team_view(db, t) for t in db.scalars(select(RescueTeam).order_by(RescueTeam.name))]


@router.get("/incidents/{report_id}/teams")
def recommended(report_id: str, request: Request, user=Depends(current_user)):
    need(user, "coordinator")
    with Session(engine_of(request)) as db:
        report = db.get(Report, report_id)
        if report is None:
            raise HTTPException(404, "Report not found")
        return ops.recommend(db, report)


@router.post("/teams/{team_id}/availability")
def availability(team_id: str, body: Availability, request: Request, user=Depends(current_user)):
    with Session(engine_of(request)) as db, db.begin():
        team = db.get(RescueTeam, team_id)
        if team is None:
            raise HTTPException(404, "Team not found")
        if not (user["role"] == "coordinator" or (user["role"] == "responder" and team.lead_user_id == user["id"])):
            raise HTTPException(403, "Only this team or a coordinator can change its availability")
        if body.on_duty is False and ops.active_assignment(db, team.id):
            raise HTTPException(409, "Finish or hand over the current mission before going off duty")
        previous, team.on_duty = team.on_duty, body.on_duty
        ops.log(db, user["id"], "team.availability", "team", team.id, None, "on_duty" if previous else "off_duty", "on_duty" if body.on_duty else "off_duty")
        db.flush()
        return ops.team_view(db, team)


@router.get("/relief/requests")
def relief_requests(request: Request, user=Depends(current_user)):
    with Session(engine_of(request)) as db:
        rows = db.scalars(select(ReliefRequest).order_by(ReliefRequest.created_at.desc())).all()
        if user["role"] not in ("relief", "coordinator"):
            rows = [r for r in rows if r.requester_id == user["id"] or (r.incident_id and visible(db, db.get(Report, r.incident_id), user))]
        return [ops.relief_view(db, r) for r in rows]


@router.post("/relief/requests/{request_id}/{action}")
def relief_action(request_id: str, action: str, request: Request, user=Depends(current_user)):
    targets = {"approve": "approved", "pack": "packed", "dispatch": "dispatched", "deliver": "delivered", "cancel": "cancelled"}
    if action not in targets:
        raise HTTPException(404, "Unknown relief action")
    need(user, "relief", "coordinator") if action == "cancel" else need(user, "relief")
    with Session(engine_of(request)) as db, db.begin():
        if db.get_bind().dialect.name == "sqlite":
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        row = db.get(ReliefRequest, request_id)
        if row is None:
            raise HTTPException(404, "Relief request not found")
        try:
            ops.advance_relief(db, row, targets[action], user)
        except ops.OpsError as exc:
            fail(exc)
        if row.incident_id and (report := db.get(Report, row.incident_id)):
            report.version += 1  # lets phones that track this incident pick up the new delivery status
            report.updated_at = now()
        db.flush()
        return ops.relief_view(db, row)


@router.get("/inventory")
def inventory(request: Request, user=Depends(current_user)):
    with Session(engine_of(request)) as db:
        return [ops.inventory_view(i) for i in db.scalars(select(InventoryItem).order_by(InventoryItem.kind.desc(), InventoryItem.name))]


@router.post("/inventory/{key}/restock")
def restock(key: str, body: Restock, request: Request, user=Depends(current_user)):
    need(user, "relief")
    with Session(engine_of(request)) as db, db.begin():
        item = db.get(InventoryItem, key)
        if item is None:
            raise HTTPException(404, "Item not found")
        previous, item.total = item.total, item.total + body.quantity
        ops.log(db, user["id"], "inventory.restock", "inventory", key, None, str(previous), str(item.total))
        db.flush()
        return ops.inventory_view(item)


@router.get("/shelters")
def shelters(request: Request, user=Depends(current_user)):
    with Session(engine_of(request)) as db:
        return [ops.shelter_view(s) for s in db.scalars(select(Shelter).order_by(Shelter.name))]


@router.get("/facilities")
def facilities(request: Request, category: str | None = None, user=Depends(current_user)):
    """Safe zones for the map. Rows with invalid coordinates are never returned."""
    if category is not None and category not in ops.FACILITY_CATEGORIES:
        raise HTTPException(422, f"category must be one of {', '.join(ops.FACILITY_CATEGORIES)}")
    with Session(engine_of(request)) as db:
        query = select(Facility).order_by(Facility.name)
        if category:
            query = query.where(Facility.category == category)
        return [ops.facility_view(db, f) for f in db.scalars(query) if ops.valid_point(f.latitude, f.longitude)]


@router.get("/map/impact")
def map_impact(request: Request, user=Depends(current_user)):
    """Impact Heatmap points. Precision depends on role; see app/impact.py."""
    with Session(engine_of(request)) as db:
        return impact.impact(db, user)


@router.get("/map/relief-demand")
def map_relief_demand(request: Request, user=Depends(current_user)):
    need(user, "relief", "coordinator")
    with Session(engine_of(request)) as db:
        return impact.relief_demand(db)


@router.post("/shelters/{shelter_id}/occupancy")
def occupancy(shelter_id: str, body: Occupancy, request: Request, user=Depends(current_user)):
    need(user, "relief", "coordinator")
    with Session(engine_of(request)) as db, db.begin():
        row = db.get(Shelter, shelter_id)
        if row is None:
            raise HTTPException(404, "Shelter not found")
        try:
            ops.set_occupancy(db, row, body.occupancy, user)
        except ops.OpsError as exc:
            fail(exc)
        db.flush()
        return ops.shelter_view(row)


@router.post("/incidents/{report_id}/escalate")
def escalate(report_id: str, request: Request, user=Depends(current_user)):
    """Operator action when required resources exceed availability: records a support request."""
    need(user, "coordinator")
    with Session(engine_of(request)) as db, db.begin():
        report = db.get(Report, report_id)
        if report is None:
            raise HTTPException(404, "Report not found")
        shortfall = {row["key"]: row["shortfall"] for row in ops.insight(db, report)["resources"] if row["shortfall"]}
        row = db.get(IncidentDetail, report_id) or IncidentDetail(report_id=report_id, data={})
        if row not in db:
            db.add(row)
        entry = {"id": f"esc-{int(now().timestamp())}", "kind": "escalation", "items": shortfall, "note": "Additional support requested from district control room", "by": user["id"], "at": ops.iso(now())}
        row.data = {**row.data, "support": [*row.data.get("support", []), entry]}
        report.version += 1
        report.updated_at = now()
        ops.log(db, user["id"], "incident.escalated", "incident", report_id, report_id, None, None, ", ".join(f"{k} {v}" for k, v in shortfall.items()) or "no shortfall")
        db.flush()
        return serialize_report(db, report)


@router.post("/incidents/{report_id}/release")
def release_team(report_id: str, request: Request, user=Depends(current_user)):
    """Hands an unfinished mission back to the command centre so another team can be assigned."""
    need(user, "coordinator", "responder")
    with Session(engine_of(request)) as db, db.begin():
        report = db.get(Report, report_id)
        if report is None or not visible(db, report, user):
            raise HTTPException(404, "Report not found")
        if not report.assigned_to:
            raise HTTPException(409, "No team is assigned to this incident")
        if report.mission_status == "completed":
            raise HTTPException(409, "A resolved mission cannot be released")
        team = ops.team_for_report(db, report)
        db.execute(update(Assignment).where(Assignment.report_id == report.id, Assignment.active.is_(True)).values(active=False))
        db.execute(update(MissionAssignment).where(MissionAssignment.report_id == report.id, MissionAssignment.active.is_(True)).values(active=False))
        previous = report.mission_status
        report.assigned_to, report.mission_status = None, "unassigned"
        report.version += 1
        report.updated_at = now()
        name = team["name"] if team else "responder"
        audit(db, report, user, "mission.released", f"{name} released by {user['role']}")
        ops.log(db, user["id"], "mission.released", "incident", report.id, report.id, previous, "unassigned", name)
        db.flush()
        return serialize_report(db, report)


@router.post("/assistant")
def ask_assistant(body: Question, request: Request, user=Depends(current_user)):
    with Session(engine_of(request)) as db:
        return assistant.answer(db, user, body.message.strip(), body.report_id, request.app.state.settings.ai_model)


@router.get("/assistant/status")
def assistant_status(user=Depends(current_user)):
    return {"ai": bool(os.getenv("ANTHROPIC_API_KEY")), "mode": "ai" if os.getenv("ANTHROPIC_API_KEY") else "guide"}


@router.get("/audit")
def audit_log(request: Request, user=Depends(current_user)):
    need(user, "coordinator", "relief")
    with Session(engine_of(request)) as db:
        rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200))
        return [{"id": r.id, "actor": r.actor_id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id, "incident_id": r.incident_id,
                 "previous_status": r.previous_status, "new_status": r.new_status, "detail": r.detail, "created_at": ops.iso(r.created_at)} for r in rows]


@router.post("/demo/reset")
def demo_reset(request: Request, user=Depends(current_user)):
    need(user, "coordinator", "relief")
    if not request.app.state.settings.demo_mode:
        raise HTTPException(403, "Demo controls are disabled")
    return demo.reset_demo(engine_of(request))


@router.post("/demo/simulate")
def demo_simulate(request: Request, user=Depends(current_user)):
    need(user, "coordinator", "relief")
    if not request.app.state.settings.demo_mode:
        raise HTTPException(403, "Demo controls are disabled")
    return demo.simulate(engine_of(request))
