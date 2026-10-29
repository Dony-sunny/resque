"""Role-controlled, transactional event application and idempotent receipts."""
import hashlib
import json
from datetime import timezone
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import ValidationError
from .models import Report, Submission, Assignment, Note, Audit, SyncReceipt, User, now
from .schemas import ReportInput, CreatePayload, ReviewPayload, AssignPayload, StatusPayload, NotePayload


class EventError(Exception):
    def __init__(self, message, status="rejected"):
        self.message = message
        self.status = status


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def iso(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def serialize_report(db, report):
    notes = db.scalars(select(Note).where(Note.report_id == report.id).order_by(Note.created_at, Note.id)).all()
    audit = db.scalars(select(Audit).where(Audit.report_id == report.id).order_by(Audit.created_at, Audit.id)).all()
    return {
        **report.immutable_payload,
        "delivery_state": report.delivery_state,
        "verification": report.verification,
        "urgency": report.urgency,
        "urgency_reasons": report.urgency_reasons,
        "assigned_to": report.assigned_to,
        "mission_status": report.mission_status,
        "updated_at": iso(report.updated_at),
        "version": report.version,
        "notes": [{"id": note.id, "text": note.text, "author_id": note.author_id, "created_at": iso(note.created_at)} for note in notes],
        "audit": [{"id": row.id, "action": row.action, "actor_id": row.actor_id, "detail": row.detail, "created_at": iso(row.created_at)} for row in audit],
    }


def visible(db, report, user):
    if user["role"] == "coordinator":
        return True
    if user["role"] == "citizen":
        return report.owner_id == user["id"]
    if user["role"] == "responder":
        return report.assigned_to == user["id"]
    return db.get(Submission, (report.id, user["id"])) is not None


def visible_query(user):
    query = select(Report)
    if user["role"] == "citizen":
        query = query.where(Report.owner_id == user["id"])
    elif user["role"] == "volunteer":
        query = query.where(Report.id.in_(select(Submission.report_id).where(Submission.user_id == user["id"])))
    elif user["role"] == "responder":
        query = query.where(Report.assigned_to == user["id"])
    return query.order_by(Report.updated_at.desc(), Report.id)


def require_role(user, *roles):
    if user["role"] not in roles:
        raise EventError("Your server-assigned role cannot perform this action")


def audit(db, report, user, action, detail):
    db.add(Audit(report_id=report.id, actor_id=user["id"], action=action, detail=detail))


def touch(report):
    report.updated_at = now()
    report.version += 1


def check_version(report, payload):
    expected = payload.expected_version
    if expected is not None and expected != report.version:
        raise EventError(f"Stale version {expected}; server is {report.version}. Refresh and review again.", "conflict")


def create_report(db, event, user):
    require_role(user, "citizen", "volunteer")
    payload = CreatePayload.model_validate(event.payload)
    if str(payload.id) != str(event.report_id):
        raise EventError("Report and event IDs do not match")
    proof = False
    if user["role"] == "citizen":
        if payload.origin_id != user["id"]:
            raise EventError("Citizen reports must name the authenticated citizen as origin")
        proof = bool(payload.receipt_token) and secrets_equal_hash(payload.receipt_token, payload.receipt_hash)
        if not proof:
            raise EventError("Citizen ownership requires the private receipt token")
    immutable = ReportInput.model_validate(payload.model_dump(exclude={"receipt_token"})).model_dump(mode="json")
    immutable_hash = digest(immutable)
    report = db.scalar(select(Report).where(Report.id == str(payload.id)).with_for_update())
    duplicate = report is not None
    if duplicate:
        if report.immutable_hash != immutable_hash:
            raise EventError("This report ID already contains different immutable data", "conflict")
        if proof and report.owner_id is None:
            report.owner_id = user["id"]
            touch(report)
            audit(db, report, user, "report.claimed", "Original citizen supplied the private receipt proof after relay")
        elif proof and report.owner_id != user["id"]:
            raise EventError("Report ownership cannot be replaced", "conflict")
    else:
        report = Report(
            id=str(payload.id), origin_id=payload.origin_id,
            owner_id=user["id"] if proof else None,
            receipt_hash=payload.receipt_hash, immutable_hash=immutable_hash,
            immutable_payload=immutable, incident_type=payload.incident_type,
            affected_count=payload.affected_count, description=payload.description,
            location_label=payload.location.label, latitude=payload.location.latitude,
            longitude=payload.location.longitude, created_at=payload.created_at,
            updated_at=now(), version=1,
        )
        db.add(report)
        db.flush()
        audit(db, report, user, "report.received", "Server received the report; relay content is unverified" if user["role"] == "volunteer" else "Server received the citizen report")
    if db.get(Submission, (report.id, user["id"])) is None:
        db.add(Submission(report_id=report.id, user_id=user["id"]))
        if duplicate and user["role"] == "volunteer":
            audit(db, report, user, "relay.received", "Additional relay carrier submitted identical report; no new incident created")
    return report, duplicate


def secrets_equal_hash(token, expected):
    import hmac
    return hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), expected)


