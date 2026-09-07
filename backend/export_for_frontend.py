"""
Step 1 of README.md Implementation Plan.
Reads D:\\SEM_7\\OR_PROJECT\\project.xlsx (READ-ONLY) and writes a new
workbook, Hospital_OR_Capacity_Dataset.xlsx, whose sheets/columns exactly
match what frontend_repo/src/data/dataset.ts -> parseExcelWorkbook() expects.
Never modifies project.xlsx.
"""
import pandas as pd
import numpy as np

SRC = r"D:\SEM_7\OR_PROJECT\project.xlsx"
OUT = r"D:\SEM_7\frontend_repo\Hospital_OR_Capacity_Dataset.xlsx"

# ---------- RAW_DATA ----------
raw = pd.read_excel(SRC, sheet_name="RAW_DATA", engine="openpyxl")

raw_out = pd.DataFrame({
    "Case ID": ["CAS-" + str(eid) for eid in raw["Encounter ID"]],
    "Date": pd.to_datetime(raw["CLEAN_DATE"]).dt.strftime("%Y-%m-%d"),
    "OR Suite": raw["OR suite"].astype(int),
    "Service": raw["Service"],
    "CPT Code": raw["CPT Code"].astype(str),
    "CPT Description": raw["CPT Description"],
    "Booked Time (min)": raw["Booked time (min)"].astype(int),
    "Actual Duration (min)": raw["Actual_Duration_Min"].round().astype(int),
    "Overtime (min)": raw["Overtime_Min"].round().astype(int),
    "Turnover (min)": raw["Turnover_Min"].fillna(0).round().astype(int),
})

# ---------- STATS ----------
stats = pd.read_excel(SRC, sheet_name="STATS", engine="openpyxl")
stats = stats.dropna(subset=["OR suite", "DATE"])

stats_out = pd.DataFrame({
    "Date": pd.to_datetime(stats["DATE"]).dt.strftime("%Y-%m-%d"),
    "OR Suite": stats["OR suite"].astype(int),
    "Total_Actual_Duration": stats["Total_Actual_Duration"].round().astype(int),
    "First_Wheels_In": pd.to_datetime(stats["First_Wheels_In"]).dt.strftime("%H:%M"),
    "Last_Wheels_Out": pd.to_datetime(stats["Last_Wheels_Out"]).dt.strftime("%H:%M"),
    # frontend expects 0-100 scale; project.xlsx stores 0-1 fraction
    "Utilization_Pct": (stats["Utilization_Pct"] * 100).round(1),
})

# ---------- LP_MODEL ----------
# Header is on row 1 (0-indexed), real data starts row 2 (0-indexed) i.e. excel row 3
lp_raw = pd.read_excel(SRC, sheet_name="LP_MODEL", engine="openpyxl", header=0)
lp_raw = lp_raw.dropna(subset=["SERVICES", "Avg_Duration_Min"])  # keep only the 10 service rows

lp_out = pd.DataFrame({
    "Service": lp_raw["SERVICES"],
    "Avg_Duration_Min": lp_raw["Avg_Duration_Min"].round(2),
    "Min_Hours": lp_raw["Min_Hours"].round(2),
    "Max_Hours": lp_raw["Max_Hours"].round(2),
    "Baseline_Weekly_Hours": lp_raw["Weekly_Avg_Hours"].round(2),
})

# ---------- Write output workbook ----------
with pd.ExcelWriter(OUT, engine="openpyxl") as writer:
    raw_out.to_excel(writer, sheet_name="RAW_DATA", index=False)
    stats_out.to_excel(writer, sheet_name="STATS", index=False)
    lp_out.to_excel(writer, sheet_name="LP_MODEL", index=False)

print("RAW_DATA rows:", len(raw_out))
print("STATS rows:", len(stats_out))
print("LP_MODEL rows:", len(lp_out))
print(lp_out.to_string(index=False))
print("\nWrote:", OUT)
