"""Explainable rescue-priority engine (prototype rule, not validated clinical triage).

score = 0.40*severity + 0.25*vulnerability + 0.15*people + 0.15*waiting + 0.05*confidence
Each factor is normalised to 0-100. Bands: CRITICAL 80-100, HIGH 60-79, MEDIUM 35-59, LOW 0-34.

Life-safety override: a credible immediate life threat (reported life threat, or people who are
both trapped and injured) is floored at CRITICAL. Priority never depends on resource
availability, so a shortage can never downgrade an incident.
"""
import math
from datetime import datetime, timezone

WEIGHTS = {"severity": 0.40, "vulnerability": 0.25, "people": 0.15, "waiting": 0.15, "confidence": 0.05}
BASE_SEVERITY = {"landslide": 75, "earthquake": 75, "trapped": 75, "fire": 70, "cyclone": 65,
                 "flood": 60, "medical": 60, "other": 40, "supplies": 25}
REVIEWED_SEVERITY = {"critical": 100, "high": 80, "medium": 55, "low": 25}
WAIT_FULL_MINUTES = 120


def level_for(score: float) -> str:
    return "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 35 else "LOW"


def people_counts(details: dict, affected: int) -> dict:
    people = details.get("people") or {}
    value = lambda key: max(0, int(people.get(key) or 0))
    return {"affected": max(1, affected), "trapped": value("trapped"), "injured": value("injured"),
            "children": value("children"), "elderly": value("elderly"), "disabled": value("disabled")}


def compute(incident_type: str, affected: int, details: dict, verification: str, urgency: str | None,
            created_at: datetime, resolved: bool = False, corroborations: int = 0, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    p = people_counts(details, affected)
    life_threat = bool(details.get("life_threat"))

    computed = BASE_SEVERITY.get(incident_type, 40) + (15 if p["trapped"] else 0) + (10 if p["injured"] else 0)
    if life_threat:
        computed = 100
    severity = min(100, computed)
    severity_note = f"{incident_type} base {BASE_SEVERITY.get(incident_type, 40)}" + (" +15 trapped" if p["trapped"] else "") + (" +10 injured" if p["injured"] else "") + (" · life threat reported → 100" if life_threat else "")
    if urgency in REVIEWED_SEVERITY:
        # A coordinator's reviewed urgency replaces the estimate, but never below a reported life threat.
        severity = max(REVIEWED_SEVERITY[urgency], 100 if life_threat else 0)
        severity_note = f"coordinator reviewed urgency '{urgency}'" + (" (life threat floor 100)" if life_threat else "")

    vulnerable = min(p["affected"], p["children"] + p["elderly"] + p["disabled"] + p["injured"])
    vulnerability = min(100, round(vulnerable / p["affected"] * 70 + min(30, vulnerable * 5)))
    people = round(100 * min(1.0, math.log1p(p["affected"]) / math.log1p(100)))
    minutes = max(0.0, (now - created_at).total_seconds() / 60)
    waiting = 0 if resolved else round(min(100, minutes / WAIT_FULL_MINUTES * 100))
    confidence = {"verified": 100, "unverified": 40, "rejected": 0}.get(verification, 40)
    if verification == "unverified" and corroborations:
        confidence = min(100, confidence + 20 * corroborations)

    factors = [
        ("severity", severity, severity_note),
        ("vulnerability", vulnerability, f"{vulnerable} of {p['affected']} are children, elderly, disabled or injured"),
        ("people", people, f"{p['affected']} people affected (log scale, 100+ = max)"),
        ("waiting", waiting, "resolved" if resolved else f"waiting {int(minutes)} min (120 min = max)"),
        ("confidence", confidence, f"{verification}" + (f", corroborated by {corroborations} similar report(s)" if corroborations and verification == "unverified" else "")),
    ]
    breakdown = [{"factor": name, "weight": WEIGHTS[name], "value": value,
                  "contribution": round(WEIGHTS[name] * value, 1), "explanation": note} for name, value, note in factors]
    score = round(sum(row["contribution"] for row in breakdown), 1)
    override = None
    credible = verification != "rejected"
    if credible and (life_threat or (p["trapped"] and p["injured"])) and score < 80:
        override = "Life-safety override: immediate threat to life reported, raised to CRITICAL (80)."
        score = 80.0
    return {"score": score, "level": level_for(score), "breakdown": breakdown, "override": override,
            "waiting_minutes": int(minutes), "people": p, "life_threat": life_threat}
