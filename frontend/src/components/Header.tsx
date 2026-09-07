import React from 'react';
import { ActiveTab } from '../types';
import { RefreshCw, Download, FileSpreadsheet, Clock, Sliders } from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  onResetData: () => void;
  onExportExcel: () => void;
  totalCases: number;
  avgUtilization: number;
}

const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Operating Room Overview & Executive Utilization',
    subtitle: 'Aggregate performance across 8 suites, 10 specialties, and 2,172 surgical cases',
  },
  statistics: {
    title: 'Operating Room Statistics Explorer',
    subtitle: 'On-demand query engine for specific OR suites and surgical services',
  },
  lp_model: {
    title: 'Linear Programming Block Allocation Model',
    subtitle: 'Maximize weekly surgical throughput subject to 320-hour capacity and specialty demand caps',
  },
  goal_programming: {
    title: 'Goal Programming Multi-Criteria Formulation',
    subtitle: 'Balanced decision model trading off throughput targets vs staffing overtime minimization',
  },
  insights: {
    title: 'Operations Research Insights & Findings',
    subtitle: 'Critical managerial conclusions on OR bottleneck dynamics and block scheduling',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onResetData,
  onExportExcel,
  totalCases,
  avgUtilization,
}) => {
  const current = TAB_TITLES[activeTab];

  return (
    <header
      id="main-app-header"
      className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 transition-colors"
    >
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#2c6e68] dark:text-teal-400 mb-1">
          <span>HOSPITAL OR OPERATIONS RESEARCH</span>
          <span>/</span>
          <span className="uppercase text-slate-500 dark:text-slate-400">{activeTab.replace('_', ' ')}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          {current.title}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {current.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Live operational indicators */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Weekly Capacity:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">320 hrs</span>
          </div>
          <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span>Overall Util:</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {avgUtilization.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <button
          id="header-export-btn"
          onClick={onExportExcel}
          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
          title="Export current workbook to Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#2c6e68] dark:text-teal-400" />
          <span>Export Excel</span>
        </button>

        <button
          id="header-reset-btn"
          onClick={onResetData}
          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
          title="Reset dataset and model parameters to hospital baseline"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Reset Baseline</span>
        </button>
      </div>
    </header>
  );
};
