"""Explicit, repeatable SIMULATED Kottayam demo seed: python -m app.seed.

Restores the demo scenario (20 incidents, 5 teams, 4 shelters, 10 relief requests, stock and an
alert) without touching reports created by real users.
"""
from sqlalchemy.orm import Session
from .auth import ensure_demo_users
from .config import Settings
from .database import Base, make_engine
from .demo import reset_demo


def seed_database(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as db, db.begin():
        ensure_demo_users(db)
    return reset_demo(engine)


def main():
    settings = Settings.from_env()
    if not settings.demo_mode:
        raise SystemExit("Set RESQ_DEMO_MODE=true to seed simulated demo data; production databases are not seeded.")
    engine = make_engine(settings.database_url)
    try:
        result = seed_database(engine)
        print(f"Seeded SIMULATED Kottayam scenario: {result} (safe to repeat; real reports are kept).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