def mutate_report(db, event, user):
    report = db.scalar(select(Report).where(Report.id == str(event.report_id)).with_for_update())
    if report is None:
        raise EventError("Report does not exist or is unavailable")
    if event.kind == "report.review":
        require_role(user, "coordinator")
        data = ReviewPayload.model_validate(event.payload)
        check_version(report, data)
        if report.assigned_to and data.verification != "verified":
            raise EventError("An assigned report must stay verified; review assignment before changing verification")
        report.verification = data.verification
        report.urgency = data.urgency
        report.urgency_reasons = data.urgency_reasons
        if data.acknowledge:
            report.delivery_state = "acknowledged"
        audit(db, report, user, "report.reviewed", json.dumps({"verification": data.verification, "urgency": data.urgency, "reasons": data.urgency_reasons, "acknowledge": data.acknowledge}, ensure_ascii=False))
    elif event.kind == "report.assign":
        require_role(user, "coordinator")
        data = AssignPayload.model_validate(event.payload)
        check_version(report, data)
        if report.verification != "verified":
            raise EventError("Verify the report before assigning a responder")
        if report.mission_status == "completed":
            raise EventError("A completed mission cannot be reassigned")
        responder = db.get(User, data.responder_id)
        if responder is None or responder.role != "responder" or not responder.active:
            raise EventError("Choose an active field responder")
        db.execute(update(Assignment).where(Assignment.report_id == report.id, Assignment.active.is_(True)).values(active=False))
        db.add(Assignment(report_id=report.id, responder_id=responder.id, coordinator_id=user["id"]))
        report.assigned_to = responder.id
        report.mission_status = "assigned"
        audit(db, report, user, "report.assigned", f"Assigned to {responder.id}")
    elif event.kind == "mission.status":
        require_role(user, "responder")
        if report.assigned_to != user["id"]:
            raise EventError("Only the currently assigned responder can update this mission")
        data = StatusPayload.model_validate(event.payload)
        check_version(report, data)
        allowed = {"assigned": "accepted", "accepted": "en_route", "en_route": "on_scene", "on_scene": "completed"}
        if allowed.get(report.mission_status) != data.status:
            raise EventError(f"Invalid mission transition from {report.mission_status} to {data.status}")
        report.mission_status = data.status
        audit(db, report, user, "mission.status", data.status)
    elif event.kind == "mission.note":
        require_role(user, "responder")
        if report.assigned_to != user["id"]:
            raise EventError("Only the currently assigned responder can add mission notes")
        data = NotePayload.model_validate(event.payload)
        existing = db.get(Note, str(data.id))
        if existing:
            if existing.report_id == report.id and existing.author_id == user["id"] and existing.text == data.text and iso(existing.created_at) == iso(data.created_at):
                return report, True
            raise EventError("Note ID already has different content", "conflict")
        db.add(Note(id=str(data.id), report_id=report.id, author_id=user["id"], text=data.text, created_at=data.created_at))
        audit(db, report, user, "mission.note", f"Added note {data.id}")
    else:
        raise EventError("Unsupported event kind")
    touch(report)
    return report, False


def apply_event(engine, event, user):
    fingerprint = digest(event.model_dump(mode="json"))
    for attempt in range(2):
        try:
            with Session(engine) as db, db.begin():
                # SQLite ignores SELECT FOR UPDATE. Reserve the writer before any
                # version checks so two stale reviews cannot both be committed.
                if engine.dialect.name == "sqlite":
                    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
                previous = db.get(SyncReceipt, str(event.id))
                if previous:
                    if previous.user_id != user["id"] or previous.fingerprint != fingerprint:
                        raise EventError("Event ID already used by another identity or different content", "conflict")
                    if previous.status in ("rejected", "conflict"):
                        return {"event_id": str(event.id), "status": previous.status, "error": previous.error}
                    report = db.get(Report, previous.report_id)
                    if not visible(db, report, user):
                        raise EventError("Report is no longer visible to this identity")
                    return {"event_id": str(event.id), "status": "duplicate", "report": serialize_report(db, report)}
                report, duplicate = create_report(db, event, user) if event.kind == "report.create" else mutate_report(db, event, user)
                db.add(SyncReceipt(event_id=str(event.id), user_id=user["id"], fingerprint=fingerprint, report_id=report.id, status="duplicate" if duplicate else "applied"))
                db.flush()
                return {"event_id": str(event.id), "status": "duplicate" if duplicate else "applied", "report": serialize_report(db, report)}
        except EventError as exc:
            return record_failure(engine, event, user, fingerprint, exc.status, exc.message)
        except ValidationError:
            return record_failure(engine, event, user, fingerprint, "rejected", "Invalid event payload: check required fields, bounds, coordinates and timestamps")
        except IntegrityError:
            if attempt == 1:
                return {"event_id": str(event.id), "status": "conflict", "error": "Concurrent change; refresh before retrying"}
    raise RuntimeError("unreachable")


def record_failure(engine, event, user, fingerprint, status, error):
    """Reserve rejected event IDs too, after rolling back any attempted mutation."""
    for attempt in range(2):
        try:
            with Session(engine) as db, db.begin():
                if engine.dialect.name == "sqlite":
                    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
                previous = db.get(SyncReceipt, str(event.id))
                if previous:
                    if previous.user_id != user["id"] or previous.fingerprint != fingerprint:
                        return {"event_id": str(event.id), "status": "conflict", "error": "Event ID already used by another identity or different content"}
                    if previous.status in ("rejected", "conflict"):
                        return {"event_id": str(event.id), "status": previous.status, "error": previous.error}
                    # A preceding valid receipt remains valid even when visibility changed.
                    return {"event_id": str(event.id), "status": status, "error": error}
                db.add(SyncReceipt(event_id=str(event.id), user_id=user["id"], fingerprint=fingerprint, report_id=None, status=status, error=error))
            return {"event_id": str(event.id), "status": status, "error": error}
        except IntegrityError:
            # PostgreSQL contenders may both observe an absent receipt. The
            # unique key decides the winner; reread it after rolling back.
            if attempt == 1:
                return {"event_id": str(event.id), "status": "conflict", "error": "Concurrent receipt; refresh before retrying"}
    raise RuntimeError("unreachable")
