from contextlib import asynccontextmanager
from datetime import timedelta, timezone
import hmac
import json
from pathlib import Path
from urllib.parse import parse_qs
from uuid import uuid4
from xml.sax.saxutils import escape
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import Settings
from .database import Base, make_engine
from .models import Alert, User, Report, BackendMetadata, now
from .schemas import AlertInput, DemoLogin, SyncRequest
from .auth import current_user, ensure_demo_users, issue_token, public_user
from .service import apply_event, iso, serialize_report, visible, visible_query
from .sms import handle_inbound
from .operations_api import router as operations_router
from . import ops

DASHBOARD = Path(__file__).with_name("dashboard.html")


def serialize_alert(alert):
    return {"id": alert.id, "title": alert.title, "body": alert.body, "severity": alert.severity,
            "area": alert.area, "created_by": alert.created_by,
            "created_at": iso(alert.created_at), "expires_at": iso(alert.expires_at)}


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


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
            available = ops.pool(db)
            return [serialize_report(db, row, available) for row in db.scalars(visible_query(user))]

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

    @api.get("/v1/alerts")
    def alerts(user=Depends(current_user)):
        current = now()
        with Session(engine) as db:
            rows = db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(100)).all()
            return [serialize_alert(row) for row in rows if aware(row.expires_at) > current][:50]

    @api.post("/v1/alerts")
    def publish_alert(body: AlertInput, user=Depends(current_user)):
        if user["role"] != "coordinator":
            raise HTTPException(403, "Coordinator permission required")
        with Session(engine) as db, db.begin():
            alert = Alert(title=body.title, body=body.body, severity=body.severity, area=body.area,
                          created_by=user["id"], expires_at=now() + timedelta(hours=body.hours))
            db.add(alert)
            db.flush()
            return serialize_alert(alert)

    @api.post("/v1/sms/inbound")
    async def sms_inbound(request: Request):
        """Webhook for an SMS gateway. Twilio-style form posts get a TwiML reply SMS."""
        if settings.sms_secret:
            if not hmac.compare_digest(request.query_params.get("key", "").encode(), settings.sms_secret.encode()):
                raise HTTPException(401, "A valid SMS gateway key is required")
        elif not settings.demo_mode:
            raise HTTPException(403, "Set RESQ_SMS_SECRET to enable the SMS gateway")
        raw = (await request.body()).decode("utf-8", "replace")
        form = "json" not in request.headers.get("content-type", "")
        if form:
            fields = {key: values[0] for key, values in parse_qs(raw).items()}
        else:
            try:
                fields = json.loads(raw or "{}")
            except json.JSONDecodeError:
                raise HTTPException(400, "Expected JSON or form data")
        body = str(fields.get("Body") or fields.get("body") or fields.get("message") or "")
        sender = str(fields.get("From") or fields.get("from") or fields.get("sender") or "")
        result = handle_inbound(engine, body, sender)
        if form:
            return Response(f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{escape(result["reply"])}</Message></Response>', media_type="application/xml")
        return result

    api.include_router(operations_router)

    @api.get("/dashboard", include_in_schema=False)
    def dashboard():
        return HTMLResponse(DASHBOARD.read_text(encoding="utf-8"))

    return api


app = create_app()
