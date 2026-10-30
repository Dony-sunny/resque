"""SMS fallback: decode compact SOS texts forwarded by an SMS gateway.

Wire format (mirrors mobile/src/core/sms.ts), fields separated by "|":
RQ1|id|type|count|lat|lon|created_ms|origin_id|receipt_hash|landmark|description

Coordinates are "-" when unknown. The description is last, so it may contain "|".
The SMS carries every immutable report field exactly, so a later app sync of the
same report is an idempotent duplicate and the citizen can still claim ownership.
"""
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Audit, Report, User
from .schemas import SyncEvent
from .service import apply_event

GATEWAY = {"id": "sms-gateway", "role": "volunteer"}
PREFIX = "RQ1|"


def ensure_gateway_user(db):
    if db.get(User, GATEWAY["id"]) is None:
        db.add(User(id=GATEWAY["id"], name="SMS gateway", role="volunteer", active=True))
        db.flush()


def decode(body: str) -> dict:
    parts = body.strip().split("|", 10)
    if len(parts) != 11 or parts[0] != "RQ1":
        raise ValueError("Not a ResQ Relay SOS text")
    _, report_id, kind, count, lat, lon, created_ms, origin, receipt_hash, label, description = parts
    if (lat == "-") != (lon == "-"):
        raise ValueError("Coordinates must be paired")
    return {
        "id": str(UUID(report_id)), "incident_type": kind, "affected_count": int(count),
        "description": description, "location": {"label": label,
                                                 "latitude": None if lat == "-" else float(lat),
                                                 "longitude": None if lon == "-" else float(lon)},
        "created_at": datetime.fromtimestamp(int(created_ms) / 1000, timezone.utc).isoformat(),
        "origin_id": origin, "receipt_hash": receipt_hash,
    }


def mask(sender: str) -> str:
    return sender[:3] + "****" + sender[-3:] if len(sender) > 6 else "unknown"


def status_reply(engine, prefix: str) -> str:
    prefix = prefix.strip().lower()
    if len(prefix) < 8:
        return "ResQ: send STATUS followed by the first 8 characters of your report ID."
    with Session(engine) as db:
        report = db.scalar(select(Report).where(Report.id.like(prefix + "%")).limit(1))
        if report is None:
            return f"ResQ: no report {prefix[:8]} has reached the control room yet."
        mission = report.mission_status.replace("_", " ")
        return f"ResQ: report {report.id[:8]} is {report.delivery_state}; mission {mission}. Call 112 if life is at risk."


def handle_inbound(engine, body: str, sender: str) -> dict:
    text = body.strip()
    if text.upper().startswith("STATUS"):
        return {"status": "status", "reply": status_reply(engine, text[6:])}
    try:
        payload = decode(text)
        event = SyncEvent(id=uuid5(NAMESPACE_URL, f"resq-sms:{payload['id']}"), kind="report.create",
                          report_id=UUID(payload["id"]), payload=payload)
    except (ValueError, TypeError):
        return {"status": "rejected", "reply": "ResQ: message not understood. Use the ResQ Relay app's Send by SMS button, or call 112."}
    with Session(engine) as db, db.begin():
        ensure_gateway_user(db)
    result = apply_event(engine, event, GATEWAY)
    if result["status"] not in ("applied", "duplicate"):
        return {"status": result["status"], "reply": f"ResQ: SOS could not be recorded ({result.get('error', 'rejected')}). Call 112."}
    with Session(engine) as db, db.begin():
        db.add(Audit(report_id=payload["id"], actor_id=GATEWAY["id"], action="sms.received",
                     detail=f"SOS text received from {mask(sender)} via SMS gateway"))
    return {"status": result["status"], "report_id": payload["id"],
            "reply": f"ResQ: SOS {payload['id'][:8]} received by the control room. Reply STATUS {payload['id'][:8]} for updates. Call 112 if life is at risk."}
