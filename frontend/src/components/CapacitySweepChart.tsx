import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SpecialtyLpInput } from '../types';
import { solveLpModel } from '../solver/lpSolver';

interface CapacitySweepChartProps {
  lpInputs: SpecialtyLpInput[];
  currentCapacity: number;
}

const SERIES_COLOR = '#2c6e68'; // the app's primary teal
const AXIS_INK = '#64748b'; // slate-500 reads on both light and dark surfaces

/**
 * Re-solves the LP across a range of weekly capacities to show where capacity
 * stops being the bottleneck and the demand ceilings (Max_Hours) take over.
 */
export function CapacitySweepChart({ lpInputs, currentCapacity }: CapacitySweepChartProps) {
  const { points, saturation } = useMemo(() => {
    const minTotal = lpInputs.reduce((a, i) => a + i.minHours, 0);
    const maxTotal = lpInputs.reduce((a, i) => a + i.maxHours, 0);
    const start = Math.ceil(minTotal / 5) * 5;
    const end = Math.max(currentCapacity, Math.ceil((maxTotal * 1.3) / 10) * 10);
    const step = Math.max(1, Math.round((end - start) / 40));

    const pts: { capacity: number; cases: number }[] = [];
    for (let c = start; c <= end; c += step) {
      const sol = solveLpModel(lpInputs, c);
      if (sol.status === 'optimal') pts.push({ capacity: c, cases: sol.totalCases });
    }
    return { points: pts, saturation: Math.round(maxTotal * 10) / 10 };
  }, [lpInputs, currentCapacity]);

  if (points.length < 2) return null;
  const peak = points[points.length - 1].cases;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
        What-if: weekly cases vs total OR capacity
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Below ~{saturation} h every extra hour adds cases (capacity binds). Above it the
        specialty demand ceilings bind instead, so extra capacity adds nothing — the optimum
        plateaus at {peak.toFixed(1)} cases/week.
      </p>
      <div className="mt-4 h-64" role="img" aria-label={`Line chart of weekly cases against capacity, plateauing at ${peak.toFixed(1)} cases above ${saturation} hours`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke={AXIS_INK} strokeOpacity={0.2} />
            <XAxis
              dataKey="capacity"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: AXIS_INK, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              unit=" h"
            />
            <YAxis
              tick={{ fill: AXIS_INK, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(1)} cases/week`, 'Optimum']}
              labelFormatter={(c: number) => `Capacity ${c} h`}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine
              x={saturation}
              stroke={AXIS_INK}
              strokeDasharray="4 4"
              label={{ value: 'capacity stops binding', fill: AXIS_INK, fontSize: 10, position: 'insideTopRight' }}
            />
            <ReferenceLine
              x={currentCapacity}
              stroke={SERIES_COLOR}
              strokeOpacity={0.5}
              label={{ value: `current ${currentCapacity} h`, fill: AXIS_INK, fontSize: 10, position: 'insideBottomRight' }}
            />
            <Line
              type="linear"
              dataKey="cases"
              stroke={SERIES_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
