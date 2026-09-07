import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import {
  SurgicalCase,
  SuiteDateStat,
  SpecialtyLpInput,
  SuiteSummary,
  ServiceSummary,
} from '../types';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  Clock,
  Activity,
  CalendarCheck,
  AlertTriangle,
} from 'lucide-react';

interface OverviewDashboardProps {
  rawCases: SurgicalCase[];
  stats: SuiteDateStat[];
  lpInputs: SpecialtyLpInput[];
  isDark: boolean;
}

type SortField = 'service' | 'caseCount' | 'avgActualDuration' | 'avgOvertime' | 'totalHours';
type SortDirection = 'asc' | 'desc';

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  rawCases,
  stats,
  lpInputs,
  isDark,
}) => {
  const [sortField, setSortField] = useState<SortField>('caseCount');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Compute aggregate statistics
  const totalCases = rawCases.length;
  const suiteNumbers = useMemo(() => Array.from(new Set(rawCases.map(c => c.orSuite))).sort((a: number, b: number) => a - b), [rawCases]);
  const specialties = useMemo(() => Array.from(new Set(rawCases.map(c => c.service))).sort(), [rawCases]);

  // Suite Summaries
  const suiteSummaries: SuiteSummary[] = useMemo(() => {
    return suiteNumbers.map(suite => {
      const suiteCases = rawCases.filter(c => c.orSuite === suite);
      const suiteStats = stats.filter(s => s.orSuite === suite);

      const caseCount = suiteCases.length;
      const totalActualMin = suiteCases.reduce((acc, c) => acc + c.actualDurationMin, 0);
      const totalBookedMin = suiteCases.reduce((acc, c) => acc + c.bookedTimeMin, 0);
      const totalOvertimeMin = suiteCases.reduce((acc, c) => acc + c.overtimeMin, 0);
      const totalTurnoverMin = suiteCases.reduce((acc, c) => acc + c.turnoverMin, 0);

      const avgActualDuration = caseCount > 0 ? totalActualMin / caseCount : 0;
      const avgBookedTime = caseCount > 0 ? totalBookedMin / caseCount : 0;
      const avgOvertime = caseCount > 0 ? totalOvertimeMin / caseCount : 0;
      const avgTurnover = caseCount > 0 ? totalTurnoverMin / caseCount : 0;

      // Average utilization from STATS rows for this suite
      const avgUtil =
        suiteStats.length > 0
          ? suiteStats.reduce((acc, s) => acc + s.utilizationPct, 0) / suiteStats.length
          : 0;

      const utilizationPct = parseFloat(avgUtil.toFixed(1));
      let utilizationTier: 'low' | 'medium' | 'high' = 'medium';
      if (utilizationPct < 40) utilizationTier = 'low';
      else if (utilizationPct > 60) utilizationTier = 'high';

      return {
        orSuite: suite,
        caseCount,
        avgActualDuration: parseFloat(avgActualDuration.toFixed(1)),
        avgBookedTime: parseFloat(avgBookedTime.toFixed(1)),
        avgOvertime: parseFloat(avgOvertime.toFixed(1)),
        avgTurnover: parseFloat(avgTurnover.toFixed(1)),
        utilizationPct,
        activeDays: suiteStats.length,
        utilizationTier,
      };
    });
  }, [rawCases, stats, suiteNumbers]);

  // Overall Average Utilization
  const avgUtilization = useMemo(() => {
    if (suiteSummaries.length === 0) return 0;
    const sum = suiteSummaries.reduce((acc, s) => acc + s.utilizationPct, 0);
    return parseFloat((sum / suiteSummaries.length).toFixed(1));
  }, [suiteSummaries]);

  // Specialty Summaries
  const serviceSummaries: ServiceSummary[] = useMemo(() => {
    return specialties.map(service => {
      const sCases = rawCases.filter(c => c.service === service);
      const caseCount = sCases.length;
      const totalActualMin = sCases.reduce((acc, c) => acc + c.actualDurationMin, 0);
      const totalBookedMin = sCases.reduce((acc, c) => acc + c.bookedTimeMin, 0);
      const totalOvertimeMin = sCases.reduce((acc, c) => acc + c.overtimeMin, 0);
      const totalTurnoverMin = sCases.reduce((acc, c) => acc + c.turnoverMin, 0);

      const avgActualDuration = caseCount > 0 ? totalActualMin / caseCount : 0;
      const avgBookedTime = caseCount > 0 ? totalBookedMin / caseCount : 0;
      const avgOvertime = caseCount > 0 ? totalOvertimeMin / caseCount : 0;
      const avgTurnover = caseCount > 0 ? totalTurnoverMin / caseCount : 0;

      const uniqueDates = new Set(sCases.map(c => c.date)).size;
      const totalHours = totalActualMin / 60;

      return {
        service,
        caseCount,
        avgActualDuration: parseFloat(avgActualDuration.toFixed(1)),
        avgBookedTime: parseFloat(avgBookedTime.toFixed(1)),
        avgOvertime: parseFloat(avgOvertime.toFixed(1)),
        avgTurnover: parseFloat(avgTurnover.toFixed(1)),
        totalHours: parseFloat(totalHours.toFixed(1)),
        utilizationPct: parseFloat(((totalHours / (8 * 40 * 13)) * 100).toFixed(1)), // fraction of quarter capacity
        activeDays: uniqueDates,
      };
    });
  }, [rawCases, specialties]);

  // Sorted specialty data
  const sortedServices = useMemo(() => {
    return [...serviceSummaries].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [serviceSummaries, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Color generator for suite bars:
  // Red: under 40%
  // Amber: 40% - 60%
  // Green: over 60%
  const getTierColor = (util: number) => {
    if (util < 40) return '#ef4444'; // Red
    if (util <= 60) return '#f59e0b'; // Amber
    return '#10b981'; // Green
  };

  const chartData = suiteSummaries.map(s => ({
    name: `OR ${s.orSuite}`,
    suite: s.orSuite,
    utilization: s.utilizationPct,
    cases: s.caseCount,
    tier: s.utilizationTier,
  }));

  return (
    <div className="space-y-6 pb-12">
      {/* Top stat row: Total Cases, OR Suites, Specialties, Avg Utilization */}
      <section id="top-stat-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cases */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            <span>Total Surgical Cases</span>
            <CalendarCheck className="w-4 h-4 text-[#2c6e68] dark:text-teal-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-50 tracking-tight">
            {totalCases.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Q1 Operating Records</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
              {(totalCases / 13).toFixed(0)} cases/wk
            </span>
          </div>
        </div>

        {/* OR Suites */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            <span>Operating Suites</span>
            <Activity className="w-4 h-4 text-[#2c6e68] dark:text-teal-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-50 tracking-tight">
            {suiteNumbers.length}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Standard Block Time</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
              320 hrs/wk total
            </span>
          </div>
        </div>

        {/* Specialties */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            <span>Surgical Specialties</span>
            <Clock className="w-4 h-4 text-[#2c6e68] dark:text-teal-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-50 tracking-tight">
            {specialties.length}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Demand-Capped Services</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">10 Clinical Lines</span>
          </div>
        </div>

        {/* Avg Utilization */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            <span>Avg Block Utilization</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                avgUtilization < 40
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : avgUtilization <= 60
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}
            >
              {avgUtilization < 40 ? 'Underutilized' : avgUtilization <= 60 ? 'Moderate' : 'Optimal'}
            </span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-50 tracking-tight">
            {avgUtilization.toFixed(1)}%
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Target Benchmark: 75-80%</span>
            <span className="font-mono text-red-600 dark:text-red-400 font-semibold">
              -{(75 - avgUtilization).toFixed(1)}% Gap
            </span>
          </div>
        </div>
      </section>

      {/* Utilization by Suite Bar Chart */}
      <section
        id="suite-utilization-section"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              OR Suite Utilization Distribution (Quarterly Actual vs 40-hr Standard Block)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Target operating band: 40% - 60% (Amber), &gt; 60% (Green), &lt; 40% (Red)
            </p>
          </div>

          {/* Tier Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#10b981]" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">&gt; 60% Optimal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">40% - 60% Moderate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#ef4444]" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">&lt; 40% Underutilized</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 20, left: -10, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#334155' : '#e2e8f0'}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                unit="%"
                domain={[0, 80]}
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white dark:bg-slate-950 p-3 rounded-lg shadow-xl border border-slate-700 text-xs font-sans">
                        <div className="font-bold text-sm text-teal-300 mb-1">{data.name}</div>
                        <div className="space-y-1 font-mono">
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Utilization:</span>
                            <span className="font-bold text-white">{data.utilization}%</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Total Cases:</span>
                            <span className="text-white">{data.cases}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Status Tier:</span>
                            <span
                              className={`font-semibold uppercase text-[10px] ${
                                data.tier === 'high'
                                  ? 'text-emerald-400'
                                  : data.tier === 'medium'
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {data.tier === 'high' ? '> 60%' : data.tier === 'medium' ? '40-60%' : '< 40%'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={60}
                stroke="#10b981"
                strokeDasharray="4 4"
                label={{
                  value: 'Target High (60%)',
                  position: 'insideTopRight',
                  fill: '#10b981',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <ReferenceLine
                y={40}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{
                  value: 'Underutilized Threshold (40%)',
                  position: 'insideBottomRight',
                  fill: '#ef4444',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={`cell-${entry.suite}`} fill={getTierColor(entry.utilization)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Suite Quick Insight Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
          {suiteSummaries.map(s => (
            <div
              key={s.orSuite}
              className={`p-2 rounded-lg border ${
                s.utilizationTier === 'high'
                  ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : s.utilizationTier === 'medium'
                  ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
              }`}
            >
              <div className="font-bold text-slate-800 dark:text-slate-200">OR {s.orSuite}</div>
              <div className="font-mono text-sm font-semibold">{s.utilizationPct}%</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{s.caseCount} cases</div>
            </div>
          ))}
        </div>
      </section>

      {/* Utilization by Specialty Table */}
      <section
        id="specialty-table-section"
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Surgical Specialty Performance & Case Statistics
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click column headers to sort by Case Volume, Avg Case Duration, Avg Overtime, or Total Hours
            </p>
          </div>
          <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            10 Clinical Specialties | 2,172 Cases Total
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-750/70 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold select-none">
              <tr>
                <th
                  onClick={() => handleSort('service')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Service Specialty</span>
                    {sortField === 'service' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#2c6e68]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#2c6e68]" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('caseCount')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Cases</span>
                    {sortField === 'caseCount' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#2c6e68]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#2c6e68]" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('avgActualDuration')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Avg Duration (min)</span>
                    {sortField === 'avgActualDuration' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#2c6e68]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#2c6e68]" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('avgOvertime')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Avg Overtime (min)</span>
                    {sortField === 'avgOvertime' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#2c6e68]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#2c6e68]" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalHours')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Actual Hrs</span>
                    {sortField === 'totalHours' ? (
                      sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#2c6e68]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#2c6e68]" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Weekly Avg Vol</th>
                <th className="py-3.5 px-4 text-right">% of Hospital Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono text-slate-800 dark:text-slate-200">
              {sortedServices.map(item => {
                const pctOfTotal = ((item.caseCount / totalCases) * 100).toFixed(1);
                const weeklyAvgCases = (item.caseCount / 13).toFixed(1);

                return (
                  <tr
                    key={item.service}
                    className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                      {item.service}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {item.caseCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.avgActualDuration} <span className="text-slate-400 text-[10px]">min</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={
                          item.avgOvertime > 8
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : item.avgOvertime > 4
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {item.avgOvertime} <span className="text-slate-400 text-[10px]">min</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.totalHours.toLocaleString()} <span className="text-slate-400 text-[10px]">hrs</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {weeklyAvgCases} <span className="text-slate-400 text-[10px]">cases/wk</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#2c6e68] dark:bg-teal-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, Number(pctOfTotal) * 3)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right">{pctOfTotal}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
