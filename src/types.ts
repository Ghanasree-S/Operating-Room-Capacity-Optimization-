export interface SurgicalCase {
  id: string;
  date: string; // YYYY-MM-DD
  orSuite: number; // 1-8
  service: string; // 10 specialties
  cptCode: string;
  cptDesc: string;
  bookedTimeMin: number;
  actualDurationMin: number;
  overtimeMin: number;
  turnoverMin: number;
}

export interface SuiteDateStat {
  date: string;
  orSuite: number;
  totalActualDurationMin: number;
  firstWheelsIn: string; // HH:MM
  lastWheelsOut: string; // HH:MM
  utilizationPct: number; // 0 - 100
}

export interface SpecialtyLpInput {
  service: string;
  avgDurationMin: number;
  minHours: number;
  maxHours: number;
  baselineWeeklyHours: number;
  overtimeRate: number; // overtime fraction (e.g. 0.08 = 8%)
  cptSample: string;
  cptDesc: string;
}

export interface LpSolution {
  allocatedHours: Record<string, number>;
  casesPerformed: Record<string, number>;
  totalCases: number;
  totalHours: number;
  capacityUtilizationPct: number;
  bindingConstraints: Record<string, 'max' | 'min' | 'flexible'>;
  status: 'optimal' | 'infeasible' | 'unbounded';
  solveTimeMs: number;
}

export interface GoalProgrammingSolution {
  allocatedHours: Record<string, number>;
  casesPerformed: Record<string, number>;
  totalCases: number;
  totalHours: number;
  totalOvertimeHours: number;
  d1Minus: number; // under-achievement of cases
  d1Plus: number;  // over-achievement of cases
  d2Minus: number; // under-achievement of overtime
  d2Plus: number;  // over-achievement of overtime (overrun)
  status: 'optimal' | 'feasible';
  solveTimeMs: number;
}

export interface SuiteSummary {
  orSuite: number;
  caseCount: number;
  avgActualDuration: number;
  avgBookedTime: number;
  avgOvertime: number;
  avgTurnover: number;
  utilizationPct: number;
  activeDays: number;
  utilizationTier: 'low' | 'medium' | 'high'; // <40%, 40-60%, >60%
}

export interface ServiceSummary {
  service: string;
  caseCount: number;
  avgActualDuration: number;
  avgBookedTime: number;
  avgOvertime: number;
  avgTurnover: number;
  totalHours: number;
  utilizationPct: number;
  activeDays: number;
}

export type ActiveTab = 'overview' | 'statistics' | 'lp_model' | 'goal_programming' | 'insights';
