import React, { useState, useCallback } from 'react';
import {
  Play,
  Plus,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ServerCrash,
} from 'lucide-react';
import { PlannerSpecialty, PlannerCapacity, PlanResponse } from '../types';
import { fetchDefaults, requestPlan, PlannerApiError } from '../api/plannerApi';
import { CsvUpload } from './CsvUpload';

const BLANK_SPECIALTY: PlannerSpecialty = {
  name: '',
  demand_cases: 0,
  avg_duration_min: 60,
  priority: 1,
  min_hours: 0,
  surgeon_hours: null,
  equipment_max_cases: null,
};

const STARTER_SPECIALTIES: PlannerSpecialty[] = [
  { ...BLANK_SPECIALTY, name: 'Orthopedics', demand_cases: 25, avg_duration_min: 58.2, priority: 2 },
  { ...BLANK_SPECIALTY, name: 'Ophthalmology', demand_cases: 26, avg_duration_min: 16.3 },
  { ...BLANK_SPECIALTY, name: 'Podiatry', demand_cases: 19, avg_duration_min: 56.3 },
  { ...BLANK_SPECIALTY, name: 'ENT', demand_cases: 15, avg_duration_min: 33.9 },
];

const DEFAULT_CAPACITY: PlannerCapacity = {
  or_suites: 8,
  hours_per_day: 8,
  days_per_week: 5,
  overtime_cap_hours: 0,
  emergency_reserve_pct: 0,
  overtime_penalty: 0.5,
};

const card =
  'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm';
const numberInput =
  'w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-right font-mono text-xs focus:ring-1 focus:ring-[#2c6e68] outline-hidden';
const labelText =
  'text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block';

