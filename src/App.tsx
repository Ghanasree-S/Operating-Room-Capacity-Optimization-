import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ActiveTab, SurgicalCase, SuiteDateStat, SpecialtyLpInput, LpSolution, GoalProgrammingSolution, LpGranularity } from './types';
import { generateHospitalData, exportDatasetToExcel, parseExcelWorkbook, getLpInputsFor, REAL_TARGET_OVERTIME_HOURS } from './data/dataset';
import { solveLpModel, solveGoalProgramming } from './solver/lpSolver';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewDashboard } from './components/OverviewDashboard';
import { StatisticsExplorer } from './components/StatisticsExplorer';
import { LinearProgrammingSection } from './components/LinearProgrammingSection';
import { GoalProgrammingSection } from './components/GoalProgrammingSection';
import { InsightsSection } from './components/InsightsSection';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isDark, setIsDark] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Master Dataset State (backed by Excel format)
  const initialData = useMemo(() => generateHospitalData(), []);
  const [rawCases, setRawCases] = useState<SurgicalCase[]>(initialData.rawCases);
  const [stats, setStats] = useState<SuiteDateStat[]>(initialData.stats);
  const [lpInputs, setLpInputs] = useState<SpecialtyLpInput[]>(initialData.lpInputs);

  // Decision-variable granularity: 'specialty' (10 vars) or 'procedure'
  // (32 vars, per Service+CPT — the faculty-requested refinement).
  const [granularity, setGranularity] = useState<LpGranularity>('specialty');

  // Optimization solutions state
  const [lpSolution, setLpSolution] = useState<LpSolution | null>(null);
  const [gpSolution, setGpSolution] = useState<GoalProgrammingSolution | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronize dark mode class on document element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Solve models on initial load or data change
  useEffect(() => {
    const lpSol = solveLpModel(lpInputs, 320);
    setLpSolution(lpSol);

    const gpSol = solveGoalProgramming(lpInputs, 200, REAL_TARGET_OVERTIME_HOURS, 6, 6, 320);
    setGpSolution(gpSol);
  }, [lpInputs]);

  // Flash notification helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Excel Export Handler
  const handleExportExcel = useCallback(() => {
    exportDatasetToExcel({ rawCases, stats, lpInputs });
    showToast('Hospital Excel dataset exported successfully (RAW_DATA, STATS, LP_MODEL).');
  }, [rawCases, stats, lpInputs, showToast]);

  // Excel Import Handler
  const handleImportExcel = useCallback(async (file: File) => {
    try {
      const parsed = await parseExcelWorkbook(file);
      let updatedCount = 0;
      if (parsed.rawCases && parsed.rawCases.length > 0) {
        setRawCases(parsed.rawCases);
        updatedCount += parsed.rawCases.length;
      }
      if (parsed.stats && parsed.stats.length > 0) {
        setStats(parsed.stats);
      }
      if (parsed.lpInputs && parsed.lpInputs.length > 0) {
        setLpInputs(parsed.lpInputs);
      }
      showToast(`Successfully parsed and loaded ${file.name} (${updatedCount} cases loaded).`);
    } catch (err) {
      console.error('Failed to import Excel:', err);
      showToast('Error parsing Excel workbook. Please ensure sheets match RAW_DATA, STATS, LP_MODEL.');
    }
  }, [showToast]);

  // Reset to original Q1 hospital baseline (keeps the current granularity)
  const handleResetData = useCallback(() => {
    const fresh = generateHospitalData(granularity);
    setRawCases(fresh.rawCases);
    setStats(fresh.stats);
    setLpInputs(fresh.lpInputs);
    const lpSol = solveLpModel(fresh.lpInputs, 320);
    setLpSolution(lpSol);
    const gpSol = solveGoalProgramming(fresh.lpInputs, 200, REAL_TARGET_OVERTIME_HOURS, 6, 6, 320);
    setGpSolution(gpSol);
    showToast('Reset dataset and bounds to Q1 hospital baseline (2,172 cases).');
  }, [granularity, showToast]);

  // Switch decision-variable granularity and reload the matching bounds.
  // The solve effect below re-runs both models automatically on lpInputs change.
  const handleGranularityChange = useCallback((next: LpGranularity) => {
    if (next === granularity) return;
    setGranularity(next);
    const nextInputs = getLpInputsFor(next);
    setLpInputs(nextInputs);
    showToast(
      next === 'procedure'
        ? `Switched to procedure-level model: ${nextInputs.length} decision variables (Service + CPT).`
        : `Switched to specialty-level model: ${nextInputs.length} decision variables.`
    );
  }, [granularity, showToast]);

  // Overall utilization calculation
  const overallAvgUtil = useMemo(() => {
    if (stats.length === 0) return 46.0;
    const sum = stats.reduce((acc, s) => acc + s.utilizationPct, 0);
    return parseFloat((sum / stats.length).toFixed(1));
  }, [stats]);

  const uniqueSuites = useMemo(() => new Set(rawCases.map(c => c.orSuite)).size, [rawCases]);
  const uniqueSpecialties = useMemo(() => new Set(rawCases.map(c => c.service)).size, [rawCases]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans antialiased transition-colors">
      {/* Left Persistent Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isDark={isDark}
        onToggleTheme={() => setIsDark(prev => !prev)}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        caseCount={rawCases.length}
        suiteCount={uniqueSuites}
        specialtyCount={uniqueSpecialties}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onResetData={handleResetData}
          onExportExcel={handleExportExcel}
          totalCases={rawCases.length}
          avgUtilization={overallAvgUtil}
        />

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Section Router */}
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewDashboard
              rawCases={rawCases}
              stats={stats}
              lpInputs={lpInputs}
              isDark={isDark}
            />
          )}

          {activeTab === 'statistics' && (
            <StatisticsExplorer
              rawCases={rawCases}
              stats={stats}
              isDark={isDark}
            />
          )}

          {activeTab === 'lp_model' && (
            <LinearProgrammingSection
              lpInputs={lpInputs}
              onUpdateInputs={setLpInputs}
              onResetDefaults={() => setLpInputs(getLpInputsFor(granularity))}
              lpSolution={lpSolution}
              onSolveSuccess={setLpSolution}
              granularity={granularity}
              onGranularityChange={handleGranularityChange}
            />
          )}

          {activeTab === 'goal_programming' && (
            <GoalProgrammingSection
              lpInputs={lpInputs}
              lpSolution={lpSolution}
              gpSolution={gpSolution}
              onSolveSuccess={setGpSolution}
            />
          )}

          {activeTab === 'insights' && (
            <InsightsSection
              lpSolution={lpSolution}
              gpSolution={gpSolution}
            />
          )}
        </main>
      </div>
    </div>
  );
}
