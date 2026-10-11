"""Smoke tests for the planner HTTP API."""

import pytest
from fastapi.testclient import TestClient

from api import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_defaults_lists_all_specialties(client):
    body = client.get("/api/defaults").json()
    assert len(body["specialties"]) == 10
    assert body["observed"]["or_suites"] == 8


def test_plan_with_defaults_is_solved(client):
    specialties = client.get("/api/defaults").json()["specialties"]
    resp = client.post("/api/plan", json={"capacity": {}, "specialties": specialties})
    assert resp.status_code == 200
    assert resp.json()["status"] == "Optimal"


def test_plan_rejects_duplicate_names(client):
    s = {"name": "ENT", "demand_cases": 5, "avg_duration_min": 60}
    resp = client.post("/api/plan", json={"capacity": {}, "specialties": [s, s]})
    assert resp.status_code == 400


def test_plan_rejects_empty_specialties(client):
    resp = client.post("/api/plan", json={"capacity": {}, "specialties": []})
    assert resp.status_code == 400
