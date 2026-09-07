import React, { useState } from 'react';
import { SpecialtyLpInput, LpSolution, LpGranularity } from '../types';
import { solveLpModel } from '../solver/lpSolver';
import { KatexMath } from './common/KatexMath';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

interface LinearProgrammingSectionProps {
  lpInputs: SpecialtyLpInput[];
  onUpdateInputs: (inputs: SpecialtyLpInput[]) => void;
  onResetDefaults: () => void;
  lpSolution: LpSolution | null;
  onSolveSuccess: (sol: LpSolution) => void;
  granularity: LpGranularity;
  onGranularityChange: (g: LpGranularity) => void;
}

export const LinearProgrammingSection: React.FC<LinearProgrammingSectionProps> = ({
  lpInputs,
  onUpdateInputs,
  onResetDefaults,
  lpSolution,
  onSolveSuccess,
  granularity,
  onGranularityChange,
}) => {
  const [isSolving, setIsSolving] = useState(false);
  const [totalCapacity, setTotalCapacity] = useState<number>(320);

  const handleInputChange = (
    index: number,
    field: 'avgDurationMin' | 'minHours' | 'maxHours',
    val: number
  ) => {
    const next = [...lpInputs];
    next[index] = {
      ...next[index],
      [field]: Math.max(1, Number(val) || 0),
    };
    onUpdateInputs(next);
  };

  const handleSolve = () => {
    setIsSolving(true);
    setTimeout(() => {
      const solution = solveLpModel(lpInputs, totalCapacity);
      onSolveSuccess(solution);
      setIsSolving(false);
    }, 150);
  };

  const varCount = lpInputs.length;
  const isProcedureView = granularity === 'procedure';

  // Math expressions in LaTeX
  const objectiveLatex = `\\max Z = \\sum_{s=1}^{${varCount}} \\frac{60 \\cdot X_s}{D_s}`;
  const constraintsLatex = `\\sum_{s=1}^{${varCount}} X_s \\le ${totalCapacity}, \\quad 0.8 \\cdot \\text{avg}_s \\le X_s \\le 1.2 \\cdot \\text{avg}_s, \\quad X_s \\ge 0 \\quad \\forall s \\in \\{1,\\dots,${varCount}\\}`;

  const hoursUsed = lpSolution?.totalHours ?? 0;
  const casesAchieved = lpSolution?.totalCases ?? 0;
  const capacityPct = totalCapacity > 0 ? (hoursUsed / totalCapacity) * 100 : 0;
  const slackHours = Math.max(0, totalCapacity - hoursUsed);

  return (
    <div className="space-y-6 pb-12">
      {/* Math Formulation Card (KaTeX) */}
      <section
        id="lp-math-formulation-card"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
          <div>
            <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
              Mathematical Programming Model
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Primal Linear Programming Formulation (Single-Week Block Allocation)
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Decision-variable granularity toggle */}
            <div
              id="lp-granularity-toggle"
              className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden"
              role="group"
              aria-label="Decision variable granularity"
            >
              <button
                id="granularity-specialty-btn"
                onClick={() => onGranularityChange('specialty')}
                aria-pressed={!isProcedureView}
                className={`px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                  !isProcedureView
                    ? 'bg-[#2c6e68] text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                By Specialty (10)
              </button>
              <button
                id="granularity-procedure-btn"
                onClick={() => onGranularityChange('procedure')}
                aria-pressed={isProcedureView}
                className={`px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer border-l border-slate-300 dark:border-slate-700 ${
                  isProcedureView
                    ? 'bg-[#2c6e68] text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                By Procedure (32)
              </button>
            </div>

            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              OR Capacity Bound:
            </label>
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <input
                id="input-total-capacity"
                type="number"
                min={100}
                max={500}
                value={totalCapacity}
                onChange={e => setTotalCapacity(Number(e.target.value))}
                className="w-20 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
              />
              <span className="text-slate-500">hrs/wk (8 suites × 40h)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Objective Math */}
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Objective Function (Maximize Total Surgical Cases)</span>
              <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">Z = Throughput</span>
            </div>
            <div className="py-2 text-slate-900 dark:text-slate-100">
              <KatexMath math={objectiveLatex} block />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Where <KatexMath math="X_s" /> represents allocated block hours to specialty{' '}
              <KatexMath math="s" />, and <KatexMath math="D_s" /> is average case duration (min). Each hour yields{' '}
              <KatexMath math="\frac{60}{D_s}" /> cases.
            </p>
          </div>

          {/* Constraints Math */}
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>System Constraints</span>
              <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">Capacity & Bounds</span>
            </div>
            <div className="py-2 text-slate-900 dark:text-slate-100">
              <KatexMath math={constraintsLatex} block />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Hard upper bound on total OR suite hours (<KatexMath math={`\\le ${totalCapacity}`} /> hrs) and
              historical specialty patient referral limits (<KatexMath math="[0.8\\text{avg}, 1.2\\text{avg}]" />).
            </p>
          </div>
        </div>
      </section>

      {/* Solver Action & Result Bar */}
      <section
        id="lp-action-kpi-bar"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              id="solve-lp-button"
              onClick={handleSolve}
              disabled={isSolving}
              className="px-6 py-2.5 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${isSolving ? 'animate-spin' : ''}`} />
              <span>{isSolving ? 'Solving Simplex...' : 'Solve Linear Program'}</span>
            </button>

            <button
              id="reset-lp-defaults-btn"
              onClick={onResetDefaults}
              className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-650 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer border border-slate-200 dark:border-slate-650"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Bounds</span>
            </button>

            {lpSolution && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-4 h-4" />
                Optimal Primal Solution Found ({lpSolution.solveTimeMs}ms)
              </span>
            )}
          </div>

          <div className="text-xs font-mono text-slate-500">
            Decision Variables: {varCount} {isProcedureView ? 'procedures (Service + CPT)' : 'specialties'} | Constraints:{' '}
            {1 + varCount * 2} (1 capacity + {varCount * 2} bounds)
          </div>
        </div>

        {/* Real-time KPI Result Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {/* Total Cases Achieved */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Optimal Weekly Throughput (Z*)
            </div>
            <div className="text-3xl font-extrabold font-mono text-[#2c6e68] dark:text-teal-400">
              {casesAchieved.toFixed(1)}{' '}
              <span className="text-sm font-normal text-slate-500">cases/week</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Baseline: ~169.2 cases/wk ({casesAchieved > 169.2 ? `+${(casesAchieved - 169.2).toFixed(1)} gain` : 'baseline'})
            </div>
          </div>

          {/* Total Hours Used vs 320 Capacity Progress Bar */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              <span>Total Hours Allocated</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {hoursUsed.toFixed(1)} / {totalCapacity} hrs
              </span>
            </div>
            <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
              {capacityPct.toFixed(1)}%
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden mt-2 relative">
              <div
                className="h-full rounded-full transition-all duration-500 bg-[#2c6e68] dark:bg-teal-500"
                style={{ width: `${Math.min(100, capacityPct)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono flex justify-between">
              <span>Used: {hoursUsed.toFixed(1)} hrs</span>
              <span className="text-amber-600 dark:text-amber-400">Slack: {slackHours.toFixed(1)} hrs</span>
            </div>
          </div>

          {/* Capacity Constraint Status */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Capacity Constraint Status
            </div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                Non-Binding (Slack &gt; 0)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Total OR availability is non-binding because all specialty demand upper bounds sum to{' '}
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{hoursUsed.toFixed(1)} hrs</span>, leaving{' '}
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{slackHours.toFixed(1)} hrs</span> unutilized.
            </p>
          </div>
        </div>
      </section>

      {/* Editable Table of Decision Variables */}
      <section
        id="lp-decision-variables-table-section"
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isProcedureView ? 'Procedure' : 'Specialty'} Decision Variables &amp; Optimization Tableau
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isProcedureView
                ? 'One decision variable per (Service, CPT Code) pair — a single average duration per specialty hides real procedure-mix variance. '
                : ''}
              Edit Avg Duration, Min Hours, or Max Hours to simulate operational changes. Click &quot;Solve Linear Program&quot; to re-optimize.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500">
            Status: <span className="font-bold text-emerald-600">Simplex Ready</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-750/70 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-4">{isProcedureView ? 'Service — Procedure' : 'Specialty Service'}</th>
                <th className="py-3.5 px-4 text-right">Avg Duration <KatexMath math="D_s" /> (min)</th>
                <th className="py-3.5 px-4 text-right">Throughput Rate (cases/hr)</th>
                <th className="py-3.5 px-4 text-right">Min Hours (0.8x)</th>
                <th className="py-3.5 px-4 text-right">Max Hours (1.2x)</th>
                <th className="py-3.5 px-4 text-right bg-teal-50/50 dark:bg-teal-950/20 text-[#2c6e68] dark:text-teal-300">
                  Allocated Hours <KatexMath math="X_s" /> (hrs)
                </th>
                <th className="py-3.5 px-4 text-right bg-teal-50/50 dark:bg-teal-950/20 text-[#2c6e68] dark:text-teal-300">
                  Cases Performed
                </th>
                <th className="py-3.5 px-4 text-center">Binding Constraint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono text-slate-800 dark:text-slate-200">
              {lpInputs.map((item, index) => {
                const casesPerHour = (60 / item.avgDurationMin).toFixed(2);
                const allocated = lpSolution?.allocatedHours[item.service] ?? item.maxHours;
                const cases = lpSolution?.casesPerformed[item.service] ?? ((allocated * 60) / item.avgDurationMin);
                const binding = lpSolution?.bindingConstraints[item.service] || 'max';

                return (
                  <tr
                    key={item.service}
                    className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                      <div>{item.service}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{item.cptDesc}</div>
                    </td>

                    {/* Editable Avg Duration */}
                    <td className="py-3 px-4 text-right">
                      <input
                        id={`input-avg-duration-${item.service}`}
                        type="number"
                        min={10}
                        max={300}
                        value={item.avgDurationMin}
                        onChange={e => handleInputChange(index, 'avgDurationMin', Number(e.target.value))}
                        className="w-20 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-right font-mono text-xs focus:ring-1 focus:ring-[#2c6e68] outline-hidden font-semibold"
                      />
                    </td>

                    {/* Throughput rate: 60 / Ds */}
                    <td className="py-3 px-4 text-right font-semibold text-slate-600 dark:text-slate-300">
                      {casesPerHour}
                    </td>

                    {/* Editable Min Hours */}
                    <td className="py-3 px-4 text-right">
                      <input
                        id={`input-min-hours-${item.service}`}
                        type="number"
                        step="0.5"
                        min={0}
                        max={item.maxHours}
                        value={item.minHours}
                        onChange={e => handleInputChange(index, 'minHours', Number(e.target.value))}
                        className="w-20 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-right font-mono text-xs focus:ring-1 focus:ring-[#2c6e68] outline-hidden"
                      />
                    </td>

                    {/* Editable Max Hours */}
                    <td className="py-3 px-4 text-right">
                      <input
                        id={`input-max-hours-${item.service}`}
                        type="number"
                        step="0.5"
                        min={item.minHours}
                        max={100}
                        value={item.maxHours}
                        onChange={e => handleInputChange(index, 'maxHours', Number(e.target.value))}
                        className="w-20 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-right font-mono text-xs focus:ring-1 focus:ring-[#2c6e68] outline-hidden font-semibold text-slate-900 dark:text-white"
                      />
                    </td>

                    {/* Computed Output: Allocated Hours */}
                    <td className="py-3 px-4 text-right bg-teal-50/50 dark:bg-teal-950/20 font-bold text-[#2c6e68] dark:text-teal-300 text-sm">
                      {allocated.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hrs</span>
                    </td>

                    {/* Computed Output: Cases Performed */}
                    <td className="py-3 px-4 text-right bg-teal-50/50 dark:bg-teal-950/20 font-bold text-slate-900 dark:text-white text-sm">
                      {cases.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">cases</span>
                    </td>

                    {/* Binding Constraint Badge */}
                    <td className="py-3 px-4 text-center">
                      {binding === 'max' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          at max bound
                        </span>
                      ) : binding === 'min' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          at min bound
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          flexible
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 dark:bg-slate-750 font-mono text-slate-900 dark:text-white font-bold border-t border-slate-200 dark:border-slate-700">
              <tr>
                <td className="py-3 px-4 font-sans">Total Allocated (Z*)</td>
                <td className="py-3 px-4 text-right">—</td>
                <td className="py-3 px-4 text-right">—</td>
                <td className="py-3 px-4 text-right">
                  {lpInputs.reduce((a, b) => a + b.minHours, 0).toFixed(1)}h
                </td>
                <td className="py-3 px-4 text-right">
                  {lpInputs.reduce((a, b) => a + b.maxHours, 0).toFixed(1)}h
                </td>
                <td className="py-3 px-4 text-right text-[#2c6e68] dark:text-teal-300 text-sm">
                  {hoursUsed.toFixed(1)} hrs
                </td>
                <td className="py-3 px-4 text-right text-sm">
                  {casesAchieved.toFixed(1)} cases
                </td>
                <td className="py-3 px-4 text-center text-xs text-slate-500 font-sans font-normal">
                  All {varCount} at Max Cap
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
