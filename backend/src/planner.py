"""
Capacity planner — the practical, hospital-facing model.

The LP in optimization.py answers a retrospective question: given what this
hospital did last quarter, what allocation would have maximised throughput?
That is an analysis.

This module answers the forward-looking question a scheduler actually asks:

    "We have N operating rooms, open H hours a day, D days a week, and we can
     authorise at most V hours of overtime. Here is the demand we expect per
     specialty, and here are our surgeon and equipment limits. What should we
     run, what will we miss, and what is holding us back?"

Everything is a parameter, so the model is usable by any hospital rather than
being tied to the 2022 dataset. Historical data is only ever used to prefill
sensible defaults.

MODEL

    decision variables
        X_s   hours allocated to specialty s
        O     overtime hours authorised (0 <= O <= overtime_cap)

    derived
        cases_s = 60 * X_s / D_s        cases completed for specialty s

    maximise
        sum_s (priority_s * cases_s) - overtime_penalty * O

    subject to
        sum_s X_s <= usable_regular_hours + O     capacity, net of reserve
        cases_s <= demand_s                        never schedule beyond demand
        X_s >= min_hours_s                         service-level floor
        X_s <= surgeon_hours_s                     surgeon availability
        cases_s <= equipment_cap_s                 equipment-limited procedures
        X_s >= 0

Unmet demand is reported rather than constrained away, so the model always
returns a plan: when capacity is short it tells you what gets dropped and why,
which is the whole point of a planning tool.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pulp

# Treat a constraint as binding when slack falls below this. CBC leaves
# residuals around 1e-6; 0.001 hours is 3.6 seconds, far below any real
# scheduling granularity but comfortably above solver noise.
BINDING_TOLERANCE = 1e-3


@dataclass
class SpecialtyDemand:
    """One specialty's expected workload and its local limits."""

    name: str
    demand_cases: float               # expected cases per week
    avg_duration_min: float           # average case length, minutes
    priority: float = 1.0             # relative importance, higher wins
    min_hours: float = 0.0            # guaranteed floor (service-level agreement)
    surgeon_hours: float | None = None      # surgeon availability ceiling
    equipment_max_cases: float | None = None  # equipment-limited case ceiling

    @property
    def hours_needed(self) -> float:
        """Hours required to clear this specialty's full demand."""
        return self.demand_cases * self.avg_duration_min / 60


@dataclass
class HospitalCapacity:
    """The hospital's physical and policy capacity parameters."""

    or_suites: int = 8
    hours_per_day: float = 8.0
    days_per_week: int = 5
    overtime_cap_hours: float = 0.0        # most overtime authorised per week
    emergency_reserve_pct: float = 0.0     # capacity held back for emergencies
    overtime_penalty: float = 0.5          # cases forgone per overtime hour used

    @property
    def regular_hours(self) -> float:
        return self.or_suites * self.hours_per_day * self.days_per_week

    @property
    def reserved_hours(self) -> float:
        return self.regular_hours * (self.emergency_reserve_pct / 100.0)

    @property
    def usable_regular_hours(self) -> float:
        return self.regular_hours - self.reserved_hours


@dataclass
class SpecialtyPlan:
    name: str
    allocated_hours: float
    cases_scheduled: float
    demand_cases: float
    hours_needed: float
    limiting_factor: str

    @property
    def unmet_cases(self) -> float:
        return max(0.0, self.demand_cases - self.cases_scheduled)

    @property
    def demand_met_pct(self) -> float:
        if self.demand_cases <= 0:
            return 100.0
        return min(100.0, self.cases_scheduled / self.demand_cases * 100)


@dataclass
class CapacityPlan:
    status: str
    specialties: list[SpecialtyPlan]
    capacity: HospitalCapacity
    regular_hours_used: float
    overtime_hours_used: float
    bottleneck: str
    recommendations: list[str] = field(default_factory=list)

    @property
    def total_cases(self) -> float:
        return sum(s.cases_scheduled for s in self.specialties)

    @property
    def total_demand(self) -> float:
        return sum(s.demand_cases for s in self.specialties)

    @property
    def total_unmet(self) -> float:
        return sum(s.unmet_cases for s in self.specialties)

    @property
    def total_hours_used(self) -> float:
        return self.regular_hours_used + self.overtime_hours_used

    @property
    def demand_met_pct(self) -> float:
        if self.total_demand <= 0:
            return 100.0
        return self.total_cases / self.total_demand * 100

    @property
    def utilization_pct(self) -> float:
        usable = self.capacity.usable_regular_hours
        if usable <= 0:
            return 0.0
        return self.regular_hours_used / usable * 100


