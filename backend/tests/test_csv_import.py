"""Tests for the flexible CSV import used by the Capacity Planner upload."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import app
from csv_import import guess_mapping

SAMPLE = Path(__file__).resolve().parent.parent / "data" / "sample_theatre_export.csv"


def test_guess_mapping_reads_hospital_style_headers():
    cols = [
        "Case No",
        "Surgery Date",
        "Theatre",
        "Specialty",
        "Procedure Code",
        "Procedure Description",
        "Wheels In",
        "Wheels Out",
        "Booked Minutes",
    ]
    m = guess_mapping(cols)
    assert m["service"] == "Specialty"
    assert m["date"] == "Surgery Date"
    assert m["start_time"] == "Wheels In"
    assert m["end_time"] == "Wheels Out"
    assert m["or_suite"] == "Theatre"


def test_planned_length_is_never_guessed_as_actual_duration():
    for planned in ["Booked Minutes", "Scheduled Duration", "Planned Duration (min)"]:
        m = guess_mapping(["Specialty", planned, "Wheels In", "Wheels Out"])
        assert m["duration"] != planned


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_sample_file_full_upload_flow(client):
    data = SAMPLE.read_bytes()
    files = {"file": ("sample_theatre_export.csv", data, "text/csv")}

    inspected = client.post("/api/upload/inspect", files=files).json()
    mapping = inspected["suggested_mapping"]

    processed = client.post(
        "/api/upload/process", files=files, data={"mapping": json.dumps(mapping)}
    ).json()
    assert not processed["has_errors"]
    assert processed["rows_used"] == processed["rows_read"] == 536
    names = {s["name"] for s in processed["specialties"]}
    assert names == {"Orthopedics", "General Surgery", "ENT", "Ophthalmology", "Urology", "OBGYN"}
    # Durations come from Wheels In/Out, so they are not the round booked values.
    durations = [s["avg_duration_min"] for s in processed["specialties"]]
    assert any(d != round(d / 5) * 5 for d in durations)

    plan = client.post(
        "/api/plan", json={"capacity": {}, "specialties": processed["specialties"]}
    ).json()
    assert plan["status"] == "Optimal"
