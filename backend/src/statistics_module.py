"""
On-demand descriptive statistics.

Satisfies the coursework requirement that the tool can generate statistics
about the data on demand, queried either by OR suite or by surgical service.
"""

import pandas as pd


def overview(cases: pd.DataFrame, suite_day_stats: pd.DataFrame) -> dict:
    """Headline figures for the whole quarter."""
    return {
        "total_cases": int(len(cases)),
        "or_suites": int(cases["OR Suite"].nunique()),
        "specialties": int(cases["Service"].nunique()),
        "procedures": int(cases.groupby(["Service", "CPT Code"]).ngroups),
        "date_range": (
            cases["Date"].min().strftime("%Y-%m-%d"),
            cases["Date"].max().strftime("%Y-%m-%d"),
        ),
        "operating_days": int(cases["Date"].nunique()),
        "avg_utilization_pct": float(suite_day_stats["Utilization_Pct"].mean()),
        "total_or_hours": float(cases["Actual_Duration_Min"].sum() / 60),
        "total_overtime_hours": float(cases["Overtime_Min"].sum() / 60),
        "avg_turnover_min": float(cases["Turnover_Min"].mean()),
    }


def by_suite(
    cases: pd.DataFrame, suite_day_stats: pd.DataFrame, suite: int
) -> dict:
    """Statistics for a single OR suite."""
    subset = cases[cases["OR Suite"] == suite]
    if subset.empty:
        raise ValueError(f"No cases found for OR Suite {suite}")

    suite_days = suite_day_stats[suite_day_stats["OR Suite"] == suite]

    return {
        "or_suite": suite,
        "case_count": int(len(subset)),
        "active_days": int(len(suite_days)),
        "avg_utilization_pct": float(suite_days["Utilization_Pct"].mean()),
        "total_hours": float(subset["Actual_Duration_Min"].sum() / 60),
        "avg_daily_duration_min": float(
            suite_days["Total_Actual_Duration"].mean()
        ),
        "avg_case_duration_min": float(subset["Actual_Duration_Min"].mean()),
        "avg_overtime_min": float(subset["Overtime_Min"].mean()),
        "avg_turnover_min": float(subset["Turnover_Min"].mean()),
        "services_used": sorted(subset["Service"].unique().tolist()),
    }


def by_service(cases: pd.DataFrame, service: str) -> dict:
    """Statistics for a single surgical specialty."""
    subset = cases[cases["Service"].str.lower() == service.lower()]
    if subset.empty:
        available = ", ".join(sorted(cases["Service"].unique()))
        raise ValueError(f"Unknown service '{service}'. Available: {available}")

    procedures = (
        subset.groupby("CPT Description")
        .agg(
            cases=("Encounter ID", "count"),
            avg_duration_min=("Actual_Duration_Min", "mean"),
        )
        .sort_values("cases", ascending=False)
        .round(2)
    )

    return {
        "service": subset["Service"].iloc[0],
        "case_count": int(len(subset)),
        "avg_case_duration_min": float(subset["Actual_Duration_Min"].mean()),
        "avg_booked_time_min": float(subset["Booked Time (min)"].mean()),
        "avg_overtime_min": float(subset["Overtime_Min"].mean()),
        "avg_turnover_min": float(subset["Turnover_Min"].mean()),
        "total_hours": float(subset["Actual_Duration_Min"].sum() / 60),
        "suites_used": sorted(subset["OR Suite"].unique().tolist()),
        "procedure_breakdown": procedures,
    }


def suite_summary_table(
    cases: pd.DataFrame, suite_day_stats: pd.DataFrame
) -> pd.DataFrame:
    """One row per OR suite — the table behind the overview dashboard."""
    per_suite = (
        cases.groupby("OR Suite")
        .agg(
            Cases=("Encounter ID", "count"),
            Avg_Duration_Min=("Actual_Duration_Min", "mean"),
            Avg_Overtime_Min=("Overtime_Min", "mean"),
            Total_Hours=("Actual_Duration_Min", lambda s: s.sum() / 60),
        )
        .reset_index()
    )
    util = (
        suite_day_stats.groupby("OR Suite")["Utilization_Pct"]
        .mean()
        .reset_index()
        .rename(columns={"Utilization_Pct": "Avg_Utilization_Pct"})
    )
    return per_suite.merge(util, on="OR Suite").round(2)


def service_summary_table(cases: pd.DataFrame) -> pd.DataFrame:
    """One row per surgical specialty."""
    return (
        cases.groupby("Service")
        .agg(
            Cases=("Encounter ID", "count"),
            Avg_Duration_Min=("Actual_Duration_Min", "mean"),
            Avg_Booked_Min=("Booked Time (min)", "mean"),
            Avg_Overtime_Min=("Overtime_Min", "mean"),
            Total_Hours=("Actual_Duration_Min", lambda s: s.sum() / 60),
        )
        .reset_index()
        .sort_values("Total_Hours", ascending=False)
        .round(2)
    )
