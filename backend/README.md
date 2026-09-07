# Multi-Objective Operating Room Capacity Planning and Utilization Optimization Using Surgical Workflow Analytics

Operations Research course project — data-driven OR block-time allocation
using Linear Programming and Goal Programming.

**Python version.** All analysis and optimization runs in Python (pandas +
PuLP). Excel is no longer part of the pipeline; the workbook is kept only as
a reference artefact.

---

## Quick start

```bash
py -3 -m pip install -r requirements.txt

py -3 src/main.py                      # full analysis, writes to outputs/
py -3 src/verify.py                    # 22-check validation suite
py -3 src/export_frontend.py           # regenerate the dashboard's data file

py -3 src/main.py --suite 3            # statistics for one OR suite
py -3 src/main.py --service Podiatry   # statistics for one specialty
py -3 src/main.py --capacity 110       # solve at a different capacity
```

---

## Layout

```
OR_Python_Project/
├── requirements.txt
├── data/
│   ├── 2022_Q1_OR_Utilization.csv    raw Kaggle source (the real input)
│   └── project.xlsx                  legacy Excel workbook, reference only
├── src/
│   ├── data_prep.py                  loading, cleaning, derived metrics
│   ├── statistics_module.py          on-demand statistics
│   ├── optimization.py               LP and Goal Programming (PuLP/CBC)
│   ├── export_frontend.py            writes the dashboard's data file
│   ├── verify.py                     validation suite
│   └── main.py                       CLI entry point
├── outputs/                          generated results (CSV + JSON)
└── frontend/                         TypeScript dashboard (unchanged)
```

---

## Problem

A hospital runs **8 operating rooms** shared by **10 surgical specialties**.
Each week, administration must decide how many OR-hours each specialty gets.
Too few wastes scarce capacity; too many starves other specialties and drives
overtime. The goal is the weekly allocation that maximises surgical
throughput within capacity and historical demand, while keeping overtime
controlled.

## Data

