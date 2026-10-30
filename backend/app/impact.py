"""Incident Impact Heatmap and Relief Demand overlay, computed from incident records with role-based privacy.

Intensity of one incident (0..1), deterministic:
    priority  = priority score / 100                       (same explainable score as the queue)
    people    = 0.6 + 0.4 * min(1, ln(1 + affected) / ln(51))   (capped: 50+ people counts as full)
    recency   = max(0.25, 0.5 ** (age_hours / 12))        (halves every 12 h, never below 0.25)
    verified  = 1.0 if verified else 0.7                   (unverified reports count less and are flagged)
    intensity = priority * people * recency * verified
Excluded: rejected or resolved incidents, reports linked as duplicates, reports without coordinates.

Privacy:
    coordinator  precise points for every eligible incident, each flagged verified/unverified.
    responder    precise points only for incidents assigned to them; everything else aggregated.
    others       aggregated only: grid cells of CELL degrees (~2.2 km), placed at the cell centre;
                 a cell holding a single unverified report is suppressed.
"""
import math
from datetime import timezone
from sqlalchemy import select
from . import ops, priority
from .models import DuplicateLink, InventoryItem, ReliefRequest, Report, now

CELL = 0.02
MIN_REPORTS = 3


def intensity(score: float, affected: int, age_hours: float, verified: bool) -> float:
    people = 0.6 + 0.4 * min(1.0, math.log1p(max(0, affected)) / math.log1p(50))
    recency = max(0.25, 0.5 ** (max(0.0, age_hours) / 12))
    return round(max(0.0, min(1.0, score / 100)) * people * recency * (1.0 if verified else 0.7), 3)


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def eligible(db):
    """(report, intensity, verified) for every incident that may contribute."""
    linked = set(db.scalars(select(DuplicateLink.report_id)))
    clock = now()
    out = []
    for r in db.scalars(select(Report)):
        if ops.is_resolved(r) or r.id in linked or not ops.valid_point(r.latitude, r.longitude):
            continue
        rank = priority.compute(r.incident_type, r.affected_count, ops.details_of(db, r.id), r.verification, r.urgency, r.created_at)
        age = (clock - _aware(r.created_at)).total_seconds() / 3600
        out.append((r, intensity(rank["score"], rank["people"]["affected"], age, r.verification == "verified"), r.verification == "verified"))
    return out


def cell_of(lat, lon):
    return (math.floor(lat / CELL), math.floor(lon / CELL))


def aggregate(rows, suppress_single_unverified=True):
    cells = {}
    for r, weight, verified in rows:
        c = cells.setdefault(cell_of(r.latitude, r.longitude), {"weight": 0.0, "count": 0, "verified": 0, "simulated": 0})
        c["weight"] += weight
        c["count"] += 1
        c["verified"] += int(verified)
        c["simulated"] += int(r.description.startswith("[SIMULATED]"))
    points = []
    for (i, j), c in cells.items():
        if suppress_single_unverified and c["count"] == 1 and c["verified"] == 0:
            continue
        points.append({"latitude": round((i + 0.5) * CELL, 4), "longitude": round((j + 0.5) * CELL, 4), "weight": round(min(1.0, c["weight"]), 3),
                       "count": c["count"], "verified": c["verified"], "aggregated": True})
    return points


def impact(db, user):
    rows = eligible(db)
    role = user["role"]
    if role == "coordinator":
        points = [{"latitude": r.latitude, "longitude": r.longitude, "weight": w, "verified": v, "incident_id": r.id, "aggregated": False} for r, w, v in rows]
        mode = "precise"
    elif role == "responder":
        mine = [x for x in rows if x[0].assigned_to == user["id"]]
        others = [x for x in rows if x[0].assigned_to != user["id"]]
        points = [{"latitude": r.latitude, "longitude": r.longitude, "weight": w, "verified": v, "incident_id": r.id, "aggregated": False} for r, w, v in mine] + aggregate(others)
        mode = "assigned-precise"
    else:
        points = aggregate(rows)
        mode = "aggregated"
    contributing = sum(p.get("count", 1) for p in points)
    simulated = sum(1 for r, _, _ in rows if r.description.startswith("[SIMULATED]"))
    return {"mode": mode, "points": points, "contributing_reports": contributing, "insufficient": contributing < MIN_REPORTS,
            "simulated_reports": simulated, "generated_at": ops.iso(now()), "cell_km": round(CELL * 111, 1) if mode != "precise" else None,
            "formula": "priority/100 x (0.6 + 0.4 x capped people) x recency (halves every 12 h, floor 0.25) x (1.0 verified | 0.7 unverified)"}


PENDING = ("requested", "approved", "packed")


def relief_demand(db):
    """Aggregated relief demand per grid cell. shortage = pending demand for an item exceeds the stock still free."""
    free = {i.key: i.total - i.reserved for i in db.scalars(select(InventoryItem))}
    totals, cells = {}, {}
    for req in db.scalars(select(ReliefRequest).where(ReliefRequest.status.in_(PENDING))):
        report = db.get(Report, req.incident_id) if req.incident_id else None
        if report is None or not ops.valid_point(report.latitude, report.longitude):
            continue
        c = cells.setdefault(cell_of(report.latitude, report.longitude), {"items": {}, "requests": 0})
        c["requests"] += 1
        for key, qty in req.items.items():
            c["items"][key] = c["items"].get(key, 0) + qty
            if req.status == "requested":
                totals[key] = totals.get(key, 0) + qty
    # Approved and packed requests already hold reservations; only not-yet-approved demand is compared with free stock.
    short = {k for k, total in totals.items() if total > free.get(k, 0)}
    biggest = max((sum(c["items"].values()) for c in cells.values()), default=0) or 1
    points = [{"latitude": round((i + 0.5) * CELL, 4), "longitude": round((j + 0.5) * CELL, 4), "weight": round(sum(c["items"].values()) / biggest, 3),
               "requests": c["requests"], "items": c["items"], "shortage": sorted(k for k in c["items"] if k in short)} for (i, j), c in cells.items()]
    return {"points": points, "shortages": sorted(short), "free_stock": free, "generated_at": ops.iso(now()), "cell_km": round(CELL * 111, 1)}
