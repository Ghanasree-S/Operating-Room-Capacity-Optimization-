import React, { useState, useEffect } from 'react';
import { SpecialtyLpInput, LpSolution, GoalProgrammingSolution } from '../types';
import { solveGoalProgramming } from '../solver/lpSolver';
import { REAL_TARGET_OVERTIME_HOURS } from '../data/dataset';
import { KatexMath } from './common/KatexMath';
import {
  Target,
  Sliders,
  Play,
  ArrowRight,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  Scale,
  Minus,
  Plus,
} from 'lucide-react';

interface GoalProgrammingSectionProps {
  lpInputs: SpecialtyLpInput[];
  lpSolution: LpSolution | null;
  gpSolution: GoalProgrammingSolution | null;
  onSolveSuccess: (sol: GoalProgrammingSolution) => void;
}

export const GoalProgrammingSection: React.FC<GoalProgrammingSectionProps> = ({
  lpInputs,
  lpSolution,
  gpSolution,
  onSolveSuccess,
}) => {
  const [throughputTarget, setThroughputTarget] = useState<number>(200);
  // Defaults to the real historical target computed in README.md §9 Step 4
  // (80% of actual Q1 average weekly overtime, ~3-4 min/week) — this hospital's
  // real overtime is already negligible, still editable above for scenario testing.
  const [overtimeTarget, setOvertimeTarget] = useState<number>(REAL_TARGET_OVERTIME_HOURS);
  const [w1Weight, setW1Weight] = useState<number>(6); // Throughput priority
  const [w2Weight, setW2Weight] = useState<number>(6); // Overtime avoidance priority
  const [isSolving, setIsSolving] = useState<boolean>(false);

  // Auto-solve or solve on initial mount if not present
  useEffect(() => {
    if (!gpSolution) {
      const initial = solveGoalProgramming(
        lpInputs,
        throughputTarget,
        overtimeTarget,
        w1Weight,
        w2Weight
      );
      onSolveSuccess(initial);
    }
  }, [lpInputs, gpSolution, throughputTarget, overtimeTarget, w1Weight, w2Weight, onSolveSuccess]);

  const handleSolve = () => {
    setIsSolving(true);
    setTimeout(() => {
      const sol = solveGoalProgramming(
        lpInputs,
        throughputTarget,
        overtimeTarget,
        w1Weight,
        w2Weight
      );
      onSolveSuccess(sol);
      setIsSolving(false);
    }, 150);
  };

  const setPreset = (w1: number, w2: number) => {
    setW1Weight(w1);
    setW2Weight(w2);
  };

  // Pure LP baseline comparison figures
  const lpCases = lpSolution?.totalCases ?? 203.0;
  const lpHours = lpSolution?.totalHours ?? 183.1;
  // Calculate baseline overtime under pure LP
  const lpOvertime = lpInputs.reduce((acc, item) => {
    const hours = lpSolution?.allocatedHours[item.service] ?? item.maxHours;
    return acc + hours * item.overtimeRate;
  }, 0);

  const currentGp = gpSolution ?? solveGoalProgramming(
    lpInputs,
    throughputTarget,
    overtimeTarget,
    w1Weight,
    w2Weight
  );

  const deltaCases = currentGp.totalCases - lpCases;
  const deltaOvertime = currentGp.totalOvertimeHours - lpOvertime;

  // Math equations
  const gpMathObjective = `\\min P = W_1 \\left(\\frac{d_1^-}{T_1}\\right) + W_2 \\left(\\frac{d_2^+}{T_2}\\right)`;
  const gpMathGoals = `\\begin{aligned}
  \\text{Goal 1 (Throughput):} & \\quad \\sum_{s=1}^{10} \\frac{60 \\cdot X_s}{D_s} + d_1^- - d_1^+ = ${throughputTarget} \\\\[4pt]
  \\text{Goal 2 (Overtime):}   & \\quad \\sum_{s=1}^{10} \\beta_s \\cdot X_s + d_2^- - d_2^+ = ${overtimeTarget}
  \\end{aligned}`;

  return (
    <div className="space-y-6 pb-12">
      {/* Mathematical Formulation Header */}
      <section
        id="gp-math-card"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
          <div>
            <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
              Multi-Criteria Operations Research Model
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Goal Programming Formulation: Throughput vs Overtime Trade-Off
            </h3>
          </div>
          <div className="text-xs font-mono px-3 py-1 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
            Penalizes Under-Throughput (<KatexMath math="d_1^-" />) &amp; Over-Overtime (<KatexMath math="d_2^+" />)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Achievement Function (Weighted Penalty)
            </div>
            <div className="py-2 text-slate-900 dark:text-slate-100">
              <KatexMath math={gpMathObjective} block />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              <KatexMath math="d_1^-" /> is under-achievement of target throughput (cases lost).{' '}
              <KatexMath math="d_2^+" /> is over-run beyond the overtime threshold (excess staffing cost).
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Goal Constraints &amp; Targets
            </div>
            <div className="py-2 text-slate-900 dark:text-slate-100 text-xs">
              <KatexMath math={gpMathGoals} block />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Where <KatexMath math="\beta_s" /> is the empirical overtime propensity coefficient for specialty{' '}
              <KatexMath math="s" /> derived from 2,172 historical cases.
            </p>
          </div>
        </div>
      </section>

      {/* Goal Cards & Weight Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goal Card 1: Throughput Target */}
        <section
          id="goal-card-throughput"
          className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-[#2c6e68] dark:text-teal-400 flex items-center justify-center font-bold">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Goal 1: Weekly Throughput Target (<KatexMath math="T_1" />)
                </h4>
                <div className="text-xs text-slate-500">Target surgical volume per week</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-mono">Default: 200 cases</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="input-throughput-target" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Target Cases / Week:
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="input-throughput-target"
                  type="number"
                  min={120}
                  max={250}
                  value={throughputTarget}
                  onChange={e => setThroughputTarget(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-bold text-sm text-right focus:ring-2 focus:ring-[#2c6e68] outline-hidden"
                />
                <span className="text-xs text-slate-500 font-mono">cases</span>
              </div>
            </div>

            {/* Slider for W1 */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Throughput Priority Weight (<KatexMath math="W_1" />):
                </span>
                <span className="font-mono font-bold text-[#2c6e68] dark:text-teal-400 text-sm">
                  {w1Weight} / 10
                </span>
              </div>
              <input
                id="slider-w1-weight"
                type="range"
                min={0}
                max={10}
                step={1}
                value={w1Weight}
                onChange={e => setW1Weight(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#2c6e68]"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>0 (Indifferent)</span>
                <span>5 (Balanced)</span>
                <span>10 (Absolute Priority)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Goal Card 2: Overtime Target */}
        <section
          id="goal-card-overtime"
          className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Goal 2: Overtime Cap Target (<KatexMath math="T_2" />)
                </h4>
                <div className="text-xs text-slate-500">Maximum allowable overtime per week</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-mono">Editable threshold</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="input-overtime-target" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Target Max Overtime / Week:
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="input-overtime-target"
                  type="number"
                  step="0.5"
                  min={0}
                  max={30}
                  value={overtimeTarget}
                  onChange={e => setOvertimeTarget(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono font-bold text-sm text-right focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
                <span className="text-xs text-slate-500 font-mono">hours</span>
              </div>
            </div>

            {/* Slider for W2 */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Overtime Avoidance Priority (<KatexMath math="W_2" />):
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                  {w2Weight} / 10
                </span>
              </div>
              <input
                id="slider-w2-weight"
                type="range"
                min={0}
                max={10}
                step={1}
                value={w2Weight}
                onChange={e => setW2Weight(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>0 (Tolerant)</span>
                <span>5 (Balanced)</span>
                <span>10 (Strict Minimization)</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Preset Buttons & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">Policy Presets:</span>
          <button
            id="preset-balanced-btn"
            onClick={() => setPreset(5, 5)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              w1Weight === 5 && w2Weight === 5
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200'
            }`}
          >
            Balanced (W1=5, W2=5)
          </button>
          <button
            id="preset-throughput-btn"
            onClick={() => setPreset(10, 2)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              w1Weight === 10 && w2Weight === 2
                ? 'bg-[#2c6e68] text-white border-[#2c6e68]'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200'
            }`}
          >
            Max Throughput (W1=10, W2=2)
          </button>
          <button
            id="preset-overtime-btn"
            onClick={() => setPreset(2, 10)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              w1Weight === 2 && w2Weight === 10
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200'
            }`}
          >
            Strict Overtime Cap (W1=2, W2=10)
          </button>
        </div>

        <button
          id="solve-goal-programming-btn"
          onClick={handleSolve}
          disabled={isSolving}
          className="px-6 py-2.5 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <Play className={`w-4 h-4 ${isSolving ? 'animate-spin' : ''}`} />
          <span>{isSolving ? 'Solving Formulation...' : 'Solve Goal Programming'}</span>
        </button>
      </div>

      {/* Goal Programming Results & Deviations */}
      <section
        id="gp-results-card"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Optimal Multi-Criteria Allocation &amp; Deviations (<KatexMath math="d_1^-, d_2^+" />)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Quantifies whether targets were satisfied or traded off under the current priority weights
            </p>
          </div>
          <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Pareto-Efficient Multi-Goal Solution ({currentGp.solveTimeMs}ms)
          </div>
        </div>

        {/* 4 Deviation & Achievement Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Achieved Cases */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Achieved Cases / Week
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
              {currentGp.totalCases.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">cases</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Target: {throughputTarget} cases/wk
            </div>
          </div>

          {/* Throughput Deviation d1- / d1+ */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Throughput Deviation</span>
              <span className="font-mono text-[10px] text-slate-400">
                <KatexMath math="d_1^-, d_1^+" />
              </span>
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
              {currentGp.d1Minus > 0 ? (
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <Minus className="w-4 h-4" /> {currentGp.d1Minus.toFixed(1)} cases
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Plus className="w-4 h-4" /> {currentGp.d1Plus.toFixed(1)} cases
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              {currentGp.d1Minus > 0 ? `Under target by ${currentGp.d1Minus.toFixed(1)}` : 'Target fully satisfied'}
            </div>
          </div>

          {/* Achieved Overtime */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Achieved Overtime / Week
            </div>
            <div
              className={`text-2xl font-extrabold font-mono ${
                currentGp.totalOvertimeHours > overtimeTarget
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {currentGp.totalOvertimeHours.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-400">hrs</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Target limit: {overtimeTarget.toFixed(1)} hrs/wk
            </div>
          </div>

          {/* Overtime Deviation d2+ */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Overtime Deviation</span>
              <span className="font-mono text-[10px] text-slate-400">
                <KatexMath math="d_2^+" />
              </span>
            </div>
            <div className="text-2xl font-extrabold font-mono">
              {currentGp.d2Plus > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  +{currentGp.d2Plus.toFixed(2)} hrs excess
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  0.00 hrs (Within Cap)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              {currentGp.d2Plus > 0 ? 'Overtime target exceeded' : 'Staffing cap respected'}
            </div>
          </div>
        </div>

        {/* Before / After Comparison Table: Pure LP vs Goal Programming */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-750 px-4 py-2.5 font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>Operational Comparison: Pure LP (Single Objective) vs Goal Programming (Multi-Criteria)</span>
            <span className="font-mono text-[11px] text-slate-500">Trade-Off Analysis</span>
          </div>

          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-4 font-sans">Operational Dimension</th>
                <th className="py-2.5 px-4 text-right">Pure LP (Maximize Throughput Only)</th>
                <th className="py-2.5 px-4 text-right">Goal Programming (W1={w1Weight}, W2={w2Weight})</th>
                <th className="py-2.5 px-4 text-right">Net Differential (Δ)</th>
                <th className="py-2.5 px-4 font-sans">Managerial Interpretation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Weekly Case Volume
                </td>
                <td className="py-3 px-4 text-right font-bold text-slate-800 dark:text-slate-200">
                  {lpCases.toFixed(1)} cases
                </td>
                <td className="py-3 px-4 text-right font-bold text-[#2c6e68] dark:text-teal-400">
                  {currentGp.totalCases.toFixed(1)} cases
                </td>
                <td className="py-3 px-4 text-right font-bold">
                  <span className={deltaCases < 0 ? 'text-amber-600' : 'text-emerald-600'}>
                    {deltaCases >= 0 ? `+${deltaCases.toFixed(1)}` : deltaCases.toFixed(1)} cases
                  </span>
                </td>
                <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  {deltaCases < 0
                    ? `Sacrifices ${Math.abs(deltaCases).toFixed(1)} cases to eliminate unpredictable surgical run-overs`
                    : 'Maintains optimal throughput volume'}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Weekly Staff Overtime
                </td>
                <td className="py-3 px-4 text-right font-bold text-red-600 dark:text-red-400">
                  {lpOvertime.toFixed(2)} hrs
                </td>
                <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {currentGp.totalOvertimeHours.toFixed(2)} hrs
                </td>
                <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {deltaOvertime.toFixed(2)} hrs
                </td>
                <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  Saves <span className="font-bold">{Math.abs(deltaOvertime).toFixed(1)} overtime hours</span> weekly by
                  curtailing volatile long-case services
                </td>
              </tr>

              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Capacity Hours Utilized
                </td>
                <td className="py-3 px-4 text-right">
                  {lpHours.toFixed(1)} / 320 hrs
                </td>
                <td className="py-3 px-4 text-right">
                  {currentGp.totalHours.toFixed(1)} / 320 hrs
                </td>
                <td className="py-3 px-4 text-right text-slate-500">
                  {(currentGp.totalHours - lpHours).toFixed(1)} hrs
                </td>
                <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  Leaves regular block buffer for urgent add-ons and emergency cases
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
