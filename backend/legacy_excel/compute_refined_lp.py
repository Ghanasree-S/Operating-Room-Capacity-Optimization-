"""
Step 3 of README.md Implementation Plan.
Computes the Service+CPT-level LP_MODEL table (avg duration, historical
hours, weekly average, 80%/120% min/max bounds) from RAW_DATA, matching
the same methodology used for the Service-level LP_MODEL sheet already in
project.xlsx. Writes results to a standalone file for review + into the
frontend's exported workbook (does NOT touch project.xlsx, which is
currently open in Excel).
"""
import pandas as pd

SRC = r"D:\SEM_7\OR_PROJECT\project.xlsx"
WEEKS_IN_Q1 = 13

raw = pd.read_excel(SRC, sheet_name="RAW_DATA", engine="openpyxl")

grouped = raw.groupby(["Service", "CPT Code", "CPT Description"]).agg(
    Avg_Duration_Min=("Actual_Duration_Min", "mean"),
    Total_Hist_Hours=("Actual_Duration_Min", lambda x: x.sum() / 60),
    Case_Count=("Actual_Duration_Min", "count"),
).reset_index()

grouped["Weekly_Avg_Hours"] = grouped["Total_Hist_Hours"] / WEEKS_IN_Q1
grouped["Min_Hours"] = 0.8 * grouped["Weekly_Avg_Hours"]
grouped["Max_Hours"] = 1.2 * grouped["Weekly_Avg_Hours"]

# Compound label frontend can use as the "service" key: "Service — CPT Description"
grouped["Procedure"] = grouped["Service"] + " — " + grouped["CPT Description"]

grouped = grouped.round(2)
grouped = grouped.sort_values(["Service", "CPT Code"]).reset_index(drop=True)

OUT_XLSX = r"D:\SEM_7\OR_PROJECT\LP_MODEL_refined_CPT.xlsx"
grouped.to_excel(OUT_XLSX, sheet_name="LP_MODEL_CPT", index=False)

print(f"Total procedure-level variables: {len(grouped)}")
print(f"Sum of Max_Hours: {grouped['Max_Hours'].sum():.2f}  (capacity = 320)")
print()
print(grouped[["Service", "CPT Code", "CPT Description", "Avg_Duration_Min",
               "Min_Hours", "Max_Hours", "Case_Count"]].to_string(index=False))
print("\nWrote:", OUT_XLSX)

# Also write into the frontend export workbook as a second, finer-grained LP sheet
FRONTEND_OUT = r"D:\SEM_7\frontend_repo\Hospital_OR_Capacity_Dataset.xlsx"
with pd.ExcelWriter(FRONTEND_OUT, engine="openpyxl", mode="a", if_sheet_exists="replace") as writer:
    lp_cpt_export = pd.DataFrame({
        "Service": grouped["Procedure"],
        "Avg_Duration_Min": grouped["Avg_Duration_Min"],
        "Min_Hours": grouped["Min_Hours"],
        "Max_Hours": grouped["Max_Hours"],
        "Baseline_Weekly_Hours": grouped["Weekly_Avg_Hours"],
    })
    lp_cpt_export.to_excel(writer, sheet_name="LP_MODEL_CPT", index=False)
print("Also appended LP_MODEL_CPT sheet to:", FRONTEND_OUT)
