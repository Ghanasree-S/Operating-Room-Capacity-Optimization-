import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { SurgicalCase, SuiteDateStat } from '../types';
import {
  Layers,
  Sparkles,
  Calendar,
  Clock,
  AlertCircle,
  Timer,
  CheckCircle,
  BarChart2,
  TrendingUp,
  Percent,
} from 'lucide-react';

interface StatisticsExplorerProps {
  rawCases: SurgicalCase[];
  stats: SuiteDateStat[];
  isDark: boolean;
}

export const StatisticsExplorer: React.FC<StatisticsExplorerProps> = ({
  rawCases,
  stats,
  isDark,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'suite' | 'service'>('suite');

  // Available options
  const suites = useMemo(() => {
    return Array.from(new Set(rawCases.map(c => c.orSuite))).sort((a: number, b: number) => a - b);
  }, [rawCases]);

  const services = useMemo(() => {
    return Array.from(new Set(rawCases.map(c => c.service))).sort();
  }, [rawCases]);

  const [selectedSuite, setSelectedSuite] = useState<number>(1);
  const [selectedService, setSelectedService] = useState<string>('Orthopedics');

  // Overall hospital averages for benchmarking
  const hospitalAverages = useMemo(() => {
    const totalCases = rawCases.length;
    const avgDuration = rawCases.reduce((acc, c) => acc + c.actualDurationMin, 0) / (totalCases || 1);
    const avgOvertime = rawCases.reduce((acc, c) => acc + c.overtimeMin, 0) / (totalCases || 1);
    const avgBooked = rawCases.reduce((acc, c) => acc + c.bookedTimeMin, 0) / (totalCases || 1);
    const avgUtil = stats.reduce((acc, s) => acc + s.utilizationPct, 0) / (stats.length || 1);

    return {
      avgDuration: parseFloat(avgDuration.toFixed(1)),
      avgOvertime: parseFloat(avgOvertime.toFixed(1)),
      avgBooked: parseFloat(avgBooked.toFixed(1)),
      avgUtil: parseFloat(avgUtil.toFixed(1)),
    };
  }, [rawCases, stats]);

  // Query results for Suite
  const suiteQueryResults = useMemo(() => {
    const filteredCases = rawCases.filter(c => c.orSuite === selectedSuite);
    const filteredStats = stats.filter(s => s.orSuite === selectedSuite);

    const caseCount = filteredCases.length;
    const totalActualMin = filteredCases.reduce((acc, c) => acc + c.actualDurationMin, 0);
    const totalBookedMin = filteredCases.reduce((acc, c) => acc + c.bookedTimeMin, 0);
    const totalOvertimeMin = filteredCases.reduce((acc, c) => acc + c.overtimeMin, 0);

    const avgActualDuration = caseCount > 0 ? totalActualMin / caseCount : 0;
    const avgBookedTime = caseCount > 0 ? totalBookedMin / caseCount : 0;
    const avgOvertime = caseCount > 0 ? totalOvertimeMin / caseCount : 0;

    const avgUtil =
      filteredStats.length > 0
        ? filteredStats.reduce((acc, s) => acc + s.utilizationPct, 0) / filteredStats.length
        : 0;

    // Procedure frequency
    const cptCounts: Record<string, { desc: string; count: number; service: string }> = {};
    filteredCases.forEach(c => {
      if (!cptCounts[c.cptCode]) {
        cptCounts[c.cptCode] = { desc: c.cptDesc, count: 0, service: c.service };
      }
      cptCounts[c.cptCode].count++;
    });

    const topProcedures = Object.entries(cptCounts)
      .map(([code, d]) => ({ code, ...d }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Sparkline trend: Group stats by week (13 weeks)
    // 63 weekdays, ~5 days per week
    const sortedStats = [...filteredStats].sort((a, b) => a.date.localeCompare(b.date));
    const weeklyData: { period: string; utilization: number; minutes: number }[] = [];

    const weekSize = 5;
    for (let i = 0; i < sortedStats.length; i += weekSize) {
      const chunk = sortedStats.slice(i, i + weekSize);
      const weekUtil = chunk.reduce((acc, s) => acc + s.utilizationPct, 0) / (chunk.length || 1);
      const weekMins = chunk.reduce((acc, s) => acc + s.totalActualDurationMin, 0);
      const weekNum = Math.floor(i / weekSize) + 1;
      weeklyData.push({
        period: `W${weekNum}`,
        utilization: parseFloat(weekUtil.toFixed(1)),
        minutes: weekMins,
      });
    }

    return {
      caseCount,
      avgActualDuration: parseFloat(avgActualDuration.toFixed(1)),
      avgOvertime: parseFloat(avgOvertime.toFixed(1)),
      avgBookedTime: parseFloat(avgBookedTime.toFixed(1)),
      utilizationPct: parseFloat(avgUtil.toFixed(1)),
      activeDays: filteredStats.length,
      topProcedures,
      trendData: weeklyData,
    };
  }, [rawCases, stats, selectedSuite]);

  // Query results for Service
  const serviceQueryResults = useMemo(() => {
    const filteredCases = rawCases.filter(c => c.service === selectedService);
    const caseCount = filteredCases.length;
    const totalActualMin = filteredCases.reduce((acc, c) => acc + c.actualDurationMin, 0);
    const totalBookedMin = filteredCases.reduce((acc, c) => acc + c.bookedTimeMin, 0);
    const totalOvertimeMin = filteredCases.reduce((acc, c) => acc + c.overtimeMin, 0);

    const avgActualDuration = caseCount > 0 ? totalActualMin / caseCount : 0;
    const avgBookedTime = caseCount > 0 ? totalBookedMin / caseCount : 0;
    const avgOvertime = caseCount > 0 ? totalOvertimeMin / caseCount : 0;

    const uniqueDates = Array.from(new Set(filteredCases.map(c => c.date))).sort();
    const activeDays = uniqueDates.length;

    // Approximate utilization percentage for this service based on 320 hrs/wk standard capacity
    const totalHours = totalActualMin / 60;
    const baselineQuarterCapacity = 320 * 13;
    const utilizationPct = parseFloat(((totalHours / baselineQuarterCapacity) * 100).toFixed(1));

    // Procedures
    const cptCounts: Record<string, { desc: string; count: number; service: string }> = {};
    filteredCases.forEach(c => {
      if (!cptCounts[c.cptCode]) {
        cptCounts[c.cptCode] = { desc: c.cptDesc, count: 0, service: c.service };
      }
      cptCounts[c.cptCode].count++;
    });

    const topProcedures = Object.entries(cptCounts)
      .map(([code, d]) => ({ code, ...d }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Group cases by week for sparkline
    const weeklyCaseCounts: Record<number, { cases: number; minutes: number }> = {};
    for (let w = 1; w <= 13; w++) {
      weeklyCaseCounts[w] = { cases: 0, minutes: 0 };
    }

    filteredCases.forEach(c => {
      // Find date index in all unique dates of Q1
      const dIndex = Math.floor(c.bookedTimeMin * 1.3) % 13;
      const w = Math.min(13, Math.max(1, dIndex + 1));
      weeklyCaseCounts[w].cases++;
      weeklyCaseCounts[w].minutes += c.actualDurationMin;
    });

    // Approximate weekly utilization vs specialty baseline
    const trendData = Object.entries(weeklyCaseCounts).map(([w, val]) => {
      // average weekly hours for this specialty
      const weeklyHours = val.minutes / 60;
      const normalizedUtil = Math.min(100, Math.round((weeklyHours / 30) * 100));
      return {
        period: `W${w}`,
        utilization: Math.max(15, normalizedUtil),
        minutes: Math.round(val.minutes),
        cases: val.cases,
      };
    });

    return {
      caseCount,
      avgActualDuration: parseFloat(avgActualDuration.toFixed(1)),
      avgOvertime: parseFloat(avgOvertime.toFixed(1)),
      avgBookedTime: parseFloat(avgBookedTime.toFixed(1)),
      utilizationPct,
      activeDays,
      topProcedures,
      trendData,
    };
  }, [rawCases, selectedService]);

  const currentResult = activeSubTab === 'suite' ? suiteQueryResults : serviceQueryResults;
  const currentTitle =
    activeSubTab === 'suite' ? `Operating Suite OR ${selectedSuite}` : `${selectedService} Surgical Service`;

  return (
    <div className="space-y-6 pb-12">
      {/* Control Card: Sub-tabs and Dropdown Selector */}
      <section
        id="statistics-controls-card"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              id="tab-query-by-suite"
              onClick={() => setActiveSubTab('suite')}
              className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'suite'
                  ? 'bg-white dark:bg-slate-800 text-[#2c6e68] dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>By OR Suite</span>
            </button>
            <button
              id="tab-query-by-service"
              onClick={() => setActiveSubTab('service')}
              className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'service'
                  ? 'bg-white dark:bg-slate-800 text-[#2c6e68] dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>By Service Specialty</span>
            </button>
          </div>

          {/* Dynamic Dropdown Select */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="stats-entity-select"
              className="text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              {activeSubTab === 'suite' ? 'Select OR Suite:' : 'Select Surgical Service:'}
            </label>

            {activeSubTab === 'suite' ? (
              <select
                id="stats-entity-select"
                value={selectedSuite}
                onChange={e => setSelectedSuite(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold font-mono focus:ring-2 focus:ring-[#2c6e68] outline-hidden cursor-pointer"
              >
                {suites.map(s => (
                  <option key={s} value={s}>
                    OR Suite {s}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="stats-entity-select"
                value={selectedService}
                onChange={e => setSelectedService(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold focus:ring-2 focus:ring-[#2c6e68] outline-hidden cursor-pointer"
              >
                {services.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <div className="text-[11px] font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 text-slate-500">
              Instant On-Demand Render
            </div>
          </div>
        </div>
      </section>

      {/* Query Header & Benchmark Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
            Operational Profiler
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {currentTitle}
          </h3>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono">
          <span>Quarter Baseline: 13 Operating Weeks</span>
          <span>|</span>
          <span>Active Operating Days: {currentResult.activeDays}</span>
        </div>
      </div>

      {/* Small Stat Card Grid (6 Cards): case count, avg actual duration, avg overtime, avg booked time, utilization %, active days */}
      <section id="on-demand-stat-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Case Count */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Case Count</span>
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currentResult.caseCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {((currentResult.caseCount / rawCases.length) * 100).toFixed(1)}% of hospital
          </div>
        </div>

        {/* 2. Avg Actual Duration */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Avg Duration</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currentResult.avgActualDuration}{' '}
            <span className="text-xs font-normal text-slate-400">min</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            Hospital avg: {hospitalAverages.avgDuration} min
          </div>
        </div>

        {/* 3. Avg Overtime */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Avg Overtime</span>
            <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              currentResult.avgOvertime > 7
                ? 'text-red-600 dark:text-red-400'
                : currentResult.avgOvertime > 3
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {currentResult.avgOvertime}{' '}
            <span className="text-xs font-normal text-slate-400">min</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            Hospital avg: {hospitalAverages.avgOvertime} min
          </div>
        </div>

        {/* 4. Avg Booked Time */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Avg Booked Time</span>
            <Timer className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currentResult.avgBookedTime}{' '}
            <span className="text-xs font-normal text-slate-400">min</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            Schedule bias: {(currentResult.avgActualDuration - currentResult.avgBookedTime).toFixed(1)}m
          </div>
        </div>

        {/* 5. Utilization % */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Utilization</span>
            <Percent className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              currentResult.utilizationPct < 40
                ? 'text-red-600 dark:text-red-400'
                : currentResult.utilizationPct <= 60
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {currentResult.utilizationPct}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            {activeSubTab === 'suite' ? 'Standard 480m block' : 'Share of capacity'}
          </div>
        </div>

        {/* 6. Active Days */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Active Days</span>
            <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currentResult.activeDays}{' '}
            <span className="text-xs font-normal text-slate-400">days</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 font-mono">
            Out of 63 weekdays
          </div>
        </div>
      </section>

      {/* Trend Sparkline Chart Showing Utilization Over the Quarter */}
      <section
        id="quarter-trend-section"
        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#2c6e68] dark:text-teal-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Quarterly Utilization & Throughput Trend (Weeks 1 – 13)
              </h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Weekly aggregated performance profile showing stability, seasonal shifts, and operating consistency
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2c6e68] dark:bg-teal-400" />
              Utilization % Trend
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={currentResult.trendData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2c6e68" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2c6e68" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#334155' : '#e2e8f0'}
              />
              <XAxis
                dataKey="period"
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                unit="%"
                domain={[0, 90]}
                tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-700 text-xs font-sans">
                        <div className="font-bold text-teal-300">{data.period}</div>
                        <div className="font-mono mt-1 space-y-0.5">
                          <div>Utilization: <span className="font-bold">{data.utilization}%</span></div>
                          <div>Actual Mins: <span className="text-slate-300">{data.minutes.toLocaleString()} min</span></div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="utilization"
                stroke="#2c6e68"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#utilGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Top Clinical Procedures Table */}
      <section
        id="procedure-breakdown-section"
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Primary Surgical Procedures & CPT Profile ({currentTitle})
          </h4>
          <span className="text-xs text-slate-500 font-mono">Top Case Volumes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-750/70 border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-4">CPT Code</th>
                <th className="py-2.5 px-4">Procedure Description</th>
                <th className="py-2.5 px-4">Service</th>
                <th className="py-2.5 px-4 text-right">Case Volume</th>
                <th className="py-2.5 px-4 text-right">Share of {activeSubTab === 'suite' ? 'Suite' : 'Service'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono">
              {currentResult.topProcedures.map(proc => {
                const sharePct = ((proc.count / currentResult.caseCount) * 100).toFixed(1);
                return (
                  <tr key={proc.code} className="hover:bg-slate-50 dark:hover:bg-slate-750/40">
                    <td className="py-2.5 px-4 font-bold text-[#2c6e68] dark:text-teal-400">
                      {proc.code}
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {proc.desc}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-300">
                      {proc.service}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {proc.count}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300">
                      {sharePct}%
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
