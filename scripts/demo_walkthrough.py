"""Exercise the real API end to end using synthetic reports. Requires demo mode.

Usage: python scripts/demo_walkthrough.py http://127.0.0.1:8000
Never run against an operational incident system.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone


BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")


def request(path: str, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if os.getenv("RESQ_DEMO_ACCESS_KEY"):
        headers["X-Demo-Key"] = os.environ["RESQ_DEMO_ACCESS_KEY"]
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{path}: HTTP {error.code}: {error.read().decode()}") from error


def event(kind: str, report_id: str, payload: dict):
    return {"id": str(uuid.uuid4()), "kind": kind, "report_id": report_id, "payload": payload}


def sync(token, item, allowed=("applied", "duplicate")):
    result = request("/v1/sync", {"events": [item]}, token)["results"][0]
    assert result["status"] in allowed, result
    return result


def main():
    health = request("/health")
    assert health.get("demo_mode"), "Refusing to create test incidents outside demo mode"
    sessions = {
        role: request("/v1/auth/demo", {"role": role})
        for role in ("citizen", "volunteer", "coordinator", "responder")
    }
    tokens = {role: data["access_token"] for role, data in sessions.items()}
    citizen_id = sessions["citizen"]["user"]["id"]
    responder_id = sessions["responder"]["user"]["id"]
    secret = secrets.token_hex(32)
    report_id = str(uuid.uuid4())
    report = {
        "id": report_id,
        "incident_type": "flood",
        "affected_count": 3,
        "description": "SYNTHETIC DEMO: three people waiting near the training shelter.",
        "location": {"label": "Demo shelter, Kochi", "latitude": 9.9312, "longitude": 76.2673},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "origin_id": citizen_id,
        "receipt_hash": hashlib.sha256(secret.encode()).hexdigest(),
    }
    relay = event("report.create", report_id, report)
    first = sync(tokens["volunteer"], relay)
    assert first["report"]["delivery_state"] == "delivered"
    again = sync(tokens["volunteer"], relay)
    assert again["status"] == "duplicate", again
    assert all(r["id"] != report_id for r in request("/v1/reports", token=tokens["citizen"]))
    claim = event("report.create", report_id, {**report, "receipt_token": secret})
    sync(tokens["citizen"], claim)
    assert any(r["id"] == report_id for r in request("/v1/reports", token=tokens["citizen"]))
    denial = sync(tokens["citizen"], event("report.review", report_id, {
        "verification": "verified", "urgency": "critical",
        "urgency_reasons": ["Unauthorized test"], "acknowledge": True,
    }), allowed=("rejected",))
    assert denial["status"] == "rejected"
    reviewed = sync(tokens["coordinator"], event("report.review", report_id, {
        "verification": "verified", "urgency": "high",
        "urgency_reasons": ["Human-reviewed synthetic exercise: people isolated by rising water"],
        "acknowledge": True,
    }))
    assert reviewed["report"]["delivery_state"] == "acknowledged"
    sync(tokens["coordinator"], event("report.assign", report_id, {"responder_id": responder_id}))
    assert any(r["id"] == report_id for r in request("/v1/reports", token=tokens["responder"]))
    for status in ("accepted", "en_route", "on_scene", "completed"):
        sync(tokens["responder"], event("mission.status", report_id, {"status": status}))
    note = event("mission.note", report_id, {
        "id": str(uuid.uuid4()), "text": "Synthetic exercise complete; no real rescue requested.",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    final = sync(tokens["responder"], note)["report"]
    sync(tokens["responder"], note)
    assert len([n for n in final["notes"] if n["id"] == note["payload"]["id"]]) == 1
    assert final["mission_status"] == "completed" and final["audit"]
    print("PASS: relay -> duplicate retry -> citizen proof -> human review -> assignment -> mission -> note")
    print("PASS: role enforcement, scoped visibility, audit history and authoritative delivery")
    print(f"Synthetic report: {report_id}")


if __name__ == "__main__":
    main()