export const CapacityPlanner: React.FC = () => {
  const [capacity, setCapacity] = useState<PlannerCapacity>(DEFAULT_CAPACITY);
  const [specialties, setSpecialties] = useState<PlannerSpecialty[]>(STARTER_SPECIALTIES);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);

  const totalDemandHours = specialties.reduce(
    (sum, s) => sum + (s.demand_cases * s.avg_duration_min) / 60,
    0
  );
  const regularHours = capacity.or_suites * capacity.hours_per_day * capacity.days_per_week;
  const usableHours = regularHours * (1 - capacity.emergency_reserve_pct / 100);

  const setCapacityField = (field: keyof PlannerCapacity, value: number) =>
    setCapacity(prev => ({ ...prev, [field]: value }));

  const setSpecialtyField = (
    index: number,
    field: keyof PlannerSpecialty,
    value: string | number | null
  ) =>
    setSpecialties(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

  const handleLoadDefaults = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchDefaults();
      setSpecialties(data.specialties);
      setApiDown(false);
    } catch (err) {
      if (err instanceof PlannerApiError && err.isConnectionError) setApiDown(true);
      setError(err instanceof Error ? err.message : 'Failed to load defaults');
    }
  }, []);

  const handleSolve = useCallback(async () => {
    setError(null);
    const named = specialties.filter(s => s.name.trim() !== '');
    if (named.length === 0) {
      setError('Add at least one specialty with a name before planning.');
      return;
    }
    setIsSolving(true);
    try {
      const result = await requestPlan({ capacity, specialties: named });
      setPlan(result);
      setApiDown(false);
    } catch (err) {
      if (err instanceof PlannerApiError && err.isConnectionError) setApiDown(true);
      setError(err instanceof Error ? err.message : 'Planning failed');
      setPlan(null);
    } finally {
      setIsSolving(false);
    }
  }, [capacity, specialties]);

  const handleExportCsv = useCallback(() => {
    if (!plan) return;
    const header = [
      'Specialty',
      'Allocated Hours',
      'Cases Scheduled',
      'Demand Cases',
      'Unmet Cases',
      'Demand Met %',
      'Limiting Factor',
    ];
    const rows = plan.specialties.map(s => [
      s.name,
      s.allocated_hours,
      s.cases_scheduled,
      s.demand_cases,
      s.unmet_cases,
      s.demand_met_pct,
      s.limiting_factor,
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'or_capacity_plan.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  return (
    <div className="space-y-6 pb-12">
      {apiDown && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex gap-3">
          <ServerCrash className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <div className="font-bold mb-1">Planner API is not reachable</div>
            <p className="mb-2">
              This tab solves on the Python backend. Start it in a second terminal:
            </p>
            <code className="block bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1.5 font-mono">
              cd backend/src &amp;&amp; py -3 -m uvicorn api:app --port 8000
            </code>
          </div>
        </div>
      )}

      <CsvUpload
        onApply={imported => {
          setSpecialties(imported);
          setPlan(null);
          setError(null);
        }}
        onConnectionError={() => setApiDown(true)}
      />

      {/* ---------------------------------------------- hospital capacity */}
      <section className={`${card} p-6`}>
        <div className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-5">
          <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
            Step 1 — Your Operating Capacity
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            What theatre capacity do you have each week?
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className={labelText} htmlFor="planner-or-suites">OR suites</label>
            <input
              id="planner-or-suites"
              type="number"
              min={1}
              value={capacity.or_suites}
              onChange={e => setCapacityField('or_suites', Number(e.target.value))}
              className={numberInput}
            />
          </div>
          <div>
            <label className={labelText} htmlFor="planner-hours-day">Hours per day</label>
            <input
              id="planner-hours-day"
              type="number"
              min={1}
              step={0.5}
              value={capacity.hours_per_day}
              onChange={e => setCapacityField('hours_per_day', Number(e.target.value))}
              className={numberInput}
            />
          </div>
          <div>
            <label className={labelText} htmlFor="planner-days-week">Operating days/week</label>
            <input
              id="planner-days-week"
              type="number"
              min={1}
              max={7}
              value={capacity.days_per_week}
              onChange={e => setCapacityField('days_per_week', Number(e.target.value))}
              className={numberInput}
            />
          </div>
          <div>
            <label className={labelText} htmlFor="planner-overtime">Overtime allowed (hrs/wk)</label>
            <input
              id="planner-overtime"
              type="number"
              min={0}
              step={0.5}
              value={capacity.overtime_cap_hours}
              onChange={e => setCapacityField('overtime_cap_hours', Number(e.target.value))}
              className={numberInput}
            />
          </div>
          <div>
            <label className={labelText} htmlFor="planner-reserve">Emergency reserve (%)</label>
            <input
              id="planner-reserve"
              type="number"
              min={0}
              max={90}
              value={capacity.emergency_reserve_pct}
              onChange={e => setCapacityField('emergency_reserve_pct', Number(e.target.value))}
              className={numberInput}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="text-slate-500 mb-0.5">Regular capacity</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {regularHours.toFixed(0)} hrs/wk
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="text-slate-500 mb-0.5">Usable after reserve</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {usableHours.toFixed(0)} hrs/wk
            </div>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 ${
              totalDemandHours > usableHours + capacity.overtime_cap_hours
                ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                : 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800'
            }`}
          >
            <div className="text-slate-500 dark:text-slate-400 mb-0.5">Demand requires</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              {totalDemandHours.toFixed(1)} hrs/wk
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- demand inputs */}
      <section className={`${card} overflow-hidden`}>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
              Step 2 — Expected Demand &amp; Limits
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              How many cases per week, and what constrains each specialty?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Leave surgeon hours or equipment cap blank when they are not a limit.
              Priority decides who wins when capacity is short; minimum hours
              protect a specialty from being dropped entirely.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              id="planner-load-defaults"
              onClick={handleLoadDefaults}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-600"
            >
              Load historical demand
            </button>
            <button
              id="planner-add-row"
              onClick={() => setSpecialties(prev => [...prev, { ...BLANK_SPECIALTY }])}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600"
            >
              <Plus className="w-3.5 h-3.5" /> Add specialty
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Specialty</th>
                <th className="py-3 px-3 text-right">Cases/week</th>
                <th className="py-3 px-3 text-right">Avg duration (min)</th>
                <th className="py-3 px-3 text-right">Priority</th>
                <th className="py-3 px-3 text-right">Min hours</th>
                <th className="py-3 px-3 text-right">Surgeon hrs</th>
                <th className="py-3 px-3 text-right">Equip. max cases</th>
                <th className="py-3 px-3 text-right">Needs</th>
                <th className="py-3 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {specialties.map((s, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={s.name}
                      placeholder="Specialty name"
                      onChange={e => setSpecialtyField(i, 'name', e.target.value)}
                      className="w-36 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold focus:ring-1 focus:ring-[#2c6e68] outline-hidden"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={0} value={s.demand_cases}
                      onChange={e => setSpecialtyField(i, 'demand_cases', Number(e.target.value))}
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={1} step={0.1} value={s.avg_duration_min}
                      onChange={e => setSpecialtyField(i, 'avg_duration_min', Number(e.target.value))}
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={0} step={0.5} value={s.priority}
                      onChange={e => setSpecialtyField(i, 'priority', Number(e.target.value))}
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={0} step={0.5} value={s.min_hours}
                      onChange={e => setSpecialtyField(i, 'min_hours', Number(e.target.value))}
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={0} step={0.5} placeholder="—"
                      value={s.surgeon_hours ?? ''}
                      onChange={e =>
                        setSpecialtyField(i, 'surgeon_hours', e.target.value === '' ? null : Number(e.target.value))
                      }
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number" min={0} placeholder="—"
                      value={s.equipment_max_cases ?? ''}
                      onChange={e =>
                        setSpecialtyField(i, 'equipment_max_cases', e.target.value === '' ? null : Number(e.target.value))
                      }
                      className={numberInput}
                    />
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                    {((s.demand_cases * s.avg_duration_min) / 60).toFixed(1)} h
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => setSpecialties(prev => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${s.name || 'row'}`}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
          <button
            id="planner-solve"
            onClick={handleSolve}
            disabled={isSolving}
            className="px-6 py-2.5 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isSolving ? 'animate-spin' : ''}`} />
            {isSolving ? 'Optimizing…' : 'Optimize My Schedule'}
          </button>
          {plan && (
            <button
              onClick={handleExportCsv}
              className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600"
            >
              <Download className="w-3.5 h-3.5" /> Export plan (CSV)
            </button>
          )}
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {error}
            </span>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- results */}
      {plan && (
        <>
          <section className={`${card} p-6`}>
            <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider mb-4">
              Step 3 — Your Optimized Plan
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                label="Cases scheduled"
                value={plan.totals.cases_scheduled.toFixed(0)}
                sub={`of ${plan.totals.cases_demanded.toFixed(0)} demanded`}
                accent
              />
              <Kpi
                label="Demand met"
                value={`${plan.totals.demand_met_pct.toFixed(1)}%`}
                sub={
                  plan.totals.cases_unmet > 0.05
                    ? `${plan.totals.cases_unmet.toFixed(0)} cases unmet`
                    : 'all demand covered'
                }
              />
              <Kpi
                label="Theatre hours used"
                value={plan.totals.total_hours_used.toFixed(1)}
                sub={`${plan.totals.regular_hours_used.toFixed(1)} regular + ${plan.totals.overtime_hours_used.toFixed(1)} overtime`}
              />
              <Kpi
                label="Utilization"
                value={`${plan.totals.utilization_pct.toFixed(1)}%`}
                sub={`of ${plan.capacity.usable_regular_hours.toFixed(0)} usable hrs`}
              />
            </div>

            <div
              className={`mt-5 rounded-lg border p-4 flex gap-3 ${
                plan.bottleneck.startsWith('None')
                  ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
              }`}
            >
              {plan.bottleneck.startsWith('None') ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bottleneck: {plan.bottleneck}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {plan.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-700 dark:text-slate-300 flex gap-2"
                    >
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className={`${card} overflow-hidden`}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Weekly allocation by specialty
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Specialty</th>
                    <th className="py-3 px-4 text-right">Allocate (hrs/wk)</th>
                    <th className="py-3 px-4 text-right">Cases</th>
                    <th className="py-3 px-4 text-right">Demand</th>
                    <th className="py-3 px-4 text-right">Unmet</th>
                    <th className="py-3 px-4">Demand met</th>
                    <th className="py-3 px-4">Limited by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono text-slate-800 dark:text-slate-200">
                  {plan.specialties.map(s => (
                    <tr key={s.name} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                        {s.name}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[#2c6e68] dark:text-teal-300">
                        {s.allocated_hours.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-right">{s.cases_scheduled.toFixed(1)}</td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        {s.demand_cases.toFixed(0)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right ${
                          s.unmet_cases > 0.05
                            ? 'text-amber-600 dark:text-amber-400 font-bold'
                            : 'text-slate-400'
                        }`}
                      >
                        {s.unmet_cases > 0.05 ? s.unmet_cases.toFixed(1) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                s.demand_met_pct >= 99.5
                                  ? 'bg-emerald-500'
                                  : s.demand_met_pct >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, s.demand_met_pct)}%` }}
                            />
                          </div>
                          <span className="text-[11px]">{s.demand_met_pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.limiting_factor === 'demand fully met'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}
                        >
                          {s.limiting_factor}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; sub: string; accent?: boolean }> = ({
  label,
  value,
  sub,
  accent,
}) => (
  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
      {label}
    </div>
    <div
      className={`text-2xl font-extrabold font-mono ${
        accent ? 'text-[#2c6e68] dark:text-teal-400' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {value}
    </div>
    <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
  </div>
);
