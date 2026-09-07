"""
Linear Programming and Goal Programming models, solved with PuLP (CBC).

Replaces the Excel Solver models. Both formulations are identical to the
originals, so results are directly comparable:

LINEAR PROGRAMMING — maximise weekly surgical throughput

    maximise    Z = sum_s (60 * X_s / D_s)
    subject to  sum_s X_s <= C                     (total weekly OR capacity)
                Min_s <= X_s <= Max_s              (historical demand bounds)
                X_s >= 0

    X_s = weekly OR-hours allocated to group s
    D_s = that group's average actual case duration, in minutes
    60 / D_s converts an hour of OR time into a number of cases

GOAL PROGRAMMING — balance throughput against overtime

    Goal 1  sum_s (60 * X_s / D_s) + d1_minus - d1_plus = throughput_target
    Goal 2  sum_s (beta_s * X_s)   + d2_minus - d2_plus = overtime_target

    minimise  W1 * d1_minus + W2 * d2_plus

    Only the unwanted direction of each goal is penalised: falling short on
    cases (d1_minus) and overrunning on overtime (d2_plus). Beating either
    goal is free.
"""

from dataclasses import dataclass, field

import pandas as pd
import pulp

DEFAULT_CAPACITY_HOURS = 320.0  # 8 suites x 40 hrs/week

# A constraint counts as binding when its slack is below this. CBC returns
# solutions with residuals around 1e-6, so a stricter test would report a
# genuinely saturated constraint as slack. 0.001 hours is 3.6 seconds of OR
# time — far below any real scheduling granularity, but well above solver noise.
BINDING_TOLERANCE_HOURS = 1e-3


@dataclass
class LpResult:
    status: str
    total_cases: float
    total_hours: float
    capacity_hours: float
    allocation: pd.DataFrame
    capacity_shadow_price: float | None = None
    capacity_slack: float = 0.0

    @property
    def capacity_is_binding(self) -> bool:
        return self.capacity_slack < BINDING_TOLERANCE_HOURS


@dataclass
class GoalResult:
    status: str
    total_cases: float
    total_hours: float
    total_overtime_hours: float
    d1_minus: float
    d1_plus: float
    d2_minus: float
    d2_plus: float
    throughput_target: float
    overtime_target: float
    weights: tuple[float, float]
    allocation: pd.DataFrame = field(default_factory=pd.DataFrame)


def solve_lp(
    inputs: pd.DataFrame,
    capacity_hours: float = DEFAULT_CAPACITY_HOURS,
) -> LpResult:
    """Maximise weekly cases subject to capacity and per-group demand bounds."""
    model = pulp.LpProblem("OR_Capacity_Allocation", pulp.LpMaximize)

    x = {
        row.Label: pulp.LpVariable(
            f"hours_{i}", lowBound=row.Min_Hours, upBound=row.Max_Hours
        )
        for i, row in enumerate(inputs.itertuples())
    }

    cases_per_hour = {
        row.Label: 60.0 / row.Avg_Duration_Min for row in inputs.itertuples()
    }

    model += pulp.lpSum(cases_per_hour[label] * var for label, var in x.items())

    capacity_constraint = pulp.lpSum(x.values()) <= capacity_hours
    model += capacity_constraint, "total_capacity"

    model.solve(pulp.PULP_CBC_CMD(msg=False))

    allocation = pd.DataFrame(
        {
            "Label": list(x.keys()),
            "Allocated_Hours": [v.value() for v in x.values()],
        }
    ).merge(
        inputs[["Label", "Avg_Duration_Min", "Min_Hours", "Max_Hours"]], on="Label"
    )
    allocation["Cases_Performed"] = (
        allocation["Allocated_Hours"] * 60 / allocation["Avg_Duration_Min"]
    )
    allocation["Binding"] = allocation.apply(_binding_label, axis=1)
    # Reduced cost: marginal change in the objective per unit increase in the
    # variable, i.e. the value of relaxing that group's bound by one hour.
    allocation["Reduced_Cost"] = [
        getattr(v, "dj", None) for v in x.values()
    ]

    total_hours = float(allocation["Allocated_Hours"].sum())
    capacity_row = model.constraints["total_capacity"]

    return LpResult(
        status=pulp.LpStatus[model.status],
        total_cases=float(pulp.value(model.objective)),
        total_hours=total_hours,
        capacity_hours=capacity_hours,
        allocation=allocation.sort_values("Label").reset_index(drop=True),
        capacity_shadow_price=getattr(capacity_row, "pi", None),
        capacity_slack=capacity_hours - total_hours,
    )


