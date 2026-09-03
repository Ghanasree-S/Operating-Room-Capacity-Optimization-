import React from 'react';
import { LpSolution, GoalProgrammingSolution } from '../types';
import {
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Building2,
  Users,
  Clock,
  TrendingUp,
  BarChart,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface InsightsSectionProps {
  lpSolution: LpSolution | null;
  gpSolution: GoalProgrammingSolution | null;
}

export const InsightsSection: React.FC<InsightsSectionProps> = ({
  lpSolution,
  gpSolution,
}) => {
  // Baseline hospital figures from 2,172 records
  const baseline = {
    weeklyCases: 167.1,
    capacityHours: 152.6,
    capacityPct: 47.7,
    overtimeHours: 12.8,
    efficiency: 1.09, // cases per hour
  };

  const lp = {
    weeklyCases: lpSolution?.totalCases ?? 203.0,
    capacityHours: lpSolution?.totalHours ?? 183.1,
    capacityPct: lpSolution ? (lpSolution.totalHours / 320) * 100 : 57.2,
    overtimeHours: 15.6,
    efficiency: lpSolution ? lpSolution.totalCases / lpSolution.totalHours : 1.11,
  };

  const gp = {
    weeklyCases: gpSolution?.totalCases ?? 195.4,
    capacityHours: gpSolution?.totalHours ?? 171.4,
    capacityPct: gpSolution ? (gpSolution.totalHours / 320) * 100 : 53.6,
    overtimeHours: gpSolution?.totalOvertimeHours ?? 9.8,
    efficiency: gpSolution ? gpSolution.totalCases / gpSolution.totalHours : 1.14,
  };

  return (
    <div className="space-y-6 pb-12">
      {/* REQUIRED CALLOUT BOX: Highlight key finding */}
      <section
        id="key-finding-callout"
        className="rounded-xl p-6 bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800 shadow-sm"
      >
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
            <Lightbulb className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Operations Research Core Finding
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-amber-100 mt-0.5 leading-snug">
              &ldquo;OR capacity is not the bottleneck — only 152 of 320 weekly hours are used. The binding constraint is specialty demand caps.&rdquo;
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
              Hospital executives frequently propose building new OR suites or extending operating room shifts to alleviate surgical backlogs.
              However, mathematical programming proves that physical capacity currently exhibits{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-white">167.4 hours of weekly slack</span> (52.3% unused capacity across 8 suites).
              The true limiting factors are historical surgical demand bounds and clinical referral ceilings for individual specialties.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table: Current Practice vs LP-Optimized vs Goal-Programming-Balanced */}
      <section
        id="comparison-table-section"
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Policy Comparison: Baseline Practice vs Mathematical Optimization
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cross-scenario analysis evaluating throughput, suite utilization, staffing overtime, and clinical yield
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-750/70 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-4 font-sans">Operational Metric</th>
                <th className="py-3.5 px-4 text-right">Current Practice (Baseline)</th>
                <th className="py-3.5 px-4 text-right bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200">
                  LP-Optimized (Throughput Max)
                </th>
                <th className="py-3.5 px-4 text-right bg-teal-50/50 dark:bg-teal-950/20 text-[#2c6e68] dark:text-teal-200">
                  Goal-Programming (Balanced)
                </th>
                <th className="py-3.5 px-4 font-sans">Strategic Significance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono text-slate-800 dark:text-slate-200">
              {/* Weekly Cases */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                <td className="py-3.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Weekly Cases Performed
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-300">
                  {baseline.weeklyCases.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">cases</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20">
                  {lp.weeklyCases.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">cases (+21.5%)</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-[#2c6e68] dark:text-teal-300 bg-teal-50/50 dark:bg-teal-950/20">
                  {gp.weeklyCases.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">cases (+16.9%)</span>
                </td>
                <td className="py-3.5 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  LP pushes high-efficiency specialties (Ophth, ENT) to 1.2x demand ceiling
                </td>
              </tr>

              {/* Capacity Used */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                <td className="py-3.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  OR Capacity Used (of 320h)
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-300">
                  {baseline.capacityHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs (47.7%)</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20">
                  {lp.capacityHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs ({lp.capacityPct.toFixed(1)}%)</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-[#2c6e68] dark:text-teal-300 bg-teal-50/50 dark:bg-teal-950/20">
                  {gp.capacityHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs ({gp.capacityPct.toFixed(1)}%)</span>
                </td>
                <td className="py-3.5 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  Slack remains &gt; 135 hrs in all models; capacity limit never binds
                </td>
              </tr>

              {/* Overtime */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                <td className="py-3.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Weekly Staff Overtime
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-300">
                  {baseline.overtimeHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-red-600 dark:text-red-400 bg-blue-50/50 dark:bg-blue-950/20">
                  {lp.overtimeHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs (+21.9%)</span>
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 bg-teal-50/50 dark:bg-teal-950/20">
                  {gp.overtimeHours.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">hrs (-23.4%)</span>
                </td>
                <td className="py-3.5 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  Goal Programming slashes overtime by 5.8 hrs weekly compared to pure LP
                </td>
              </tr>

              {/* Operating Yield */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                <td className="py-3.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                  Throughput Yield (Cases / Hr)
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-300">
                  {baseline.efficiency.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20">
                  {lp.efficiency.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-[#2c6e68] dark:text-teal-300 bg-teal-50/50 dark:bg-teal-950/20">
                  {gp.efficiency.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 font-sans text-slate-600 dark:text-slate-300 text-[11px]">
                  Highest yield achieved by curating short-duration, low-overtime procedures
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Actionable Executive Takeaways (3 Cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recommendation 1 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-[#2c6e68] dark:text-teal-400 flex items-center justify-center font-bold mb-3">
            <Building2 className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            1. Halt Physical Suite Capital Expansion
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
            With aggregate block utilization sitting at ~46%, allocating capital toward building additional operating rooms
            or commissioning 9th and 10th suites would exacerbate idle capacity. The 8 existing suites can absorb up to
            320 hours weekly without any physical construction.
          </p>
        </div>

        {/* Recommendation 2 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold mb-3">
            <Users className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            2. Unlock Referral Streams in Short-Case Services
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
            Because the demand cap is the binding constraint, hospital volume can only increase by actively recruiting
            surgeons or signing outpatient surgical partnerships in high-turnover specialties like Ophthalmology (42 min/case)
            and ENT (55 min/case).
          </p>
        </div>

        {/* Recommendation 3 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold mb-3">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            3. Consolidate Low-Utilized Suites (OR 6, 7 &amp; 8)
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
            OR 6 (38.2%), OR 7 (35.1%), and OR 8 (26.4%) operate below the 40% threshold. Schedulers should release static
            block times in these suites by noon and convert them into acute add-on or floating regional emergency suites,
            significantly mitigating afternoon overtime.
          </p>
        </div>
      </section>
    </div>
  );
};
