from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["citizen", "volunteer", "coordinator", "responder", "relief"]
IncidentType = Literal["flood", "landslide", "fire", "earthquake", "cyclone", "medical", "trapped", "supplies", "other"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Location(StrictModel):
    label: str = Field(min_length=1, max_length=160)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_together(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must both be present or both null")
        return self


class ReportInput(StrictModel):
    id: UUID
    incident_type: IncidentType
    affected_count: int = Field(ge=1, le=10000, strict=True)
    description: str = Field(min_length=1, max_length=500)
    location: Location
    created_at: datetime
    origin_id: str = Field(min_length=1, max_length=100)
    receipt_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("created_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("created_at must include a timezone")
        return value.astimezone(timezone.utc)


Assistance = Literal["rescue", "ambulance", "medical", "food", "water", "medicine", "shelter"]


class People(StrictModel):
    trapped: int = Field(default=0, ge=0, le=10000, strict=True)
    injured: int = Field(default=0, ge=0, le=10000, strict=True)
    children: int = Field(default=0, ge=0, le=10000, strict=True)
    elderly: int = Field(default=0, ge=0, le=10000, strict=True)
    disabled: int = Field(default=0, ge=0, le=10000, strict=True)


class Details(StrictModel):
    """Progressive SOS details. Mutable, so they stay outside the immutable report hash."""
    people: People = Field(default_factory=People)
    life_threat: bool = False
    assistance: list[Assistance] = Field(default_factory=list, max_length=7)


class CreatePayload(ReportInput):
    receipt_token: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    details: Details | None = None


class DetailsPayload(Details):
    pass


class LinkPayload(StrictModel):
    duplicate_of: UUID | None


class MissionRequestPayload(StrictModel):
    id: UUID
    kind: Literal["backup", "medical", "supplies"]
    items: dict[str, int] = Field(default_factory=dict)
    note: str = Field(default="", max_length=300)


class ReliefPayload(StrictModel):
    id: UUID
    items: dict[str, int]
    note: str = Field(default="", max_length=300)


class ReviewPayload(StrictModel):
    verification: Literal["unverified", "verified", "rejected"]
    urgency: Literal["low", "medium", "high", "critical"] | None
    urgency_reasons: list[str] = Field(max_length=10)
    acknowledge: bool = False
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("urgency_reasons")
    @classmethod
    def clean_reasons(cls, values):
        reasons = [value.strip() for value in values]
        if any(not value or len(value) > 200 for value in reasons):
            raise ValueError("reasons must be nonempty and at most 200 characters")
        return reasons

    @model_validator(mode="after")
    def urgency_has_reasons(self):
        if self.urgency is not None and not self.urgency_reasons:
            raise ValueError("human-reviewed urgency requires at least one reason")
        return self


class AssignPayload(StrictModel):
    responder_id: str | None = Field(default=None, min_length=1, max_length=100)
    team_id: str | None = Field(default=None, min_length=1, max_length=40)

    @model_validator(mode="after")
    def one_target(self):
        if (self.responder_id is None) == (self.team_id is None):
            raise ValueError("assign either a team_id or a responder_id")
        return self
    expected_version: int | None = Field(default=None, ge=1)


class StatusPayload(StrictModel):
    status: Literal["accepted", "en_route", "on_scene", "in_progress", "completed"]
    expected_version: int | None = Field(default=None, ge=1)


class NotePayload(StrictModel):
    id: UUID
    text: str = Field(min_length=1, max_length=1500)
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def aware_time(cls, value):
        return ReportInput.aware_time(value)


class SyncEvent(StrictModel):
    id: UUID
    kind: Literal["report.create", "report.review", "report.assign", "mission.status", "mission.note",
                  "report.details", "report.link_duplicate", "mission.request", "relief.request"]
    report_id: UUID
    payload: dict


class SyncRequest(StrictModel):
    events: list[SyncEvent] = Field(min_length=1, max_length=100)


class DemoLogin(StrictModel):
    role: Role


class AlertInput(StrictModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=1000)
    severity: Literal["info", "warning", "danger"]
    area: str = Field(min_length=1, max_length=160)
    hours: int = Field(default=24, ge=1, le=168, strict=True)
