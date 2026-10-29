from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["citizen", "volunteer", "coordinator", "responder"]
IncidentType = Literal["flood", "medical", "fire", "trapped", "supplies", "other"]


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


class CreatePayload(ReportInput):
    receipt_token: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


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
    responder_id: str = Field(min_length=1, max_length=100)
    expected_version: int | None = Field(default=None, ge=1)


class StatusPayload(StrictModel):
    status: Literal["accepted", "en_route", "on_scene", "completed"]
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
    kind: Literal["report.create", "report.review", "report.assign", "mission.status", "mission.note"]
    report_id: UUID
    payload: dict


class SyncRequest(StrictModel):
    events: list[SyncEvent] = Field(min_length=1, max_length=100)


class DemoLogin(StrictModel):
    role: Role
