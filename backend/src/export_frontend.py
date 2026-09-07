"""
Export the prepared data in the schema the TypeScript dashboard imports.

The frontend reads a workbook with three sheets (RAW_DATA, STATS, LP_MODEL)
whose column headers it matches on exactly — see parseExcelWorkbook() in
frontend/src/data/dataset.ts. This module writes that workbook from the
Python pipeline, so the dashboard is fed by Python rather than by a
hand-maintained Excel file, with no changes needed on the frontend side.

Usage:
    py -3 src/export_frontend.py
"""

from pathlib import Path

import pandas as pd

import data_prep

# src/ -> backend/ -> repo root, where frontend/ is a sibling of backend/
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
OUTPUT_XLSX = FRONTEND_DIR / "Hospital_OR_Capacity_Dataset.xlsx"


def build_raw_data_sheet(cases: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Case ID": cases["Encounter ID"].astype(str),
            "Date": cases["Date"].dt.strftime("%Y-%m-%d"),
            "OR Suite": cases["OR Suite"],
            "Service": cases["Service"],
            "CPT Code": cases["CPT Code"].astype(str),
            "CPT Description": cases["CPT Description"],
            "Booked Time (min)": cases["Booked Time (min)"],
            "Actual Duration (min)": cases["Actual_Duration_Min"].round(2),
            "Overtime (min)": cases["Overtime_Min"].round(2),
            "Turnover (min)": cases["Turnover_Min"].round(2).fillna(0),
        }
    )


def build_stats_sheet(suite_day: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Date": suite_day["Date"].dt.strftime("%Y-%m-%d"),
            "OR Suite": suite_day["OR Suite"],
            "Total_Actual_Duration": suite_day["Total_Actual_Duration"].round(2),
            "First_Wheels_In": suite_day["First_Wheels_In"].dt.strftime("%H:%M"),
            "Last_Wheels_Out": suite_day["Last_Wheels_Out"].dt.strftime("%H:%M"),
            "Utilization_Pct": suite_day["Utilization_Pct"].round(2),
        }
    )


def build_lp_model_sheet(inputs: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Service": inputs["Label"],
            "Avg_Duration_Min": inputs["Avg_Duration_Min"].round(2),
            "Min_Hours": inputs["Min_Hours"].round(2),
            "Max_Hours": inputs["Max_Hours"].round(2),
            "Baseline_Weekly_Hours": inputs["Weekly_Avg_Hours"].round(2),
        }
    )


def export(path: Path = OUTPUT_XLSX, granularity: str = "specialty") -> Path:
    data = data_prep.load_all()
    inputs = (
        data["procedure_inputs"]
        if granularity == "procedure"
        else data["specialty_inputs"]
    )

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        build_raw_data_sheet(data["cases"]).to_excel(
            writer, sheet_name="RAW_DATA", index=False
        )
        build_stats_sheet(data["suite_day_stats"]).to_excel(
            writer, sheet_name="STATS", index=False
        )
        build_lp_model_sheet(inputs).to_excel(
            writer, sheet_name="LP_MODEL", index=False
        )

    return path


if __name__ == "__main__":
    written = export()
    print(f"Wrote {written}")
    print("Load it from the dashboard sidebar via 'Import Excel'.")
