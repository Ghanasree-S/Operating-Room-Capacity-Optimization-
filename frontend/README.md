# OR Capacity Planning & Optimization

A hospital Operating Room (OR) capacity planning dashboard — statistical
analytics plus Linear Programming and Goal Programming optimization,
built as the interactive front-end for the *Multi-Objective Operating Room
Capacity Planning and Utilization Optimization Using Surgical Workflow
Analytics* Operations Research project.

Excel is the data backend and source of truth (a `RAW_DATA` / `STATS` /
`LP_MODEL` workbook exported from the project's Excel analysis); this app
reads that workbook directly and re-runs the optimization models in the
browser — no server-side database, no Python, no Excel Solver dependency
at runtime.

---

## What it does

- **Overview Dashboard** — headline stats (total cases, OR suites,
  specialties, average utilization), utilization-by-suite chart, and a
  sortable utilization-by-specialty table.
- **Statistics Explorer** — on-demand statistics by OR Suite or by
  Service: case count, average actual duration, average overtime,
  average booked time, utilization %, active days.
- **Linear Programming Model** — the classic single-objective model:
  maximize weekly surgical throughput subject to total OR capacity and
  per-specialty historical demand bounds. Decision-variable bounds
  (Min/Max Hours) are editable; **Solve** re-runs the optimizer and shows
  allocated hours, cases performed, capacity used, and which bounds are
  binding. A **By Specialty (10) / By Procedure (32)** toggle switches the
  decision-variable granularity between one variable per surgical service
  and one per (Service, CPT Code) pair.
- **Goal Programming Model** — the multi-objective extension: balances a
  throughput target against an overtime target using deviation
  variables, with adjustable priority weights for each goal.
- **Insights** — before/after comparison across current practice,
  LP-optimized, and Goal-Programming-balanced allocations.
- **Excel import/export** — export the current dataset and model inputs
  as an Excel workbook (`RAW_DATA`, `STATS`, `LP_MODEL` sheets), or
  import one back in to load real data from the Excel side of the
  project.

## The optimization models

**Linear Programming**

```
Maximize   Z = Σ (60 × Xₛ ÷ Dₛ)
Subject to Σ Xₛ ≤ 320                       (total weekly OR capacity)
           Min_Hoursₛ ≤ Xₛ ≤ Max_Hoursₛ      (per-specialty demand bounds)
           Xₛ ≥ 0
```

**Goal Programming**

```
Goal 1 (Throughput):  Σ (60 × Xₛ ÷ Dₛ) + d1⁻ − d1⁺ = Throughput Target
Goal 2 (Overtime):    Σ Overtimeₛ      + d2⁻ − d2⁺ = Overtime Target
Minimize   Z = W1 · d1⁻ + W2 · d2⁺
Subject to Σ Xₛ ≤ 320, Min_Hoursₛ ≤ Xₛ ≤ Max_Hoursₛ, all deviation vars ≥ 0
```

Where `Xₛ` is weekly OR-hours allocated to specialty *s* and `Dₛ` is that
specialty's average actual case duration. Both models are solved with
[`javascript-lp-solver`](https://www.npmjs.com/package/javascript-lp-solver)
directly in the browser.

### Verifying the models

```bash
node verify_parity.cjs     # LP result vs the Excel Solver baseline
npx tsx verify_models.ts   # 16 assertions across both granularities + GP
```

`verify_models.ts` exercises the real production solver against the real
decision-variable sets and checks optimality, constraint satisfaction, the
Excel baseline (200.50 vs 200.49), the goal-equation balance, and
complementarity of the deviation variables.

## Tech stack

| Layer | Tool |
|---|---|
| Framework | React 19 + TypeScript, Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Math rendering | KaTeX |
| Optimization solver | javascript-lp-solver |
| Excel read/write | SheetJS (`xlsx`) |
| Icons / motion | lucide-react, motion |

## Project structure

```
src/
├── App.tsx                          # Top-level state, tab routing, solve orchestration
├── types.ts                         # Shared data model (SurgicalCase, LpSolution, ...)
├── data/dataset.ts                  # Baseline dataset generation + Excel import/export
├── solver/lpSolver.ts               # solveLpModel() and solveGoalProgramming()
└── components/
    ├── Sidebar.tsx                  # Navigation, theme toggle, Excel import/export
    ├── Header.tsx                   # Top bar, reset/export actions
    ├── OverviewDashboard.tsx        # Landing page stats + charts
    ├── StatisticsExplorer.tsx       # On-demand stats by Suite / by Service
    ├── LinearProgrammingSection.tsx # LP model inputs, solve, results
    ├── GoalProgrammingSection.tsx   # Goal Programming inputs, solve, results
    ├── InsightsSection.tsx          # Comparison summary
    └── common/KatexMath.tsx         # Renders objective/constraint math
```

## Getting started

```bash
npm install
npm run dev      # starts Vite dev server on http://localhost:3000
```

```bash
npm run build     # production build
npm run preview   # preview the production build
npm run lint       # type-check (tsc --noEmit)
```

### Environment variables

Copy `.env.example` to `.env` if running outside AI Studio:

```
GEMINI_API_KEY="..."   # only needed if/when Gemini-powered features are added
APP_URL="..."
```

Neither variable is required for the core dashboard, statistics, LP, or
Goal Programming functionality — those run entirely client-side.

## Loading real project data

By default the app seeds itself with a generated Q1 baseline dataset
(2,172 cases, 8 OR suites, 10 specialties) matching the structure of the
project's real Kaggle-sourced dataset. To use the actual analyzed data:

1. In the Excel workbook, export/save the `RAW_DATA`, `STATS`, and
   `LP_MODEL` sheets as a single `.xlsx` file.
2. In the dashboard sidebar, use **Import Excel** and select that file.
3. The app re-parses the workbook and re-solves both models against the
   real data — you should see the LP result converge toward the
   **200.49 cases/week** optimum found in Excel Solver.

Use **Export Excel** to go the other direction — save the current
in-app dataset and model bounds back out as a workbook.

## Related

This app is the front-end counterpart to the Excel-based analysis
(`README.md` in the main project repo covers the dataset, data cleaning
formulas, derived metrics, and the full LP/Goal Programming
formulations in detail).