**Source:** Kaggle — [Optimizing Operating Room Utilization](https://www.kaggle.com/datasets/thedevastator/optimizing-operating-room-utilization)
**Scope:** 2,172 surgical cases, Q1 2022, 8 OR suites, 10 specialties, 32
distinct procedures, 62 operating days.

13 columns: `index`, `Encounter ID`, `Date`, `OR Suite`, `Service`,
`CPT Code`, `CPT Description`, `Booked Time (min)`, `OR Schedule`,
`Wheels In`, `Start Time`, `End Time`, `Wheels Out`.

> The raw CSV is consistently `MM/DD/YY`. The mixed `DD-MM-YYYY` /
> `MM/DD/YY` formats that complicated the earlier Excel version were an
> artefact of Excel's CSV import, not of the data — reading the file directly
> in pandas removes that whole class of problem.

## Derived metrics

```
Actual Duration (min) = End Time - Start Time
Overtime (min)        = max(0, Actual Duration - Booked Time)
Turnover (min)        = next Wheels In - this Wheels Out
                        (same OR suite, same day, consecutive cases)
Utilization %         = sum(Actual Duration) /
                        (last Wheels Out - first Wheels In)   per suite per day
```

Utilization uses the room's observed open window as the denominator, not a
nominal shift length, so it measures how much of the time a room was actually
staffed and open it spent operating.

**Headline figures:** average utilization **44.36%** across 496 room-days;
1,646 total OR hours; 0.90 total overtime hours; average turnover 29.9 min.

---

## Model 1 — Linear Programming

```
maximise    Z = Σ (60 · Xₛ / Dₛ)
subject to  Σ Xₛ ≤ 320                              total weekly OR capacity
            0.8 · avgₛ ≤ Xₛ ≤ 1.2 · avgₛ            historical demand bounds
            Xₛ ≥ 0
```

`Xₛ` = weekly OR-hours for group *s*; `Dₛ` = its average actual case
duration. Solved with PuLP/CBC.

**Result: 200.49 cases/week**, using 151.96 of 320 hours.

This reproduces the original Excel Solver result **exactly** (200.49), which
is the cross-check that the migration is faithful.

### Key finding

Capacity is **not binding** — 168 hours of slack. Every specialty sits at its
own upper bound instead. The constraint limiting the hospital is how each
specialty's demand ceiling is set, not the number of operating rooms. The
practical recommendation is therefore to revisit block-allocation policy, not
to build more OR capacity.

---

## Model 2 — Granularity refinement

Faculty feedback: one average duration per specialty is too coarse, since ENT
contains both a 28-minute tonsillectomy and a 52-minute septoplasty. The
model therefore also runs at **(Service, CPT Code)** level — 32 decision
variables instead of 10.

| Capacity | By specialty (10 vars) | By procedure (32 vars) | Difference |
|---|---|---|---|
| 320 hrs (actual) | 200.49 | 200.49 | +0.00 |
| 110 hrs (constrained) | 155.12 | **156.68** | **+1.57** |

At the real capacity both give the same answer, and that is expected rather
than a bug: demand never binds, so every variable goes to its own upper bound,
and splitting a specialty into procedures splits that same bound into parts
summing back to the same total. Granularity can only change the answer once
the solver is forced to *choose* between variables.

Constrain capacity below total demand and the refinement pays off: the
procedure-level model can favour short, high-throughput procedures *within* a
specialty rather than treating the specialty as one averaged block. That
+1.57 cases/week is the concrete justification for the finer granularity.

---

## Model 3 — Goal Programming

Single-objective LP maximises throughput while ignoring overtime entirely.
Goal Programming balances both via deviation variables.

```
Goal 1  Σ (60 · Xₛ / Dₛ) + d₁⁻ − d₁⁺ = 200        throughput target
Goal 2  Σ (βₛ · Xₛ)      + d₂⁻ − d₂⁺ = 0.0554     overtime target, hrs/week

minimise  W₁·d₁⁻ + W₂·d₂⁺
```

Only the unwanted direction of each goal is penalised — falling short on
cases, and overrunning on overtime. Beating either goal is free. `βₛ` is each
specialty's historical overtime generated per allocated hour, derived from
the data rather than assumed. The overtime target is 80% of the hospital's
historical weekly overtime, mirroring the 80/120% logic used for the demand
bounds.

**Result** (W₁ = W₂ = 6): throughput target met exactly at **200.00
cases/week**, at a cost of **0.0813** overtime hours against a target of
0.0554 — so `d₂⁺ = 0.0259` and all other deviations are zero.

That is a genuine trade-off: the throughput goal can only be met by
overrunning the overtime goal slightly. This is exactly what Goal Programming
is for, and it is visible here in a way a single-objective LP cannot express.

> Note for the presentation: overtime in this dataset is very small in
> absolute terms (0.90 hours across the entire quarter). The trade-off above
> is real but modest — worth presenting honestly as the finding it is,
> rather than inflating the target to manufacture drama. The more striking
> result is the capacity finding above.

---

## Validation

`py -3 src/verify.py` runs 22 checks: data integrity, both LP granularities,
the scarcity comparison, and Goal Programming (including that each goal
equation balances and that no goal is simultaneously under- and
over-achieved). It also asserts the LP result against the **200.49** figure
independently produced by Excel Solver.

All checks currently pass.

---

## Frontend

`frontend/` holds the TypeScript dashboard unchanged. It reads a workbook
with `RAW_DATA` / `STATS` / `LP_MODEL` sheets, which `src/export_frontend.py`
now generates from the Python pipeline — so Python feeds the dashboard, with
no frontend changes required.

```bash
py -3 src/export_frontend.py     # writes frontend/Hospital_OR_Capacity_Dataset.xlsx
cd frontend && npm install && npm run dev
```

Then use **Import Excel** in the dashboard sidebar to load it.

The dashboard also solves both models independently in the browser with
`javascript-lp-solver`. It reaches 200.50 where PuLP reaches 200.49 — a
rounding-level difference, and a useful third-party check on the formulation.

---

## Tools

| Tool | Role |
|---|---|
| pandas | data loading, cleaning, aggregation |
| PuLP + CBC | LP and Goal Programming solver |
| openpyxl | writing the dashboard's data file |
| React + TypeScript, Vite | interactive dashboard |
| javascript-lp-solver | independent in-browser solve |
