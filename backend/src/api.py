"""
HTTP API exposing the capacity planner to the dashboard.

Run:
    py -3 -m uvicorn api:app --reload --port 8000     (from backend/src)

Endpoints:
    GET  /api/health      liveness probe
    GET  /api/defaults    historical figures to prefill the planner form
    POST /api/plan        solve a capacity plan from user-supplied parameters
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import data_prep
from planner import HospitalCapacity, SpecialtyDemand, plan_capacity

app = FastAPI(title="OR Capacity Planner", version="1.0")

# The dashboard is served by Vite on a different port during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


def _historical():
    """Load and cache the historical tables used for form defaults."""
    if "data" not in _cache:
        _cache["data"] = data_prep.load_all()
    return _cache["data"]


class SpecialtyDemandIn(BaseModel):
    name: str
    demand_cases: float = Field(ge=0)
    avg_duration_min: float = Field(gt=0)
    priority: float = Field(default=1.0, ge=0)
    min_hours: float = Field(default=0.0, ge=0)
    surgeon_hours: float | None = Field(default=None, ge=0)
    equipment_max_cases: float | None = Field(default=None, ge=0)


class CapacityIn(BaseModel):
    or_suites: int = Field(default=8, ge=1)
    hours_per_day: float = Field(default=8.0, gt=0)
    days_per_week: int = Field(default=5, ge=1, le=7)
    overtime_cap_hours: float = Field(default=0.0, ge=0)
    emergency_reserve_pct: float = Field(default=0.0, ge=0, le=90)
    overtime_penalty: float = Field(default=0.5, ge=0)


class PlanRequest(BaseModel):
    capacity: CapacityIn
    specialties: list[SpecialtyDemandIn]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/defaults")
def defaults() -> dict:
    """Historical averages, so the planner form opens with real numbers."""
    data = _historical()
    cases = data["cases"]
    inputs = data["specialty_inputs"]

    weeks = data_prep.WEEKS_IN_QUARTER
    rows = []
    for row in inputs.itertuples():
        rows.append(
            {
                "name": row.Label,
                "demand_cases": round(row.Case_Count / weeks, 1),
                "avg_duration_min": round(row.Avg_Duration_Min, 1),
                "priority": 1.0,
                "min_hours": 0.0,
                "surgeon_hours": None,
                "equipment_max_cases": None,
            }
        )

    return {
        "specialties": rows,
        "observed": {
            "or_suites": int(cases["OR Suite"].nunique()),
            "total_cases": int(len(cases)),
            "weeks": weeks,
            "avg_cases_per_week": round(len(cases) / weeks, 1),
            "avg_utilization_pct": round(
                float(data["suite_day_stats"]["Utilization_Pct"].mean()), 2
            ),
        },
        "note": (
            "Demand figures are the historical weekly averages from the loaded "
            "dataset. Replace them with your own forecast before planning."
        ),
    }


@app.post("/api/plan")
def create_plan(request: PlanRequest) -> dict:
    if not request.specialties:
        raise HTTPException(400, "At least one specialty is required")

    names = [s.name for s in request.specialties]
    if len(names) != len(set(names)):
        raise HTTPException(400, "Specialty names must be unique")

    capacity = HospitalCapacity(**request.capacity.model_dump())
    demands = [SpecialtyDemand(**s.model_dump()) for s in request.specialties]

    try:
        result = plan_capacity(demands, capacity)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {
        "status": result.status,
        "bottleneck": result.bottleneck,
        "recommendations": result.recommendations,
        "totals": {
            "cases_scheduled": round(result.total_cases, 2),
            "cases_demanded": round(result.total_demand, 2),
            "cases_unmet": round(result.total_unmet, 2),
            "demand_met_pct": round(result.demand_met_pct, 1),
            "regular_hours_used": round(result.regular_hours_used, 2),
            "overtime_hours_used": round(result.overtime_hours_used, 2),
            "total_hours_used": round(result.total_hours_used, 2),
            "utilization_pct": round(result.utilization_pct, 1),
        },
        "capacity": {
            "regular_hours": round(capacity.regular_hours, 2),
            "reserved_hours": round(capacity.reserved_hours, 2),
            "usable_regular_hours": round(capacity.usable_regular_hours, 2),
            "overtime_cap_hours": capacity.overtime_cap_hours,
        },
        "specialties": [
            {
                "name": s.name,
                "allocated_hours": round(s.allocated_hours, 2),
                "cases_scheduled": round(s.cases_scheduled, 2),
                "demand_cases": round(s.demand_cases, 2),
                "unmet_cases": round(s.unmet_cases, 2),
                "demand_met_pct": round(s.demand_met_pct, 1),
                "hours_needed": round(s.hours_needed, 2),
                "limiting_factor": s.limiting_factor,
            }
            for s in result.specialties
        ],
    }
