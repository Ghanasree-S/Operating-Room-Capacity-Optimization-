import React, { useRef } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Binary,
  Target,
  FileSpreadsheet,
  Upload,
  Download,
  Moon,
  Sun,
  Lightbulb,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onExportExcel: () => void;
  onImportExcel: (file: File) => void;
  caseCount: number;
  suiteCount: number;
  specialtyCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isDark,
  onToggleTheme,
  onExportExcel,
  onImportExcel,
  caseCount,
  suiteCount,
  specialtyCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    {
      id: 'overview' as ActiveTab,
      label: 'Overview Dashboard',
      sublabel: 'Capacity & utilization metrics',
      icon: LayoutDashboard,
    },
    {
      id: 'statistics' as ActiveTab,
      label: 'Statistics Explorer',
      sublabel: 'On-demand suite & service queries',
      icon: BarChart3,
    },
    {
      id: 'lp_model' as ActiveTab,
      label: 'Linear Programming',
      sublabel: 'Throughput optimization model',
      icon: Binary,
    },
    {
      id: 'goal_programming' as ActiveTab,
      label: 'Goal Programming',
      sublabel: 'Throughput vs overtime trade-off',
      icon: Target,
    },
    {
      id: 'insights' as ActiveTab,
      label: 'Insights & Findings',
      sublabel: 'Bottlenecks & OR policy review',
      icon: Lightbulb,
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportExcel(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <aside
      id="sidebar-navigation"
      className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between h-screen sticky top-0 transition-colors select-none"
    >
      {/* Brand & Organization */}
      <div>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2c6e68] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <Building2 className="w-5 h-5 text-teal-100" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-[#2c6e68] dark:text-teal-400 uppercase">
                Surgical Services Analytics
              </div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
                OR Capacity Optimizer
              </h1>
            </div>
          </div>

          {/* Model Status Pill */}
          <div className="mt-3.5 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              OR Solver Engine
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">v3.2 Simplex</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Operational Modules
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-all ${
                  isActive
                    ? 'bg-[#2c6e68] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold">{item.label}</div>
                  <div
                    className={`truncate text-[10px] leading-tight ${
                      isActive ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.sublabel}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer & Data Backend controls */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
        {/* Data Backend Status */}
        <div className="bg-white dark:bg-slate-800/80 rounded-lg p-3 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            <span className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#2c6e68] dark:text-teal-400" />
              Excel Data Backend
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px] pt-1 border-t border-slate-100 dark:border-slate-700">
            <div>
              <div className="text-slate-900 dark:text-slate-100 font-bold">{caseCount.toLocaleString()}</div>
              <div className="text-[9px] text-slate-400">Cases</div>
            </div>
            <div>
              <div className="text-slate-900 dark:text-slate-100 font-bold">{suiteCount}</div>
              <div className="text-[9px] text-slate-400">Suites</div>
            </div>
            <div>
              <div className="text-slate-900 dark:text-slate-100 font-bold">{specialtyCount}</div>
              <div className="text-[9px] text-slate-400">Services</div>
            </div>
          </div>
        </div>

        {/* Excel Actions */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls"
            className="hidden"
          />
          <button
            id="sidebar-upload-excel-btn"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Upload an Excel workbook with RAW_DATA, STATS, LP_MODEL"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Upload</span>
          </button>
          <button
            id="sidebar-export-excel-btn"
            onClick={onExportExcel}
            className="px-2.5 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Download active dataset as multi-sheet .xlsx"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Export</span>
          </button>
        </div>

        {/* Theme Toggle & System Info */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            id="theme-toggle-btn"
            onClick={onToggleTheme}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            <span>{isDark ? 'Light' : 'Dark'} Mode</span>
          </button>
          <span className="text-[10px] font-mono text-slate-400">Q1 OR-OPS</span>
        </div>
      </div>
    </aside>
  );
};
