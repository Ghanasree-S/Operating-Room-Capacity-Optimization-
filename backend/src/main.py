"""
Command-line entry point.

Usage:
    py -3 src/main.py                      run the full analysis and write outputs
    py -3 src/main.py --suite 3            statistics for one OR suite
    py -3 src/main.py --service Podiatry   statistics for one specialty
    py -3 src/main.py --capacity 110       solve the LP at a different capacity
"""

import argparse
import json
from pathlib import Path

import pandas as pd

import data_prep
import statistics_module as stats_mod
from optimization import (
    DEFAULT_CAPACITY_HOURS,
    sensitivity_report,
    solve_goal_programming,
    solve_lp,
)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"
THROUGHPUT_TARGET = 200.0
GOAL_WEIGHTS = (6.0, 6.0)
SCARCE_CAPACITY = 110.0  # below total demand, so capacity actually binds


def _rule(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def run_full_analysis(capacity: float = DEFAULT_CAPACITY_HOURS) -> None:
    data = data_prep.load_all()
    cases = data["cases"]
    suite_day = data["suite_day_stats"]
    specialty = data["specialty_inputs"]
    procedure = data["procedure_inputs"]

    OUTPUT_DIR.mkdir(exist_ok=True)

    # ---------------------------------------------------------- descriptive
    _rule("1. DATASET OVERVIEW")
    ov = stats_mod.overview(cases, suite_day)
    print(f"  Surgical cases ............ {ov['total_cases']:,}")
    print(f"  OR suites ................. {ov['or_suites']}")
    print(f"  Surgical specialties ...... {ov['specialties']}")
    print(f"  Distinct procedures ....... {ov['procedures']}")
    print(f"  Operating days ............ {ov['operating_days']}")
    print(f"  Date range ................ {ov['date_range'][0]} to {ov['date_range'][1]}")
    print(f"  Average utilization ....... {ov['avg_utilization_pct']:.2f}%")
    print(f"  Total OR hours ............ {ov['total_or_hours']:,.1f}")
    print(f"  Total overtime hours ...... {ov['total_overtime_hours']:.2f}")
    print(f"  Average turnover .......... {ov['avg_turnover_min']:.1f} min")

    _rule("2. UTILIZATION BY OR SUITE")
    suite_table = stats_mod.suite_summary_table(cases, suite_day)
    print(suite_table.to_string(index=False))

    _rule("3. WORKLOAD BY SPECIALTY")
    service_table = stats_mod.service_summary_table(cases)
    print(service_table.to_string(index=False))

    # ------------------------------------------------------------------ LP
    _rule(f"4. LINEAR PROGRAMMING - by specialty ({len(specialty)} variables)")
    lp_spec = solve_lp(specialty, capacity)
    _print_lp(lp_spec)

    _rule(f"5. LINEAR PROGRAMMING - by procedure ({len(procedure)} variables)")
    lp_proc = solve_lp(procedure, capacity)
    _print_lp(lp_proc)

    _rule("6. GRANULARITY COMPARISON")
    print(f"  At the real {capacity:.0f} hr capacity:")
    print(f"    by specialty ............ {lp_spec.total_cases:.2f} cases/week")
    print(f"    by procedure ............ {lp_proc.total_cases:.2f} cases/week")
    print(f"    difference .............. {lp_proc.total_cases - lp_spec.total_cases:+.2f}")
    print()
    print("  Identical, and that is expected rather than a bug: demand")
    print(f"  (~{lp_spec.total_hours:.0f} hrs) never binds against {capacity:.0f} hrs of capacity, so")
    print("  every variable simply goes to its own upper bound. Splitting a")
    print("  specialty into procedures splits that same bound into parts that")
    print("  sum back to the same total. Granularity can only matter once the")
    print("  solver is forced to choose between variables.")
    print()
    tight_spec = solve_lp(specialty, SCARCE_CAPACITY)
    tight_proc = solve_lp(procedure, SCARCE_CAPACITY)
    print(f"  Constrained to {SCARCE_CAPACITY:.0f} hrs, where capacity does bind:")
    print(f"    by specialty ............ {tight_spec.total_cases:.2f} cases/week")
    print(f"    by procedure ............ {tight_proc.total_cases:.2f} cases/week")
    print(f"    difference .............. {tight_proc.total_cases - tight_spec.total_cases:+.2f}")
    print()
    print("  Under scarcity the procedure-level model can favour short,")
    print("  high-throughput procedures inside a specialty instead of treating")
    print("  the specialty as one averaged block. That gain is the whole")
    print("  justification for the finer granularity.")

    # ------------------------------------------------------- goal programming
    overtime_target = data_prep.weekly_historical_overtime_hours(cases) * 0.8
    _rule("7. GOAL PROGRAMMING - throughput vs overtime")
    gp = solve_goal_programming(
        specialty,
        THROUGHPUT_TARGET,
        overtime_target,
        *GOAL_WEIGHTS,
        capacity_hours=capacity,
    )
    print(f"  Status .................... {gp.status}")
    print(f"  Goal 1 target ............. {gp.throughput_target:.0f} cases/week")
    print(f"  Goal 2 target ............. {gp.overtime_target:.4f} overtime hrs/week")
    print(f"  Weights (W1, W2) .......... {gp.weights[0]:.0f}, {gp.weights[1]:.0f}")
    print()
    print(f"  Cases achieved ............ {gp.total_cases:.2f}")
    print(f"  Overtime incurred ......... {gp.total_overtime_hours:.4f} hrs/week")
    print(f"  Hours allocated ........... {gp.total_hours:.2f}")
    print()
    print(f"  d1- (cases short) ......... {gp.d1_minus:.4f}")
    print(f"  d1+ (cases over) .......... {gp.d1_plus:.4f}")
    print(f"  d2- (overtime under) ...... {gp.d2_minus:.4f}")
    print(f"  d2+ (overtime overrun) .... {gp.d2_plus:.4f}")
    print()
    if gp.d2_plus > 1e-6:
        print(f"  Reading: the throughput goal is met exactly, but doing so costs")
        print(f"  {gp.d2_plus:.4f} hrs/week of overtime above target - a genuine")
        print("  trade-off between the two goals, which is the point of using")
        print("  Goal Programming rather than a single-objective LP.")
    else:
        print("  Reading: both goals are satisfied simultaneously; they do not")
        print("  conflict at these targets.")

    # ------------------------------------------------------------- outputs
    _rule("8. WRITING OUTPUTS")
    written = _write_outputs(
        suite_table, service_table, lp_spec, lp_proc, gp, ov
    )
    for path in written:
        print(f"  {path.relative_to(OUTPUT_DIR.parent)}")


def _print_lp(result) -> None:
    print(f"  Status .................... {result.status}")
    print(f"  Objective (weekly cases) .. {result.total_cases:.2f}")
    print(f"  Hours allocated ........... {result.total_hours:.2f} / {result.capacity_hours:.0f}")
    print(f"  Capacity slack ............ {result.capacity_slack:.2f} hrs")
    print(f"  Capacity binding? ......... {'yes' if result.capacity_is_binding else 'no'}")
    if result.capacity_shadow_price is not None:
        print(f"  Capacity shadow price ..... {result.capacity_shadow_price:.4f} cases per extra hour")
    print()
    display = result.allocation[
        ["Label", "Allocated_Hours", "Cases_Performed", "Binding"]
    ].round(2)
    print(display.to_string(index=False))


def _write_outputs(suite_table, service_table, lp_spec, lp_proc, gp, ov) -> list[Path]:
    written = []

    for name, frame in [
        ("suite_summary.csv", suite_table),
        ("service_summary.csv", service_table),
        ("lp_allocation_by_specialty.csv", lp_spec.allocation.round(4)),
        ("lp_allocation_by_procedure.csv", lp_proc.allocation.round(4)),
        ("lp_sensitivity_by_specialty.csv", sensitivity_report(lp_spec).round(4)),
        ("goal_programming_allocation.csv", gp.allocation.round(4)),
    ]:
        path = OUTPUT_DIR / name
        frame.to_csv(path, index=False)
        written.append(path)

    summary = {
        "overview": ov,
        "lp_by_specialty": {
            "status": lp_spec.status,
            "total_cases": round(lp_spec.total_cases, 4),
            "total_hours": round(lp_spec.total_hours, 4),
            "capacity_hours": lp_spec.capacity_hours,
            "capacity_slack": round(lp_spec.capacity_slack, 4),
            "capacity_binding": lp_spec.capacity_is_binding,
        },
        "lp_by_procedure": {
            "status": lp_proc.status,
            "total_cases": round(lp_proc.total_cases, 4),
            "total_hours": round(lp_proc.total_hours, 4),
        },
        "goal_programming": {
            "status": gp.status,
            "throughput_target": gp.throughput_target,
            "overtime_target": round(gp.overtime_target, 6),
            "weights": {"w1": gp.weights[0], "w2": gp.weights[1]},
            "total_cases": round(gp.total_cases, 4),
            "total_overtime_hours": round(gp.total_overtime_hours, 6),
            "deviations": {
                "d1_minus": round(gp.d1_minus, 6),
                "d1_plus": round(gp.d1_plus, 6),
                "d2_minus": round(gp.d2_minus, 6),
                "d2_plus": round(gp.d2_plus, 6),
            },
        },
    }
    path = OUTPUT_DIR / "results_summary.json"
    path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    written.append(path)

    return written


def main() -> None:
    parser = argparse.ArgumentParser(
        description="OR capacity planning analysis and optimization"
    )
    parser.add_argument("--suite", type=int, help="show statistics for one OR suite")
    parser.add_argument("--service", type=str, help="show statistics for one specialty")
    parser.add_argument(
        "--capacity",
        type=float,
        default=DEFAULT_CAPACITY_HOURS,
        help=f"weekly OR capacity in hours (default {DEFAULT_CAPACITY_HOURS:.0f})",
    )
    args = parser.parse_args()

    pd.set_option("display.width", 200)

    if args.suite is not None or args.service is not None:
        data = data_prep.load_all()
        if args.suite is not None:
            _rule(f"OR SUITE {args.suite}")
            for key, value in stats_mod.by_suite(
                data["cases"], data["suite_day_stats"], args.suite
            ).items():
                print(f"  {key:.<28} {value}")
        if args.service is not None:
            info = stats_mod.by_service(data["cases"], args.service)
            _rule(f"SERVICE: {info['service']}")
            breakdown = info.pop("procedure_breakdown")
            for key, value in info.items():
                print(f"  {key:.<28} {value}")
            print("\n  Procedure breakdown:")
            print(breakdown.to_string())
        return

    run_full_analysis(args.capacity)


if __name__ == "__main__":
    main()
