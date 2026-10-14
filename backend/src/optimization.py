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
from typing import Any

import pandas as pd
import pulp


def default_solver() -> pulp.LpSolver:
    """HiGHS via the highspy package: bundled wheels, works on PuLP 3 and 4
    (PuLP 4 no longer ships the CBC binary), and reports duals/reduced costs."""
    return pulp.HiGHS(msg=False)


_STATUS_NAMES = {
    0: "Not Solved",
    1: "Optimal",
    -1: "Infeasible",
    -2: "Unbounded",
    -3: "Undefined",
    -4: "Time Limit",
}


def solve(model: pulp.LpProblem) -> str:
    """Solve with the default solver and return the status name.

    PuLP 3 returns an int status code; PuLP 4 returns an LpSolveStats object
    whose ``status`` is an int enum - both map onto the same codes.
    """
    result: Any = model.solve(default_solver())
    code = int(getattr(result, "status", result))
    return _STATUS_NAMES.get(code, "Undefined")


def num(expr: Any) -> float:
    """Numeric value of a solved variable or expression (0.0 if unsolved)."""
    value = pulp.value(expr)
    return 0.0 if value is None else float(value)


_dual_sign: float | None = None


def _maximisation_dual_sign() -> float:
    """Sign that turns a reported dual into "objective gain per unit".

    The sign convention for duals on maximisation models differs between
    PuLP/solver versions (PuLP 4.0.0 + HiGHS reports them negated, 4.0.1 does
    not). Rather than hard-code one, solve a one-variable problem whose
    shadow price is known to be +1 (max x s.t. x <= 1) and see what the
    solver reports.
    """
    global _dual_sign
    if _dual_sign is None:
        probe = pulp.LpProblem("dual_sign_probe", pulp.LpMaximize)
        x = probe.add_variable("x", lowBound=0)
        probe += x
        probe += x <= 1, "cap"
        solve(probe)
        cap = probe.get_constraint_by_name("cap")
        pi = cap.pi if cap is not None else None
        _dual_sign = -1.0 if pi is not None and pi < 0 else 1.0
    return _dual_sign


def objective_gain(dual: float | None) -> float | None:
    """Express a dual from a maximisation model as the objective gain per unit."""
    return None if dual is None else _maximisation_dual_sign() * dual


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
        row.Label: model.add_variable(f"hours_{i}", lowBound=row.Min_Hours, upBound=row.Max_Hours)
        for i, row in enumerate(inputs.itertuples())
    }

    cases_per_hour = {row.Label: 60.0 / row.Avg_Duration_Min for row in inputs.itertuples()}

    model += pulp.lpSum(cases_per_hour[label] * var for label, var in x.items())

    capacity_constraint = pulp.lpSum(x.values()) <= capacity_hours
    model += capacity_constraint, "total_capacity"

    status = solve(model)

    allocation = pd.DataFrame(
        {
            "Label": list(x.keys()),
            "Allocated_Hours": [v.value() for v in x.values()],
        }
    ).merge(inputs[["Label", "Avg_Duration_Min", "Min_Hours", "Max_Hours"]], on="Label")
    allocation["Cases_Performed"] = (
        allocation["Allocated_Hours"] * 60 / allocation["Avg_Duration_Min"]
    )
    allocation["Binding"] = allocation.apply(_binding_label, axis=1)
    # Reduced cost: marginal change in the objective per unit increase in the
    # variable, i.e. the value of relaxing that group's bound by one hour.
    allocation["Reduced_Cost"] = [objective_gain(getattr(v, "dj", None)) for v in x.values()]

    total_hours = float(allocation["Allocated_Hours"].sum())
    capacity_row = model.get_constraint_by_name("total_capacity")

    return LpResult(
        status=status,
        total_cases=num(model.objective),
        total_hours=total_hours,
        capacity_hours=capacity_hours,
        allocation=allocation.sort_values("Label").reset_index(drop=True),
        capacity_shadow_price=objective_gain(getattr(capacity_row, "pi", None)),
        capacity_slack=max(0.0, capacity_hours - total_hours),  # clamp solver round-off
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
        row.Label: model.add_variable(f"hours_{i}", lowBound=row.Min_Hours, upBound=row.Max_Hours)
        for i, row in enumerate(inputs.itertuples())
    }

    d1_minus = model.add_variable("d1_minus", lowBound=0)  # cases short of target
    d1_plus = model.add_variable("d1_plus", lowBound=0)  # cases above target
    d2_minus = model.add_variable("d2_minus", lowBound=0)  # overtime under target
    d2_plus = model.add_variable("d2_plus", lowBound=0)  # overtime over target

    # Penalise only under-achievement on cases and overrun on overtime.
    model += w1 * d1_minus + w2 * d2_plus

    cases_expr = pulp.lpSum(
        (60.0 / row.Avg_Duration_Min) * x[row.Label] for row in inputs.itertuples()
    )
    overtime_expr = pulp.lpSum(row.Overtime_Per_Hour * x[row.Label] for row in inputs.itertuples())

    model += cases_expr + d1_minus - d1_plus == throughput_target, "goal_throughput"
    model += overtime_expr + d2_minus - d2_plus == overtime_target, "goal_overtime"
    model += pulp.lpSum(x.values()) <= capacity_hours, "total_capacity"

    status = solve(model)

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
        status=status,
        total_cases=num(cases_expr),
        total_hours=float(allocation["Allocated_Hours"].sum()),
        total_overtime_hours=num(overtime_expr),
        d1_minus=max(0.0, num(d1_minus)),
        d1_plus=max(0.0, num(d1_plus)),
        d2_minus=max(0.0, num(d2_minus)),
        d2_plus=max(0.0, num(d2_plus)),
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


