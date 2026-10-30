"""Safe-zone facilities: categories, coordinates, live occupancy and no invented values."""
from tests.test_api import auth
from tests.test_operations import ops_client  # noqa: F401  (pytest fixture)


def test_facilities_have_valid_kottayam_coordinates_and_categories(ops_client):
    rows = ops_client.get("/v1/facilities", headers=auth(ops_client, "citizen")).json()
    assert {r["category"] for r in rows} == {"shelter", "relief_camp", "hospital", "relief_center"}
    assert len({(r["latitude"], r["longitude"]) for r in rows}) == len(rows)  # every facility has its own destination
    for r in rows:
        assert 9.3 < r["latitude"] < 9.9 and 76.3 < r["longitude"] < 76.8, r["name"]  # Kottayam district, not another city
        assert r["is_simulated"] is True and r["verification_status"] == "unverified"
        assert r["district"] == "Kottayam" and r["state"] == "Kerala" and r["address"] and r["last_updated"]


def test_capacity_only_from_linked_shelter_and_follows_occupancy(ops_client):
    rows = {r["id"]: r for r in ops_client.get("/v1/facilities", headers=auth(ops_client, "citizen")).json()}
    hospital = rows["fac-medical-college"]
    assert hospital["capacity"] is None and hospital["availability_status"] == "unknown" and hospital["phone"] is None
    camp = rows["fac-st-marys"]
    assert (camp["capacity"], camp["occupancy"], camp["availability_status"]) == (300, 180, "open")
    assert ops_client.post("/v1/shelters/shelter-kumarakom/occupancy", json={"occupancy": 300}, headers=auth(ops_client, "relief")).status_code == 200
    camp = next(r for r in ops_client.get("/v1/facilities", headers=auth(ops_client, "citizen")).json() if r["id"] == "fac-st-marys")
    assert camp["remaining"] == 0 and camp["availability_status"] == "full"


def test_category_filter_and_validation(ops_client):
    citizen = auth(ops_client, "citizen")
    hospitals = ops_client.get("/v1/facilities?category=hospital", headers=citizen).json()
    assert hospitals and all(r["category"] == "hospital" for r in hospitals)
    assert ops_client.get("/v1/facilities?category=casino", headers=citizen).status_code == 422


def test_invalid_coordinates_are_never_served(ops_client):
    from sqlalchemy.orm import Session
    from app.models import Facility
    with Session(ops_client.app.state.engine) as db, db.begin():
        db.add(Facility(id="fac-bad", name="Broken record", category="shelter", latitude=0.0, longitude=0.0, address="?", locality="?",
                        district="Kottayam", state="Kerala", services=[], simulated=True))
    ids = {r["id"] for r in ops_client.get("/v1/facilities", headers=auth(ops_client, "citizen")).json()}
    assert "fac-bad" not in ids
