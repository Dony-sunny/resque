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


class Alert(Base):
    """Authority broadcast shown to every role on sync and on the dashboard."""
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20))
    area: Mapped[str] = mapped_column(String(160))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IncidentDetail(Base):
    """Mutable SOS details collected progressively (people at risk, needs). Kept out of the
    immutable report payload so QR/SMS relays and receipt hashes stay compatible."""
    __tablename__ = "incident_details"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DuplicateLink(Base):
    __tablename__ = "duplicate_links"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), primary_key=True)
    duplicate_of: Mapped[str] = mapped_column(ForeignKey("reports.id"))
    linked_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RescueTeam(Base):
    __tablename__ = "rescue_teams"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    capacity: Mapped[int] = mapped_column(Integer)
    base: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    readiness: Mapped[int] = mapped_column(Integer, default=100)
    on_duty: Mapped[bool] = mapped_column(Boolean, default=True)
    lead_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class MissionAssignment(Base):
    __tablename__ = "mission_assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("rescue_teams.id"), index=True)
    assigned_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryItem(Base):
    __tablename__ = "inventory"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20))  # "supply" moves through relief dispatch; "asset" is a counted capability
    total: Mapped[int] = mapped_column(Integer)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    low_threshold: Mapped[int] = mapped_column(Integer, default=0)


class ReliefRequest(Base):
    __tablename__ = "relief_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id"), nullable=True, index=True)
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    requester_role: Mapped[str] = mapped_column(String(20))
    items: Mapped[dict] = mapped_column(JSON)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="requested")
    history: Mapped[list] = mapped_column(JSON, default=list)
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Dispatch(Base):
    __tablename__ = "dispatches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    request_id: Mapped[str] = mapped_column(ForeignKey("relief_requests.id"), unique=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Shelter(Base):
    __tablename__ = "shelters"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    capacity: Mapped[int] = mapped_column(Integer)
    occupancy: Mapped[int] = mapped_column(Integer, default=0)
    facilities: Mapped[list] = mapped_column(JSON, default=list)
    open: Mapped[bool] = mapped_column(Boolean, default=True)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class Facility(Base):
    """A safe zone shown on the map: shelter, relief camp, hospital or relief centre.
    Shelters and camps link to a Shelter row, which holds their live capacity and occupancy."""
    __tablename__ = "facilities"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(20), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    address: Mapped[str] = mapped_column(String(200))
    locality: Mapped[str] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    shelter_id: Mapped[str | None] = mapped_column(ForeignKey("shelters.id"), nullable=True)
    services: Mapped[list] = mapped_column(JSON, default=list)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    verification: Mapped[str] = mapped_column(String(20), default="unverified")
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    """Chronological operations log across incidents, missions, relief and shelters."""
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(50))
    entity: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(40))
    incident_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
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
