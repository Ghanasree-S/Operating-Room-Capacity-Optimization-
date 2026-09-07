"""
Data loading, cleaning and derived-metric computation.

Reads the raw Kaggle CSV directly. The source file is consistently
MM/DD/YY — the mixed DD-MM-YYYY / MM/DD/YY formats that plagued the earlier
Excel version were an artefact of Excel's import, not of the data, so no
format-sniffing is needed here.

Derived metrics (identical definitions to the original Excel model):

    Actual Duration (min) = End Time - Start Time
    Overtime (min)        = max(0, Actual Duration - Booked Time)
    Turnover (min)        = next Wheels In - this Wheels Out
                            (same OR suite, same day, consecutive cases)
    Utilization %         = sum(Actual Duration) /
                            (last Wheels Out - first Wheels In)
                            per OR suite per day
"""

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_CSV = DATA_DIR / "2022_Q1_OR_Utilization.csv"

# Q1 2022 spans 13 weeks; used to convert quarterly totals to weekly rates.
WEEKS_IN_QUARTER = 13

_TIME_COLUMNS = ["OR Schedule", "Wheels In", "Start Time", "End Time", "Wheels Out"]


def load_raw(csv_path: Path = RAW_CSV) -> pd.DataFrame:
    """Load the raw surgical case records and parse all date/time columns."""
    df = pd.read_csv(csv_path)

    df["Date"] = pd.to_datetime(df["Date"], format="%m/%d/%y")
    for col in _TIME_COLUMNS:
        df[col] = pd.to_datetime(df[col], format="%m/%d/%y %I:%M %p")

    return df


def add_derived_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Add Actual_Duration_Min, Overtime_Min and Turnover_Min columns."""
    df = df.copy()

    df["Actual_Duration_Min"] = (
        df["End Time"] - df["Start Time"]
    ).dt.total_seconds() / 60

    df["Overtime_Min"] = (
        df["Actual_Duration_Min"] - df["Booked Time (min)"]
    ).clip(lower=0)

    # Turnover is the idle gap before the NEXT case in the same room on the
    # same day, so it is only defined between consecutive cases within a
    # (Date, OR Suite) group and is NaN for each group's last case.
    df = df.sort_values(["Date", "OR Suite", "Wheels In"]).reset_index(drop=True)
    group = df.groupby(["Date", "OR Suite"], sort=False)
    next_wheels_in = group["Wheels In"].shift(-1)
    df["Turnover_Min"] = (
        next_wheels_in - df["Wheels Out"]
    ).dt.total_seconds() / 60

    return df


def build_suite_day_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate to one row per (OR Suite, Date) with a utilization figure.

    Utilization measures how much of the room's actually-open window was spent
    operating, so the denominator is the observed span from the first patient
    in to the last patient out — not a fixed nominal shift length.
    """
    stats = (
        df.groupby(["Date", "OR Suite"])
        .agg(
            Total_Actual_Duration=("Actual_Duration_Min", "sum"),
            First_Wheels_In=("Wheels In", "min"),
            Last_Wheels_Out=("Wheels Out", "max"),
            Case_Count=("Encounter ID", "count"),
        )
        .reset_index()
    )

    open_minutes = (
        stats["Last_Wheels_Out"] - stats["First_Wheels_In"]
    ).dt.total_seconds() / 60

    stats["Open_Minutes"] = open_minutes
    stats["Utilization_Pct"] = (
        stats["Total_Actual_Duration"] / open_minutes * 100
    ).where(open_minutes > 0)

    return stats


def build_specialty_inputs(df: pd.DataFrame) -> pd.DataFrame:
    """Decision-variable inputs at SPECIALTY granularity (10 rows)."""
    return _build_inputs(df, group_cols=["Service"], label_col="Service")


def build_procedure_inputs(df: pd.DataFrame) -> pd.DataFrame:
    """Decision-variable inputs at (Service, CPT Code) granularity.

    This is the faculty-requested refinement: a single average duration per
    specialty hides real procedure-mix variance (ENT contains both a 28-minute
    tonsillectomy and a 52-minute septoplasty).
    """
    inputs = _build_inputs(
        df,
        group_cols=["Service", "CPT Code"],
        label_col="Procedure",
        description_col="CPT Description",
    )
    return inputs


def _build_inputs(
    df: pd.DataFrame,
    group_cols: list[str],
    label_col: str,
    description_col: str | None = None,
) -> pd.DataFrame:
    """Shared aggregation for both granularities.

    Bounds mirror the original model: each group may be allocated between 80%
    and 120% of the weekly hours it historically consumed.
    """
    agg_spec = {
        "Avg_Duration_Min": ("Actual_Duration_Min", "mean"),
        "Total_Hist_Minutes": ("Actual_Duration_Min", "sum"),
        "Case_Count": ("Encounter ID", "count"),
        "Total_Overtime_Min": ("Overtime_Min", "sum"),
        "Avg_Booked_Min": ("Booked Time (min)", "mean"),
    }
    if description_col:
        agg_spec["CPT Description"] = (description_col, "first")

    inputs = df.groupby(group_cols).agg(**agg_spec).reset_index()

    inputs["Total_Hist_Hours"] = inputs["Total_Hist_Minutes"] / 60
    inputs["Weekly_Avg_Hours"] = inputs["Total_Hist_Hours"] / WEEKS_IN_QUARTER
    inputs["Min_Hours"] = inputs["Weekly_Avg_Hours"] * 0.8
    inputs["Max_Hours"] = inputs["Weekly_Avg_Hours"] * 1.2

    # Overtime generated per hour of allocated OR time, used as the Goal
    # Programming overtime coefficient. Derived from history rather than
    # assumed, so a specialty that has never run over contributes zero.
    inputs["Overtime_Per_Hour"] = (
        inputs["Total_Overtime_Min"] / inputs["Total_Hist_Minutes"]
    ).fillna(0.0)

    if label_col == "Procedure":
        inputs["Procedure"] = (
            inputs["Service"] + " - " + inputs["CPT Description"]
        )

    inputs = inputs.rename(columns={label_col: "Label"})
    if "Label" not in inputs.columns:
        inputs["Label"] = inputs[label_col]

    return inputs.sort_values("Label").reset_index(drop=True)


def weekly_historical_overtime_hours(df: pd.DataFrame) -> float:
    """Average overtime hours per week across the whole hospital."""
    return df["Overtime_Min"].sum() / 60 / WEEKS_IN_QUARTER


def load_all() -> dict:
    """Convenience loader returning every prepared table."""
    raw = load_raw()
    cases = add_derived_metrics(raw)
    return {
        "cases": cases,
        "suite_day_stats": build_suite_day_stats(cases),
        "specialty_inputs": build_specialty_inputs(cases),
        "procedure_inputs": build_procedure_inputs(cases),
    }
