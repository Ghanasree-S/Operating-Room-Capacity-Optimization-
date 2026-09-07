"""
Validation suite.

Checks the pipeline against figures independently produced by the original
Excel Solver model, and asserts that both optimization models satisfy their
own constraints.

Usage:
    py -3 src/verify.py
"""

import sys

import data_prep
import statistics_module as stats_mod
from optimization import solve_goal_programming, solve_lp

EXCEL_BASELINE_CASES = 200.49  # Excel Solver, Simplex LP, specialty granularity
SCARCE_CAPACITY = 110.0

_failures = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global _failures
    if not condition:
        _failures += 1
    mark = "PASS" if condition else "FAIL"
    suffix = f" - {detail}" if detail else ""
    print(f"  [{mark}] {label}{suffix}")


def main() -> int:
    data = data_prep.load_all()
    cases = data["cases"]
    suite_day = data["suite_day_stats"]
    specialty = data["specialty_inputs"]
    procedure = data["procedure_inputs"]

    print("\n=== DATA INTEGRITY ===")
    ov = stats_mod.overview(cases, suite_day)
    check("2,172 surgical cases loaded", ov["total_cases"] == 2172, str(ov["total_cases"]))
    check("8 OR suites present", ov["or_suites"] == 8, str(ov["or_suites"]))
    check("10 surgical specialties", ov["specialties"] == 10, str(ov["specialties"]))
    check("32 distinct procedures", ov["procedures"] == 32, str(ov["procedures"]))
    check(
        "average utilization near 44.4%",
        abs(ov["avg_utilization_pct"] - 44.36) < 0.5,
        f"{ov['avg_utilization_pct']:.2f}%",
    )
    check(
        "no negative durations",
        (cases["Actual_Duration_Min"] >= 0).all(),
        "all durations >= 0",
    )
    check(
        "overtime never negative",
        (cases["Overtime_Min"] >= 0).all(),
        "clipped at zero by definition",
    )
    check(
        "turnover only missing on each room-day's last case",
        int(cases["Turnover_Min"].isna().sum()) == len(suite_day),
        f"{int(cases['Turnover_Min'].isna().sum())} NaN vs {len(suite_day)} room-days",
    )

    print("\n=== LINEAR PROGRAMMING (by specialty) ===")
    lp = solve_lp(specialty)
    check("solver reached optimality", lp.status == "Optimal", lp.status)
    check(
        "matches the Excel Solver baseline",
        abs(lp.total_cases - EXCEL_BASELINE_CASES) < 0.05,
        f"{lp.total_cases:.2f} vs Excel {EXCEL_BASELINE_CASES}",
    )
    check(
        "capacity constraint respected",
        lp.total_hours <= lp.capacity_hours + 1e-6,
        f"{lp.total_hours:.2f} <= {lp.capacity_hours:.0f}",
    )
    check(
        "every allocation within its bounds",
        bool(
            (lp.allocation["Allocated_Hours"] >= lp.allocation["Min_Hours"] - 1e-6).all()
            and (lp.allocation["Allocated_Hours"] <= lp.allocation["Max_Hours"] + 1e-6).all()
        ),
        "all X within [min, max]",
    )
    check(
        "capacity is non-binding (the project's key finding)",
        not lp.capacity_is_binding,
        f"{lp.capacity_slack:.1f} hrs of slack",
    )

    print("\n=== LINEAR PROGRAMMING (by procedure) ===")
    lp_proc = solve_lp(procedure)
    check("solver reached optimality", lp_proc.status == "Optimal", lp_proc.status)
    check(
        "same objective as specialty view at full capacity",
        abs(lp_proc.total_cases - lp.total_cases) < 0.05,
        f"{lp_proc.total_cases:.2f} vs {lp.total_cases:.2f} - expected, capacity never binds",
    )

    print("\n=== GRANULARITY UNDER SCARCITY ===")
    tight_spec = solve_lp(specialty, SCARCE_CAPACITY)
    tight_proc = solve_lp(procedure, SCARCE_CAPACITY)
    check(
        "capacity binds at the reduced limit",
        tight_spec.capacity_is_binding,
        f"{tight_spec.total_hours:.1f} / {SCARCE_CAPACITY:.0f} hrs",
    )
    check(
        "procedure view is at least as good as specialty view",
        tight_proc.total_cases >= tight_spec.total_cases - 1e-6,
        f"{tight_proc.total_cases:.2f} vs {tight_spec.total_cases:.2f} "
        f"({tight_proc.total_cases - tight_spec.total_cases:+.2f})",
    )

    print("\n=== GOAL PROGRAMMING ===")
    overtime_target = data_prep.weekly_historical_overtime_hours(cases) * 0.8
    gp = solve_goal_programming(specialty, 200.0, overtime_target, 6.0, 6.0)
    check("solver reached optimality", gp.status == "Optimal", gp.status)
    check(
        "all deviation variables non-negative",
        min(gp.d1_minus, gp.d1_plus, gp.d2_minus, gp.d2_plus) >= -1e-9,
        "d >= 0",
    )
    check(
        "throughput goal equation balances",
        abs(gp.total_cases + gp.d1_minus - gp.d1_plus - gp.throughput_target) < 1e-4,
        f"cases + d1- - d1+ = {gp.total_cases + gp.d1_minus - gp.d1_plus:.4f}",
    )
    check(
        "overtime goal equation balances",
        abs(
            gp.total_overtime_hours + gp.d2_minus - gp.d2_plus - gp.overtime_target
        ) < 1e-4,
        f"overtime + d2- - d2+ = {gp.total_overtime_hours + gp.d2_minus - gp.d2_plus:.4f}",
    )
    check(
        "at most one side of each goal pair is active",
        gp.d1_minus * gp.d1_plus < 1e-6 and gp.d2_minus * gp.d2_plus < 1e-6,
        "no goal both under- and over-achieved",
    )
    check(
        "capacity constraint respected",
        gp.total_hours <= 320 + 1e-6,
        f"{gp.total_hours:.2f} <= 320",
    )

    print(
        f"\n{'ALL CHECKS PASSED' if _failures == 0 else f'{_failures} CHECK(S) FAILED'}"
    )
    return 0 if _failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
