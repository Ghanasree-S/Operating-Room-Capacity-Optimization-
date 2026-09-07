import pandas as pd

raw = pd.read_excel(r"D:\SEM_7\OR_PROJECT\project.xlsx", sheet_name="RAW_DATA", engine="openpyxl")
lp = pd.read_excel(r"D:\SEM_7\OR_PROJECT\project.xlsx", sheet_name="LP_MODEL", engine="openpyxl")
lp = lp.dropna(subset=["SERVICES", "Avg_Duration_Min"])

g = raw.groupby("Service")
lines = []
for _, row in lp.iterrows():
    svc = row["SERVICES"]
    sub = g.get_group(svc)
    top_cpt = sub["CPT Code"].mode().iloc[0]
    top_desc = sub[sub["CPT Code"] == top_cpt]["CPT Description"].iloc[0]
    avg_booked = sub["Booked time (min)"].mean()
    avg_ot = sub["Overtime_Min"].mean()
    ot_rate = avg_ot / avg_booked if avg_booked else 0
    line = (
        "  { service: '" + str(svc) + "', avgDurationMin: " + f"{row['Avg_Duration_Min']:.2f}"
        + ", baselineWeeklyHours: " + f"{row['Weekly_Avg_Hours']:.2f}"
        + ", minHours: " + f"{row['Min_Hours']:.2f}"
        + ", maxHours: " + f"{row['Max_Hours']:.2f}"
        + ", overtimeRate: " + f"{ot_rate:.4f}"
        + ", cptSample: '" + str(top_cpt) + "'"
        + ", cptDesc: '" + str(top_desc).replace("'", "") + "' },"
    )
    lines.append(line)

with open(r"D:\SEM_7\OR_PROJECT\real_configs_snippet.txt", "w") as f:
    f.write("\n".join(lines))

print("\n".join(lines))
