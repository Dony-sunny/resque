from contextlib import asynccontextmanager
import hmac
from uuid import uuid4
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import Settings
from .database import Base, make_engine
from .models import User, Report, BackendMetadata
from .schemas import DemoLogin, SyncRequest
from .auth import current_user, ensure_demo_users, issue_token, public_user
from .service import apply_event, serialize_report, visible, visible_query


def create_app(settings: Settings | None = None):
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(application):
        Base.metadata.create_all(engine)
        with Session(engine) as db, db.begin():
            if engine.dialect.name == "sqlite":
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")
            identity = db.get(BackendMetadata, "backend_id")
            if identity is None:
                identity = BackendMetadata(key="backend_id", value=str(uuid4()))
                db.add(identity)
            application.state.backend_id = identity.value
        yield
        engine.dispose()

    api = FastAPI(title="ResQ Relay", version="1.0.0", lifespan=lifespan,
                  description="Offline-capable disaster report relay MVP. Synthetic demo identities are available only when explicitly enabled.")
    api.state.engine = engine
    api.state.settings = settings
    if settings.cors_origins:
        api.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Demo-Key"])

    @api.get("/health", include_in_schema=False)
    @api.get("/v1/health")
    def health():
        with Session(engine) as db:
            # Health checks verify the persistent database is actually reachable.
            if db.get(BackendMetadata, "backend_id") is None:
                raise HTTPException(503, "Backend database identity unavailable")
        return {"status": "ok", "demo_mode": settings.demo_mode,
                "backend_id": api.state.backend_id,
                "demo_access_key_required": bool(settings.demo_access_key)}

    @api.post("/v1/auth/demo")
    def demo_login(body: DemoLogin, request: Request):
        if not settings.demo_mode:
            raise HTTPException(403, "Demo identity selection is disabled")
        supplied = request.headers.get("X-Demo-Key", "")
        if settings.demo_access_key and not hmac.compare_digest(supplied.encode(), settings.demo_access_key.encode()):
            raise HTTPException(401, "A valid demo access key is required")
        with Session(engine) as db, db.begin():
            if engine.dialect.name == "sqlite":
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")
            ensure_demo_users(db)
            user = db.get(User, f"demo-{body.role}")
            if not user.active:
                raise HTTPException(403, "Demo identity is inactive")
            return {"access_token": issue_token(db, user), "user": public_user(user)}

    @api.get("/v1/me")
    def me(user=Depends(current_user)):
        return user

    @api.get("/v1/responders")
    def responders(user=Depends(current_user)):
        if user["role"] != "coordinator":
            raise HTTPException(403, "Coordinator permission required")
        with Session(engine) as db:
            return [public_user(row) for row in db.scalars(select(User).where(User.role == "responder", User.active.is_(True)).order_by(User.name))]

    @api.get("/v1/reports")
    def reports(user=Depends(current_user)):
        with Session(engine) as db:
            return [serialize_report(db, row) for row in db.scalars(visible_query(user))]

    @api.get("/v1/reports/{report_id}")
    def get_report(report_id: str, user=Depends(current_user)):
        with Session(engine) as db:
            report = db.get(Report, report_id)
            if report is None or not visible(db, report, user):
                raise HTTPException(404, "Report not found")
            return serialize_report(db, report)

    @api.post("/v1/sync")
    def sync(body: SyncRequest, user=Depends(current_user)):
        return {"results": [apply_event(engine, event, user) for event in body.events]}

    return api


app = create_app()
