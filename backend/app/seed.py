"""Explicit, repeatable synthetic demo seed: python -m app.seed."""
import hashlib
from uuid import UUID, uuid5, NAMESPACE_URL
from sqlalchemy.orm import Session
from .auth import ensure_demo_users
from .config import Settings
from .database import Base, make_engine
from .schemas import SyncEvent
from .service import apply_event

SEED_IDS = [f"10000000-0000-4000-8000-{index:012d}" for index in range(1, 4)]


def seed_database(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as db, db.begin():
        ensure_demo_users(db)
    examples = [
        ("flood", 6, "[SYNTHETIC] Family waiting above rising water; needs human verification", "Demo: Fort Kochi community hall", 9.9658, 76.2421),
        ("medical", 2, "[SYNTHETIC] Medical assistance requested at a demo shelter", "Demo: Ernakulam shelter", 9.9816, 76.2999),
        ("supplies", 18, "[SYNTHETIC] Drinking water requested at a demo relief camp", "Demo: Kakkanad relief camp", 10.0159, 76.3419),
    ]

    def event(report_id, name, kind, payload, role):
        result = apply_event(engine, SyncEvent(id=uuid5(NAMESPACE_URL, f"resq-seed:{name}:{report_id}"), kind=kind, report_id=UUID(report_id), payload=payload), {"id": f"demo-{role}", "role": role})
        if result["status"] not in ("applied", "duplicate"):
            raise RuntimeError(f"Seed failed: {result}")

    for index, (kind, affected, description, label, lat, lon) in enumerate(examples):
        report_id = SEED_IDS[index]
        token = str(index + 1).zfill(64)
        event(report_id, "create", "report.create", {
            "id": report_id, "incident_type": kind, "affected_count": affected,
            "description": description, "location": {"label": label, "latitude": lat, "longitude": lon},
            "created_at": "2026-10-29T08:00:00Z", "origin_id": "demo-citizen",
            "receipt_hash": hashlib.sha256(token.encode()).hexdigest(), "receipt_token": token,
        }, "citizen")
        if index > 0:
            event(report_id, "review", "report.review", {"verification": "verified", "urgency": "critical" if index == 1 else "low", "urgency_reasons": ["Synthetic coordinator review for the hackathon demonstration"], "acknowledge": True}, "coordinator")
        if index == 1:
            event(report_id, "assign", "report.assign", {"responder_id": "demo-responder"}, "coordinator")


def main():
    settings = Settings.from_env()
    if not settings.demo_mode:
        raise SystemExit("Set RESQ_DEMO_MODE=true to seed synthetic demo data; production databases are not seeded.")
    engine = make_engine(settings.database_url)
    try:
        seed_database(engine)
        print("Seeded 3 explicitly synthetic incidents and four demo identities (safe to repeat).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
