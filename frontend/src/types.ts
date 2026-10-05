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

export type ActiveTab =
  | 'overview'
  | 'statistics'
  | 'planner'
  | 'lp_model'
  | 'goal_programming'
  | 'insights';

// ---------------------------------------------------------------- planner
// Forward-looking capacity planning: the hospital supplies its own capacity
// and demand, and the Python backend returns an actionable weekly plan.

export interface PlannerSpecialty {
  name: string;
  demand_cases: number;          // expected cases per week
  avg_duration_min: number;      // average case length
  priority: number;              // relative importance when capacity is short
  min_hours: number;             // guaranteed floor
  surgeon_hours: number | null;  // surgeon availability ceiling, null = no limit
  equipment_max_cases: number | null; // equipment ceiling, null = no limit
}

export interface PlannerCapacity {
  or_suites: number;
  hours_per_day: number;
  days_per_week: number;
  overtime_cap_hours: number;
  emergency_reserve_pct: number;
  overtime_penalty: number;
}

export interface PlanRequest {
  capacity: PlannerCapacity;
  specialties: PlannerSpecialty[];
}

export interface SpecialtyPlanResult {
  name: string;
  allocated_hours: number;
  cases_scheduled: number;
  demand_cases: number;
  unmet_cases: number;
  demand_met_pct: number;
  hours_needed: number;
  limiting_factor: string;
}

export interface PlanResponse {
  status: string;
  bottleneck: string;
  recommendations: string[];
  totals: {
    cases_scheduled: number;
    cases_demanded: number;
    cases_unmet: number;
    demand_met_pct: number;
    regular_hours_used: number;
    overtime_hours_used: number;
    total_hours_used: number;
    utilization_pct: number;
  };
  capacity: {
    regular_hours: number;
    reserved_hours: number;
    usable_regular_hours: number;
    overtime_cap_hours: number;
  };
  specialties: SpecialtyPlanResult[];
}

export interface PlannerDefaults {
  specialties: PlannerSpecialty[];
  observed: {
    or_suites: number;
    total_cases: number;
    weeks: number;
    avg_cases_per_week: number;
    avg_utilization_pct: number;
  };
  note: string;
}

// Decision-variable granularity for the optimization models.
// 'specialty' — one variable per surgical service (10 variables)
// 'procedure' — one variable per (Service, CPT Code) pair (32 variables),
//               the faculty-requested refinement: a single average duration
//               per specialty hides real procedure-mix variance.
export type LpGranularity = 'specialty' | 'procedure';
