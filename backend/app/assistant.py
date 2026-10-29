"""RESQ Assistant: answers questions using only data the caller's role may see.

Two modes:
- "ai": Claude writes the answer from a role-scoped context (enabled when ANTHROPIC_API_KEY is set).
- "guide": deterministic answers from curated guidance and the same context (no API key, or the AI call failed).

The assistant never changes records. Suggested actions are app navigation chosen by deterministic
rules here, never by the model, and the person still has to tap them.
"""
import json
import logging
import os
import re
from sqlalchemy import select
from . import ops
from .models import Alert, InventoryItem, ReliefRequest, Report, Shelter, now
from .service import visible_query

log = logging.getLogger("resq.assistant")

CONTACTS = [("112", "Emergency, all services"), ("1077", "District disaster control room"), ("1070", "State emergency operations centre"),
            ("101", "Fire & rescue"), ("108", "Ambulance"), ("100", "Police")]

# Summarised from public NDMA / KSDMA preparedness advice. Kept short so it reads well under stress.
GUIDES = {
    "flood": ["Move to the highest floor or roof; take drinking water and a torch.", "Switch off electricity at the main switch.",
              "Do not walk or drive through moving water.", "Do not touch fallen power lines.", "Follow evacuation orders and go to the nearest relief camp."],
    "landslide": ["Move away from slopes and streams during heavy rain.", "Watch for cracks, tilting trees and muddy water.",
                  "Do not return until officials say the area is safe."],
    "fire": ["Get out, stay low under smoke and close doors behind you.", "Call 101 from a safe place.", "Do not use lifts or go back for belongings."],
    "earthquake": ["Drop, cover and hold on under a sturdy table.", "After the shaking stops, move to open ground.", "Stay away from windows and damaged buildings."],
    "cyclone": ["Stay indoors in the strongest room; keep a radio and a charged phone.", "Move to a cyclone shelter if told to evacuate.",
                "Do not go out during the calm eye of the storm."],
    "medical": ["Bleeding: press firmly on the wound with a clean cloth.", "Not breathing: call 108 and start chest compressions, 100 to 120 a minute.",
                "Do not move someone with a suspected spine injury unless they are in danger.", "This is first aid, not a diagnosis."],
}
GUIDE_WORDS = {"flood": ("flood", "water rising", "rain"), "landslide": ("landslide", "mudslide", "slope"), "fire": ("fire", "smoke", "burn"),
               "earthquake": ("earthquake", "tremor", "quake"), "cyclone": ("cyclone", "storm", "wind"),
               "medical": ("first aid", "bleed", "injur", "breath", "cpr", "medical", "drown")}
URGENT = ("trapped", "drowning", "dying", "help me", "can't breathe", "cannot breathe", "stuck", "sinking", "collapsed")
SOURCE_GUIDE = "RESQ curated guidance (summarised from NDMA / KSDMA public advice)"


def intent_of(text: str) -> str:
    t = text.lower()
    if any(w in t for w in URGENT):
        return "urgent"
    for name, words in (("status", ("status", "track", "my sos", "my request", "my report", "where is", "update")),
                        ("priority", ("priority", "why", "score", "critical")),
                        ("shelter", ("shelter", "camp", "safe place", "safe zone")),
                        ("contacts", ("contact", "number", "call", "phone", "helpline")),
                        ("report", ("how do i report", "report emergency", "send sos", "how to sos", "report")),
                        ("inventory", ("stock", "inventory", "supplies", "food", "water bottle", "medicine", "dispatch")),
                        ("mission", ("mission", "assigned", "team"))):
        if any(w in t for w in words):
            return name
    if any(w in t for words in GUIDE_WORDS.values() for w in words):
        return "safety"
    return "other"


def guide_topic(text: str) -> str | None:
    t = text.lower()
    return next((name for name, words in GUIDE_WORDS.items() if any(w in t for w in words)), None)


def actions_for(intent: str, role: str) -> list[dict]:
    victim = role in ("citizen", "volunteer")
    table = {"urgent": [{"label": "Send SOS now", "route": "create"}, {"label": "Call 112", "call": "112"}] if victim else [{"label": "Call 112", "call": "112"}],
             "report": [{"label": "Open SOS form", "route": "create"}] if victim else [],
             "status": [{"label": "Open my requests", "route": "requests"}] if victim else [],
             "shelter": [{"label": "Shelters on map", "route": "map"}],
             "contacts": [{"label": "Call 112", "call": "112"}],
             "safety": [{"label": "Safety guides", "route": "safety"}] if victim else []}
    return table.get(intent, [])


