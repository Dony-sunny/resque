"""Deterministic resource estimate for one incident (no AI service involved).

Rules (per incident, first 24 hours):
- rescue_teams: one per 6 trapped people; at least one for trapped/collapse/flood-type
  incidents rated HIGH or CRITICAL. rescue_personnel = 6 per team.
- ambulances: one per 3 injured (at least one for medical emergencies).
- medical_personnel: one per 4 injured, plus one lead when anyone is injured.
- boats: one per 8 affected people for flood and cyclone.
- medicine_kits: 2 per injured person + 1 per 10 affected.
- food_packets and water_bottles: 3 per affected person (one day; 1 L bottles).
- shelter_places: every affected person for displacing hazards.
Availability comes from on-duty free teams, the asset/supply inventory and open shelter space.
"""
import math

DISPLACING = {"flood", "landslide", "cyclone", "earthquake", "fire"}
RESCUE_TYPES = {"trapped", "landslide", "earthquake", "flood", "cyclone", "fire"}
LABELS = {"rescue_teams": "Rescue teams", "rescue_personnel": "Rescue personnel", "ambulances": "Ambulances",
          "medical_personnel": "Medical personnel", "boats": "Boats", "medicine_kits": "Medicine kits",
          "food_packets": "Food packets", "water_bottles": "Water bottles", "shelter_places": "Shelter places"}


def required(incident_type: str, level: str, people: dict) -> dict:
    affected, trapped, injured = people["affected"], people["trapped"], people["injured"]
    teams = math.ceil(trapped / 6) if trapped else 0
    if not teams and incident_type in RESCUE_TYPES and level in ("HIGH", "CRITICAL"):
        teams = 1
    ambulances = math.ceil(injured / 3) if injured else (1 if incident_type == "medical" else 0)
    return {
        "rescue_teams": teams,
        "rescue_personnel": teams * 6,
        "ambulances": ambulances,
        "medical_personnel": (math.ceil(injured / 4) + 1) if injured else (1 if incident_type == "medical" else 0),
        "boats": math.ceil(affected / 8) if incident_type in ("flood", "cyclone") else 0,
        "medicine_kits": injured * 2 + math.ceil(affected / 10),
        "food_packets": affected * 3,
        "water_bottles": affected * 3,
        "shelter_places": affected if incident_type in DISPLACING else 0,
    }


def compare(need: dict, available: dict) -> list:
    rows = []
    for key, amount in need.items():
        have = max(0, int(available.get(key, 0)))
        rows.append({"key": key, "label": LABELS[key], "required": amount, "available": have, "shortfall": max(0, amount - have)})
    return rows