def capacity_sweep(
    inputs: pd.DataFrame,
    capacities: list[float] | None = None,
) -> pd.DataFrame:
    """Re-solve the LP across a range of weekly capacities.

    Shows where capacity stops being the bottleneck: below that point every
    extra hour adds cases (positive shadow price); above it the demand
    ceilings bind instead and extra capacity adds nothing.
    """
    if capacities is None:
        capacities = [float(c) for c in range(100, 330, 10)]

    rows = []
    for capacity in capacities:
        result = solve_lp(inputs, capacity)
        if result.status != "Optimal":
            # e.g. the Min_Hours floors alone exceed this capacity
            rows.append({"Capacity_Hours": capacity, "Status": result.status})
            continue
        rows.append(
            {
                "Capacity_Hours": capacity,
                "Status": result.status,
                "Total_Cases": result.total_cases,
                "Hours_Used": result.total_hours,
                "Capacity_Slack": result.capacity_slack,
                "Shadow_Price": result.capacity_shadow_price,
                "Capacity_Binding": result.capacity_is_binding,
            }
        )
    return pd.DataFrame(rows)


def goal_tradeoff(
    inputs: pd.DataFrame,
    throughput_target: float,
    overtime_target: float,
    capacity_hours: float = DEFAULT_CAPACITY_HOURS,
    overtime_weights: list[float] | None = None,
    throughput_weight: float = 6.0,
) -> pd.DataFrame:
    """Re-solve the goal programme while raising the overtime weight W2.

    Traces the throughput-vs-overtime trade-off curve: as overtime is
    penalised more heavily the model gives up cases to reduce overtime.
    """
    if overtime_weights is None:
        # Deviations are unnormalised (cases vs overtime hours, ~200 vs ~0.05),
        # so W2 must span several orders of magnitude to move the solution.
        overtime_weights = [0.0, 1.0, 10.0, 100.0, 1e3, 3e3, 1e4, 3e4, 1e5]

    rows = []
    for w2 in overtime_weights:
        gp = solve_goal_programming(
            inputs,
            throughput_target,
            overtime_target,
            throughput_weight,
            w2,
            capacity_hours=capacity_hours,
        )
        rows.append(
            {
                "W1_Throughput": throughput_weight,
                "W2_Overtime": w2,
                "Status": gp.status,
                "Total_Cases": gp.total_cases,
                "Overtime_Hours": gp.total_overtime_hours,
                "Cases_Short": gp.d1_minus,
                "Overtime_Overrun": gp.d2_plus,
            }
        )
    return pd.DataFrame(rows)