def solve_goal_programming(
    inputs: pd.DataFrame,
    throughput_target: float,
    overtime_target: float,
    w1: float = 1.0,
    w2: float = 1.0,
    capacity_hours: float = DEFAULT_CAPACITY_HOURS,
) -> GoalResult:
    """Balance a throughput goal against an overtime goal via deviations."""
    model = pulp.LpProblem("OR_Goal_Programming", pulp.LpMinimize)

    x = {
        row.Label: pulp.LpVariable(
            f"hours_{i}", lowBound=row.Min_Hours, upBound=row.Max_Hours
        )
        for i, row in enumerate(inputs.itertuples())
    }

    d1_minus = pulp.LpVariable("d1_minus", lowBound=0)  # cases short of target
    d1_plus = pulp.LpVariable("d1_plus", lowBound=0)    # cases above target
    d2_minus = pulp.LpVariable("d2_minus", lowBound=0)  # overtime under target
    d2_plus = pulp.LpVariable("d2_plus", lowBound=0)    # overtime over target

    # Penalise only under-achievement on cases and overrun on overtime.
    model += w1 * d1_minus + w2 * d2_plus

    cases_expr = pulp.lpSum(
        (60.0 / row.Avg_Duration_Min) * x[row.Label] for row in inputs.itertuples()
    )
    overtime_expr = pulp.lpSum(
        row.Overtime_Per_Hour * x[row.Label] for row in inputs.itertuples()
    )

    model += cases_expr + d1_minus - d1_plus == throughput_target, "goal_throughput"
    model += overtime_expr + d2_minus - d2_plus == overtime_target, "goal_overtime"
    model += pulp.lpSum(x.values()) <= capacity_hours, "total_capacity"

    model.solve(pulp.PULP_CBC_CMD(msg=False))

    allocation = pd.DataFrame(
        {
            "Label": list(x.keys()),
            "Allocated_Hours": [v.value() for v in x.values()],
        }
    ).merge(inputs[["Label", "Avg_Duration_Min"]], on="Label")
    allocation["Cases_Performed"] = (
        allocation["Allocated_Hours"] * 60 / allocation["Avg_Duration_Min"]
    )

    return GoalResult(
        status=pulp.LpStatus[model.status],
        total_cases=float(pulp.value(cases_expr)),
        total_hours=float(allocation["Allocated_Hours"].sum()),
        total_overtime_hours=float(pulp.value(overtime_expr)),
        d1_minus=float(d1_minus.value()),
        d1_plus=float(d1_plus.value()),
        d2_minus=float(d2_minus.value()),
        d2_plus=float(d2_plus.value()),
        throughput_target=throughput_target,
        overtime_target=overtime_target,
        weights=(w1, w2),
        allocation=allocation.sort_values("Label").reset_index(drop=True),
    )


def _binding_label(row) -> str:
    if abs(row.Allocated_Hours - row.Max_Hours) < BINDING_TOLERANCE_HOURS:
        return "at max bound"
    if abs(row.Allocated_Hours - row.Min_Hours) < BINDING_TOLERANCE_HOURS:
        return "at min bound"
    return "flexible"


def sensitivity_report(result: LpResult) -> pd.DataFrame:
    """Per-variable sensitivity table, the equivalent of Excel's report."""
    report = result.allocation[
        ["Label", "Allocated_Hours", "Min_Hours", "Max_Hours", "Binding", "Reduced_Cost"]
    ].copy()
    report["Cases_Per_Hour"] = 60 / result.allocation["Avg_Duration_Min"]
    return report
