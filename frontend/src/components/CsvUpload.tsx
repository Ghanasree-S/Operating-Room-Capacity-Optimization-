import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { PlannerSpecialty, CsvInspection, CsvProcessResult } from '../types';
import { inspectCsv, processCsv, PlannerApiError } from '../api/plannerApi';

interface Props {
  onApply: (specialties: PlannerSpecialty[]) => void;
  onConnectionError: () => void;
}

/** Roles the importer understands. Only `service` plus a duration source is
 *  required; the rest are carried for context. */
const ROLES: { key: string; label: string; hint: string }[] = [
  { key: 'service', label: 'Specialty', hint: 'required' },
  { key: 'duration', label: 'Case duration (min)', hint: 'or map start + end' },
  { key: 'start_time', label: 'Start time', hint: 'if no duration column' },
  { key: 'end_time', label: 'End time', hint: 'if no duration column' },
  { key: 'date', label: 'Date', hint: 'sets the period covered' },
  { key: 'or_suite', label: 'OR suite / theatre', hint: 'optional' },
  { key: 'cpt_code', label: 'Procedure code', hint: 'optional' },
];

const selectCls =
  'w-full px-2 py-1.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs focus:ring-1 focus:ring-[#2c6e68] outline-hidden';

export const CsvUpload: React.FC<Props> = ({ onApply, onConnectionError }) => {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<CsvInspection | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [weeksOverride, setWeeksOverride] = useState<string>('');
  const [result, setResult] = useState<CsvProcessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setInspection(null);
    setMapping({});
    setResult(null);
    setError(null);
    setWeeksOverride('');
  };

  const handleFile = useCallback(
    async (picked: File) => {
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const data = await inspectCsv(picked);
        setFile(picked);
        setInspection(data);
        setMapping(data.suggested_mapping);
      } catch (err) {
        if (err instanceof PlannerApiError && err.isConnectionError) onConnectionError();
        setError(err instanceof Error ? err.message : 'Could not read that file');
      } finally {
        setBusy(false);
      }
    },
    [onConnectionError]
  );

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const weeks = weeksOverride.trim() === '' ? null : Number(weeksOverride);
      setResult(await processCsv(file, mapping, weeks));
    } catch (err) {
      if (err instanceof PlannerApiError && err.isConnectionError) onConnectionError();
      setError(err instanceof Error ? err.message : 'Could not process that file');
    } finally {
      setBusy(false);
    }
  }, [file, mapping, weeksOverride, onConnectionError]);

  const errors = result?.issues.filter(i => i.level === 'error') ?? [];
  const warnings = result?.issues.filter(i => i.level === 'warning') ?? [];

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="text-xs font-semibold text-[#2c6e68] dark:text-teal-400 uppercase tracking-wider">
          Optional — Import Your Own Data
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Upload a theatre export to fill the demand table
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Any CSV will do — your column names do not need to match ours. We read
          the file, guess which column is which, and let you correct it before
          anything is used.
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* ------------------------------------------------- drop zone */}
        {!inspection && (
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFile(dropped);
            }}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? 'border-[#2c6e68] bg-teal-50 dark:bg-teal-950/20'
                : 'border-slate-300 dark:border-slate-600'
            }`}
          >
            <UploadCloud className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Drop a CSV here
            </p>
            <p className="text-xs text-slate-500 mb-3">or</p>
            <button
              id="csv-choose-file"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Reading…' : 'Choose file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* ------------------------------------------ mapping + preview */}
        {inspection && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {inspection.filename}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {inspection.row_count.toLocaleString()} rows ·{' '}
                    {inspection.columns.length} columns
                  </div>
                </div>
              </div>
              <button
                onClick={reset}
                aria-label="Remove file"
                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Confirm which of your columns is which
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ROLES.map(role => (
                  <div key={role.key}>
                    <label
                      className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 flex justify-between gap-2"
                      htmlFor={`map-${role.key}`}
                    >
                      <span>{role.label}</span>
                      <span className="text-slate-400 font-normal">{role.hint}</span>
                    </label>
                    <select
                      id={`map-${role.key}`}
                      value={mapping[role.key] ?? ''}
                      onChange={e =>
                        setMapping(prev => ({
                          ...prev,
                          [role.key]: e.target.value === '' ? null : e.target.value,
                        }))
                      }
                      className={selectCls}
                    >
                      <option value="">— not in my file —</option>
                      {inspection.columns.map(col => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div>
                  <label
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 flex justify-between gap-2"
                    htmlFor="map-weeks"
                  >
                    <span>Weeks covered</span>
                    <span className="text-slate-400 font-normal">auto from dates</span>
                  </label>
                  <input
                    id="map-weeks"
                    type="number"
                    min={0.1}
                    step={0.5}
                    placeholder="auto"
                    value={weeksOverride}
                    onChange={e => setWeeksOverride(e.target.value)}
                    className={selectCls}
                  />
                </div>
              </div>
            </div>

            {/* preview of the first rows, so the mapping can be sanity-checked */}
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                First rows of your file
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {inspection.columns.map(col => (
                        <th
                          key={col}
                          className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono text-slate-700 dark:text-slate-300">
                    {inspection.sample.map((row, i) => (
                      <tr key={i}>
                        {inspection.columns.map(col => (
                          <td key={col} className="py-1.5 px-3 whitespace-nowrap">
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                id="csv-process"
                onClick={handleProcess}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Checking…' : 'Check & summarise'}
              </button>
              {error && (
                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> {error}
                </span>
              )}
            </div>
          </>
        )}

        {/* ------------------------------------------------- validation */}
        {result && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap gap-4 text-xs font-mono pt-4">
              <span className="text-slate-500">
                Rows read:{' '}
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {result.rows_read.toLocaleString()}
                </span>
              </span>
              <span className="text-slate-500">
                Used:{' '}
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {result.rows_used.toLocaleString()}
                </span>
              </span>
              <span className="text-slate-500">
                Period:{' '}
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {result.weeks_covered} weeks
                </span>
                {result.date_range && (
                  <span className="text-slate-400">
                    {' '}
                    ({result.date_range[0]} → {result.date_range[1]})
                  </span>
                )}
              </span>
            </div>

            {errors.map((issue, i) => (
              <div
                key={`e${i}`}
                className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-2.5 text-xs text-red-800 dark:text-red-200 flex gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </div>
            ))}

            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {warnings.length} data {warnings.length === 1 ? 'issue' : 'issues'} found
                </div>
                <ul className="space-y-1">
                  {warnings.map((issue, i) => (
                    <li key={`w${i}`} className="text-xs text-amber-800 dark:text-amber-200/90">
                      • {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!result.has_errors && result.specialties.length > 0 && (
              <>
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-3">
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {result.specialties.length} specialties derived
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="text-emerald-800 dark:text-emerald-300">
                        <tr>
                          <th className="py-1 pr-4 font-semibold">Specialty</th>
                          <th className="py-1 pr-4 text-right font-semibold">Cases/week</th>
                          <th className="py-1 text-right font-semibold">Avg duration</th>
                        </tr>
                      </thead>
                      <tbody className="text-emerald-900 dark:text-emerald-200">
                        {result.specialties.map(s => (
                          <tr key={s.name}>
                            <td className="py-0.5 pr-4">{s.name}</td>
                            <td className="py-0.5 pr-4 text-right">{s.demand_cases}</td>
                            <td className="py-0.5 text-right">{s.avg_duration_min} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button
                  id="csv-apply"
                  onClick={() => {
                    onApply(result.specialties);
                    reset();
                  }}
                  className="px-5 py-2.5 rounded-lg bg-[#2c6e68] hover:bg-[#245752] text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Use this data in the planner
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