def plan_capacity(
    demands: list[SpecialtyDemand],
    capacity: HospitalCapacity,
) -> CapacityPlan:
    """Solve the forward-looking capacity plan."""
    if not demands:
        raise ValueError("At least one specialty demand is required")

    model = pulp.LpProblem("OR_Capacity_Plan", pulp.LpMaximize)

    hours: dict[str, pulp.LpVariable] = {}
    for i, d in enumerate(demands):
        upper = d.hours_needed  # never allocate beyond what demand requires
        if d.surgeon_hours is not None:
            upper = min(upper, d.surgeon_hours)
        if d.equipment_max_cases is not None:
            upper = min(upper, d.equipment_max_cases * d.avg_duration_min / 60)

        # A min_hours floor above the ceiling would make the model infeasible;
        # clamp it and surface the conflict as a recommendation later.
        lower = min(d.min_hours, upper)
        hours[d.name] = pulp.LpVariable(f"hours_{i}", lowBound=lower, upBound=upper)

    overtime = pulp.LpVariable(
        "overtime", lowBound=0, upBound=max(0.0, capacity.overtime_cap_hours)
    )

    cases = {
        d.name: (60.0 / d.avg_duration_min) * hours[d.name] for d in demands
    }

    model += (
        pulp.lpSum(d.priority * cases[d.name] for d in demands)
        - capacity.overtime_penalty * overtime
    )

    model += (
        pulp.lpSum(hours.values()) <= capacity.usable_regular_hours + overtime,
        "capacity",
    )

    model.solve(pulp.PULP_CBC_CMD(msg=False))

    status = pulp.LpStatus[model.status]
    overtime_used = float(overtime.value() or 0.0)
    total_allocated = float(sum(v.value() or 0.0 for v in hours.values()))
    regular_used = max(0.0, total_allocated - overtime_used)

    plans = []
    for d in demands:
        allocated = float(hours[d.name].value() or 0.0)
        scheduled = allocated * 60 / d.avg_duration_min
        plans.append(
            SpecialtyPlan(
                name=d.name,
                allocated_hours=allocated,
                cases_scheduled=scheduled,
                demand_cases=d.demand_cases,
                hours_needed=d.hours_needed,
                limiting_factor=_limiting_factor(d, allocated, scheduled),
            )
        )

    bottleneck, recommendations = _diagnose(plans, demands, capacity, total_allocated, overtime_used)

    return CapacityPlan(
        status=status,
        specialties=plans,
        capacity=capacity,
        regular_hours_used=regular_used,
        overtime_hours_used=overtime_used,
        bottleneck=bottleneck,
        recommendations=recommendations,
    )


def _limiting_factor(d: SpecialtyDemand, allocated: float, scheduled: float) -> str:
    """Explain, per specialty, what stopped it from getting more time."""
    if scheduled >= d.demand_cases - BINDING_TOLERANCE:
        return "demand fully met"
    if d.surgeon_hours is not None and allocated >= d.surgeon_hours - BINDING_TOLERANCE:
        return "surgeon availability"
    if (
        d.equipment_max_cases is not None
        and scheduled >= d.equipment_max_cases - BINDING_TOLERANCE
    ):
        return "equipment capacity"
    if allocated <= d.min_hours + BINDING_TOLERANCE and d.min_hours > 0:
        return "held at minimum guarantee"
    return "OR capacity"


def _diagnose(
    plans: list[SpecialtyPlan],
    demands: list[SpecialtyDemand],
    capacity: HospitalCapacity,
    total_allocated: float,
    overtime_used: float,
) -> tuple[str, list[str]]:
    """Identify the binding bottleneck and suggest what would relieve it."""
    available = capacity.usable_regular_hours + capacity.overtime_cap_hours
    capacity_binding = total_allocated >= available - BINDING_TOLERANCE

    total_needed = sum(d.hours_needed for d in demands)
    shortfall = total_needed - capacity.usable_regular_hours
    recs: list[str] = []

    if capacity_binding:
        bottleneck = "OR capacity"
        extra = total_needed - total_allocated
        if extra > BINDING_TOLERANCE:
            recs.append(
                f"{extra:.1f} more OR-hours per week would clear all remaining demand."
            )
            per_day = extra / max(1, capacity.days_per_week)
            recs.append(
                f"Equivalent to about {per_day:.1f} extra hours per operating day, "
                f"or {extra / max(1.0, capacity.hours_per_day * capacity.days_per_week):.1f} "
                "additional OR suites."
            )
        if (
            capacity.overtime_cap_hours > 0
            and overtime_used >= capacity.overtime_cap_hours - BINDING_TOLERANCE
        ):
            recs.append(
                f"The {capacity.overtime_cap_hours:.1f} hr overtime allowance is fully "
                "consumed; raising it would admit more cases."
            )
    elif any(p.limiting_factor == "surgeon availability" for p in plans):
        bottleneck = "Surgeon availability"
        names = [p.name for p in plans if p.limiting_factor == "surgeon availability"]
        recs.append(
            "OR capacity is not the constraint - surgeon hours are, for: "
            + ", ".join(names)
            + ". Additional rooms would sit idle; more surgeon time is what adds cases."
        )
    elif any(p.limiting_factor == "equipment capacity" for p in plans):
        bottleneck = "Equipment capacity"
        names = [p.name for p in plans if p.limiting_factor == "equipment capacity"]
        recs.append(
            "Equipment limits are binding for: "
            + ", ".join(names)
            + ". Extra OR time cannot be used until that equipment is available."
        )
    else:
        bottleneck = "None - all demand met"
        slack = capacity.usable_regular_hours - total_allocated
        recs.append(
            f"All demand is met using {total_allocated:.1f} hrs, leaving {slack:.1f} hrs "
            "of spare capacity."
        )
        if slack > 0 and capacity.emergency_reserve_pct > 0:
            recs.append(
                f"This is on top of {capacity.reserved_hours:.1f} hrs already held back "
                "as emergency reserve."
            )

    if shortfall > BINDING_TOLERANCE and not capacity_binding:
        recs.append(
            f"Note: total demand needs {total_needed:.1f} hrs against "
            f"{capacity.usable_regular_hours:.1f} usable regular hours."
        )

    for d in demands:
        ceiling = d.hours_needed
        if d.surgeon_hours is not None:
            ceiling = min(ceiling, d.surgeon_hours)
        if d.min_hours > ceiling + BINDING_TOLERANCE:
            recs.append(
                f"{d.name}: the {d.min_hours:.1f} hr minimum guarantee exceeds what its "
                f"demand or surgeon availability can use ({ceiling:.1f} hrs) — the "
                "guarantee was capped to keep the plan feasible."
            )

    return bottleneck, recs
