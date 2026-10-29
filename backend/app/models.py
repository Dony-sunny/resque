"""SQLAlchemy 2 models: portable string UUIDs, JSON, timezone-aware timestamps.

SQLite is the demo database. PostgreSQL uses the same schema via DATABASE_URL.
Alembic migrations and managed identity provisioning are future deployment work.
"""
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class BackendMetadata(Base):
    """Persistent authority identity; URL changes do not create a new backend."""
    __tablename__ = "backend_metadata"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    origin_id: Mapped[str] = mapped_column(String(100))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    receipt_hash: Mapped[str] = mapped_column(String(64))
    immutable_hash: Mapped[str] = mapped_column(String(64))
    immutable_payload: Mapped[dict] = mapped_column(JSON)
    incident_type: Mapped[str] = mapped_column(String(20), index=True)
    affected_count: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    location_label: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    delivery_state: Mapped[str] = mapped_column(String(20), default="delivered")
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    urgency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    urgency_reasons: Mapped[list] = mapped_column(JSON, default=list)
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    mission_status: Mapped[str] = mapped_column(String(20), default="unassigned")
    version: Mapped[int] = mapped_column(Integer, default=1)


class Submission(Base):
    __tablename__ = "submissions"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    responder_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    coordinator_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    detail: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SyncReceipt(Base):
    __tablename__ = "sync_receipts"
    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="applied")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