def build_context(db, user, report_id: str | None = None) -> dict:
    """Everything here is filtered by role, with the same rules as the reports API."""
    role = user["role"]
    ctx: dict = {"role": role, "now": ops.iso(now())}
    ctx["shelters"] = [{"name": s["name"], "area": s["area"], "places_free": s["remaining"], "status": s["status"], "simulated": True}
                       for s in (ops.shelter_view(x) for x in db.scalars(select(Shelter).order_by(Shelter.name)))]
    ctx["alerts"] = [{"title": a.title, "body": a.body, "area": a.area, "severity": a.severity, "simulated": a.title.startswith("[SIMULATED]") or "SIMULATED" in a.body}
                     for a in db.scalars(select(Alert).where(Alert.expires_at > now()).order_by(Alert.created_at.desc()).limit(3))]
    if role in ("citizen", "volunteer", "responder"):
        rows = db.scalars(visible_query(user).limit(5)).all()
        ctx["my_requests" if role != "responder" else "my_missions"] = [request_summary(db, r) for r in rows]
    if role == "coordinator":
        open_reports = [r for r in db.scalars(select(Report)) if not ops.is_resolved(r)]
        ctx["queue"] = {"open": len(open_reports), "unassigned": sum(1 for r in open_reports if not r.assigned_to)}
        if report_id and (report := db.get(Report, report_id)):
            info = ops.insight(db, report)
            ctx["selected_incident"] = {"id": report.id[:8], "type": report.incident_type, "priority": info["priority"],
                                        "resources": [x for x in info["resources"] if x["required"]]}
    if role in ("relief", "coordinator"):
        ctx["inventory"] = [{"item": i["name"], "available": i["available"], "reserved": i["reserved"], "low": i["low"]}
                            for i in (ops.inventory_view(x) for x in db.scalars(select(InventoryItem).where(InventoryItem.kind == "supply")))]
        statuses = [r.status for r in db.scalars(select(ReliefRequest))]
        ctx["relief_requests"] = {s: statuses.count(s) for s in ("requested", "approved", "packed", "dispatched", "delivered")}
    return ctx


def request_summary(db, report) -> dict:
    team = ops.team_for_report(db, report)
    relief = [r.status for r in db.scalars(select(ReliefRequest).where(ReliefRequest.incident_id == report.id))]
    return {"id": report.id[:8], "type": report.incident_type, "place": report.location_label, "server_state": report.delivery_state,
            "verification": report.verification, "mission": report.mission_status, "team": team["name"] if team else None, "relief": relief}


MISSION_WORDS = {"unassigned": "waiting for a rescue team", "assigned": "a rescue team has been assigned", "accepted": "the team accepted the mission",
                 "en_route": "the team is on the way", "on_scene": "the team is on site", "in_progress": "rescue is in progress", "completed": "marked resolved"}


def guide_answer(question: str, ctx: dict) -> str:
    intent, role = intent_of(question), ctx["role"]
    if intent == "urgent":
        return "If you are in danger now, send an SOS from the red button or call 112. Stay where rescuers can see or hear you, and save phone battery."
    if intent == "status":
        rows = ctx.get("my_requests") or ctx.get("my_missions")
        if rows is None:
            return "Request tracking is shown to the person who sent the SOS. As an official, open the incident from the queue."
        if not rows:
            return "The server has no requests from you yet. Reports saved offline appear after they sync."
        lines = []
        for r in rows[:3]:
            relief = f" Relief: {', '.join(r['relief'])}." if r["relief"] else ""
            lines.append(f"#{r['id']} {r['type']} at {r['place']}: {MISSION_WORDS.get(r['mission'], r['mission'])}{' (' + r['team'] + ')' if r['team'] else ''}.{relief}")
        return " ".join(lines) + " RESQ does not estimate arrival times."
    if intent == "priority":
        inc = ctx.get("selected_incident")
        if role != "coordinator":
            return "Officials rank every SOS by a fixed rule: severity 40%, vulnerable people 25%, people affected 15%, waiting time 15%, verification 5%. A reported life threat is always at least CRITICAL."
        if not inc:
            return "Open an incident and ask again to see its breakdown. Score = 0.40 severity + 0.25 vulnerability + 0.15 people + 0.15 waiting + 0.05 confidence."
        p = inc["priority"]
        parts = ", ".join(f"{b['factor']} {b['value']} (+{b['contribution']})" for b in p["breakdown"])
        return f"#{inc['id']} scores {p['score']} ({p['level']}): {parts}.{' Override: ' + p['override'] if p.get('override') else ''}"
    if intent == "shelter":
        open_ = [s for s in ctx["shelters"] if s["status"] == "open" and s["places_free"] > 0]
        if not open_:
            return "No shelter in the system currently shows free places. Follow official instructions or call 1077."
        return "Shelters with space (simulated demo data): " + "; ".join(f"{s['name']}, {s['area']}: {s['places_free']} places" for s in open_[:4]) + "."
    if intent == "contacts":
        return "Emergency numbers: " + ", ".join(f"{n} {label}" for n, label in CONTACTS) + "."
    if intent == "report":
        return "Tap the red SOS button. Pick the emergency type, confirm your location, set how many people are trapped or injured, then Send SOS. Everything else is optional, and it saves on your phone even without network."
    if intent == "inventory" and "inventory" in ctx:
        low = [i["item"] for i in ctx["inventory"] if i["low"]]
        stock = "; ".join(f"{i['item']} {i['available']} free ({i['reserved']} reserved)" for i in ctx["inventory"])
        rr = ctx["relief_requests"]
        return f"Stock: {stock}. Requests: {rr['requested']} new, {rr['approved'] + rr['packed']} allocated, {rr['dispatched']} on the way.{' Low: ' + ', '.join(low) + '.' if low else ''}"
    if intent == "mission" and "my_missions" in ctx:
        open_ = [m for m in ctx["my_missions"] if m["mission"] != "completed"]
        return ("Open missions: " + "; ".join(f"#{m['id']} {m['type']} at {m['place']} ({MISSION_WORDS.get(m['mission'], m['mission'])})" for m in open_)) if open_ else "Your team has no open mission."
    topic = guide_topic(question)
    if topic:
        return f"{topic.capitalize()} safety: " + " ".join(GUIDES[topic])
    return "I can help with: sending an SOS, tracking your request, flood, fire, landslide, earthquake, cyclone and first-aid safety, shelters and emergency numbers. In danger now? Use SOS or call 112."


SYSTEM = """You are RESQ Assistant inside a disaster-response app in Kerala, India.
Answer in at most 90 words, plain text, no markdown.
Use only the CONTEXT and GUIDANCE given. If they do not contain the answer, say you do not know.
Rules:
- If someone may be in danger now, tell them first to press SOS or call 112.
- Never invent arrival times, shelter space, team positions or official warnings. Data marked simulated is demo data; say so.
- You cannot assign teams, change priorities, approve supplies or edit any record. Officials do that in the app.
- No medical diagnosis; give first-aid steps only from GUIDANCE.
- Only discuss requests listed in CONTEXT; never reveal other people's details."""


def ai_answer(question: str, ctx: dict, model: str) -> str:
    import anthropic  # optional dependency, only needed when an API key is configured

    client = anthropic.Anthropic(timeout=20.0, max_retries=1)
    topic = guide_topic(question)
    guidance = {topic: GUIDES[topic]} if topic else GUIDES
    response = client.beta.messages.create(
        model=model,
        max_tokens=1024,
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        messages=[{"role": "user", "content": f"CONTEXT:\n{json.dumps(ctx, ensure_ascii=False)}\n\nGUIDANCE ({SOURCE_GUIDE}):\n{json.dumps(guidance)}\n\nQUESTION:\n{question}"}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("model declined")
    text = " ".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise RuntimeError("empty answer")
    return re.sub(r"[*#`]+", "", text)[:900]


def answer(db, user, question: str, report_id: str | None, model: str) -> dict:
    ctx = build_context(db, user, report_id)
    intent = intent_of(question)
    result = {"intent": intent, "actions": actions_for(intent, user["role"]), "sources": [SOURCE_GUIDE, "RESQ server data for your role"]}
    if os.getenv("ANTHROPIC_API_KEY") and intent != "urgent":
        try:
            return {**result, "mode": "ai", "answer": ai_answer(question, ctx, model)}
        except Exception as exc:  # any failure falls back to the deterministic guide
            log.warning("assistant AI call failed: %s", exc)
            return {**result, "mode": "guide", "answer": guide_answer(question, ctx), "note": "AI unavailable; answered from the safety guide."}
    return {**result, "mode": "guide", "answer": guide_answer(question, ctx)}
