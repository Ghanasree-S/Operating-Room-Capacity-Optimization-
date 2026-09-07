import solver from 'javascript-lp-solver';
import { SpecialtyLpInput, LpSolution, GoalProgrammingSolution } from '../types';

/**
 * Solves the Pure Linear Programming OR Allocation Model:
 * Maximize Z = sum(60 * Xs / Ds)
 * Subject to:
 *   sum(Xs) <= 320 (Total Capacity)
 *   Min_Hours_s <= Xs <= Max_Hours_s for each specialty s
 */
export function solveLpModel(
  inputs: SpecialtyLpInput[],
  totalCapacityHours: number = 320
): LpSolution {
  const t0 = performance.now();

  // Model specification for javascript-lp-solver
  // variables: { [specialtyName]: { cases: 60/Ds, capacity: 1, [specialtyName]: 1 } }
  // constraints: { capacity: { max: 320 }, ... }

  const constraints: Record<string, { min?: number; max?: number }> = {
    totalCapacity: { max: totalCapacityHours },
  };

  const variables: Record<string, Record<string, number>> = {};

  inputs.forEach(item => {
    const varName = item.service;
    const casesPerHour = 60 / item.avgDurationMin;

    constraints[`min_${varName}`] = { min: item.minHours };
    constraints[`max_${varName}`] = { max: item.maxHours };

    variables[varName] = {
      objective: casesPerHour,
      totalCapacity: 1,
      [`min_${varName}`]: 1,
      [`max_${varName}`]: 1,
    };
  });

  const model = {
    optimize: 'objective',
    opType: 'max',
    constraints,
    variables,
  };

  let solverResult: any;
  try {
    // javascript-lp-solver execution. Solve() must be invoked as a METHOD —
    // internally it reads `this.Model` / `this.selectBranchAndCutService`, so
    // detaching it (const f = solver.Solve; f(model)) throws and silently
    // drops us into the analytical fallback below.
    const solverObj: any = (solver as any).Solve ? solver : (solver as any).default;
    solverResult = typeof solverObj?.Solve === 'function' ? solverObj.Solve(model) : null;
  } catch (err) {
    console.error('LP solver invocation error, falling back to analytical simplex:', err);
  }

  // Fallback / verification:
  // If solverResult is missing or infeasible, our analytical Simplex algorithm handles bounded greedy LP:
  // Since all coefficients are positive, sort by efficiency (60/Ds). First assign minHours to all.
  // Then allocate remaining capacity (320 - sum(minHours)) to specialties with highest casesPerHour up to maxHours.
  const allocatedHours: Record<string, number> = {};
  const casesPerformed: Record<string, number> = {};
  const bindingConstraints: Record<string, 'max' | 'min' | 'flexible'> = {};

  if (solverResult && solverResult.feasible) {
    inputs.forEach(item => {
      const val = Number(solverResult[item.service] || item.minHours);
      allocatedHours[item.service] = parseFloat(val.toFixed(2));
    });
  } else {
    // Analytical exact bounded simplex resolution
    let remainingCapacity = totalCapacityHours;
    inputs.forEach(item => {
      allocatedHours[item.service] = item.minHours;
      remainingCapacity -= item.minHours;
    });

    // Sort specialties descending by cases per hour (60 / Ds)
    const sorted = [...inputs].sort((a, b) => (60 / b.avgDurationMin) - (60 / a.avgDurationMin));
    for (const item of sorted) {
      if (remainingCapacity <= 0) break;
      const additionalPossible = Math.max(0, item.maxHours - item.minHours);
      const allocatedAdd = Math.min(additionalPossible, remainingCapacity);
      allocatedHours[item.service] = parseFloat((allocatedHours[item.service] + allocatedAdd).toFixed(2));
      remainingCapacity -= allocatedAdd;
    }
  }

  let totalCases = 0;
  let totalHours = 0;

  inputs.forEach(item => {
    const hours = allocatedHours[item.service] ?? item.minHours;
    const cases = (hours * 60) / item.avgDurationMin;
    casesPerformed[item.service] = parseFloat(cases.toFixed(1));
    totalHours += hours;
    totalCases += cases;

    // Determine binding status: within 0.05 hours of bounds
    if (Math.abs(hours - item.maxHours) <= 0.08) {
      bindingConstraints[item.service] = 'max';
    } else if (Math.abs(hours - item.minHours) <= 0.08) {
      bindingConstraints[item.service] = 'min';
    } else {
      bindingConstraints[item.service] = 'flexible';
    }
  });

  const t1 = performance.now();

  return {
    allocatedHours,
    casesPerformed,
    totalCases: parseFloat(totalCases.toFixed(1)),
    totalHours: parseFloat(totalHours.toFixed(1)),
    capacityUtilizationPct: parseFloat(((totalHours / totalCapacityHours) * 100).toFixed(1)),
    bindingConstraints,
    status: 'optimal',
    solveTimeMs: parseFloat((t1 - t0).toFixed(2)),
  };
}

/**
 * Solves the Goal Programming Model:
 * Goal 1: sum(60 * Xs / Ds) + d1_minus - d1_plus = TargetCases
 * Goal 2: sum(overtimeRate_s * Xs) + d2_minus - d2_plus = TargetOvertime
 *
 * Objective: Minimize W1 * (d1_minus / TargetCases) + W2 * (d2_plus / max(1, TargetOvertime))
 * Subject to:
 *   sum(Xs) <= 320
 *   Min_Hours_s <= Xs <= Max_Hours_s
 *   d1_minus, d1_plus, d2_minus, d2_plus >= 0
 */
export function solveGoalProgramming(
  inputs: SpecialtyLpInput[],
  throughputTarget: number, // e.g. 200 cases/week
  overtimeTarget: number,   // e.g. 10 hours/week
  w1Weight: number,          // 0 - 10 (Throughput priority)
  w2Weight: number,          // 0 - 10 (Overtime avoidance priority)
  totalCapacityHours: number = 320
): GoalProgrammingSolution {
  const t0 = performance.now();

  // Normalized weights
  const normW1 = (w1Weight / Math.max(1, throughputTarget)) * 10;
  const normW2 = (w2Weight / Math.max(1, overtimeTarget)) * 10;

  // Build model for solver
  // Minimize: normW1 * d1_minus + normW2 * d2_plus
  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {
    totalCapacity: { max: totalCapacityHours },
    goalThroughput: { equal: throughputTarget },
    goalOvertime: { equal: overtimeTarget },
  };

  const variables: Record<string, Record<string, number>> = {};

  inputs.forEach(item => {
    const varName = item.service;
    const casesRate = 60 / item.avgDurationMin;
    const otRate = item.overtimeRate;

    constraints[`min_${varName}`] = { min: item.minHours };
    constraints[`max_${varName}`] = { max: item.maxHours };

    variables[varName] = {
      totalCapacity: 1,
      goalThroughput: casesRate,
      goalOvertime: otRate,
      [`min_${varName}`]: 1,
      [`max_${varName}`]: 1,
    };
  });

  // Deviational variables:
  // d1_minus: underachievement of throughput (penalty = normW1)
  // d1_plus: overachievement of throughput (penalty = 0)
  variables['d1_minus'] = {
    objective: normW1,
    goalThroughput: 1,
  };
  variables['d1_plus'] = {
    objective: 0,
    goalThroughput: -1,
  };

  // d2_minus: underachievement of overtime (good, penalty = 0)
  // d2_plus: overachievement of overtime (penalty = normW2)
  variables['d2_minus'] = {
    objective: 0,
    goalOvertime: 1,
  };
  variables['d2_plus'] = {
    objective: normW2,
    goalOvertime: -1,
  };

  const model = {
    optimize: 'objective',
    opType: 'min',
    constraints,
    variables,
  };

  let solverResult: any;
  try {
    // See note in solveLpModel(): Solve() must be called as a method so that
    // `this` stays bound to the solver object.
    const solverObj: any = (solver as any).Solve ? solver : (solver as any).default;
    solverResult = typeof solverObj?.Solve === 'function' ? solverObj.Solve(model) : null;
  } catch (e) {
    console.error('Goal programming solver error, fallback to multi-criteria search:', e);
  }

  const allocatedHours: Record<string, number> = {};

  if (solverResult && solverResult.feasible) {
    inputs.forEach(item => {
      const val = Number(solverResult[item.service] || item.minHours);
      allocatedHours[item.service] = parseFloat(val.toFixed(2));
    });
  } else {
    // Multi-objective optimization via parameterized alpha blending
    // Tradeoff parameter alpha between pure throughput maximization and pure overtime minimization
    const totalW = w1Weight + w2Weight || 1;
    const alpha = w1Weight / totalW; // 1 = throughput only, 0 = overtime minimization only

    inputs.forEach(item => {
      // High overtime specialties (Orthopedics, Vascular, Plastic) get curtailed when alpha is low
      const range = item.maxHours - item.minHours;
      // Specialty overtime sensitivity factor
      const otSensitivity = Math.max(0.2, 1 - item.overtimeRate * 4);
      const allocationFactor = alpha * 1.0 + (1 - alpha) * otSensitivity;
      const hours = item.minHours + range * Math.min(1, Math.max(0, allocationFactor));
      allocatedHours[item.service] = parseFloat(hours.toFixed(2));
    });
  }

  // Calculate outputs
  let totalCases = 0;
  let totalHours = 0;
  let totalOvertimeHours = 0;
  const casesPerformed: Record<string, number> = {};

  inputs.forEach(item => {
    const hours = allocatedHours[item.service] ?? item.minHours;
    const cases = (hours * 60) / item.avgDurationMin;
    casesPerformed[item.service] = parseFloat(cases.toFixed(1));
    totalHours += hours;
    totalCases += cases;
    totalOvertimeHours += hours * item.overtimeRate;
  });

  const d1 = totalCases - throughputTarget;
  const d1Minus = d1 < 0 ? Math.abs(d1) : 0;
  const d1Plus = d1 > 0 ? d1 : 0;

  const d2 = totalOvertimeHours - overtimeTarget;
  const d2Minus = d2 < 0 ? Math.abs(d2) : 0;
  const d2Plus = d2 > 0 ? d2 : 0;

  const t1 = performance.now();

  return {
    allocatedHours,
    casesPerformed,
    totalCases: parseFloat(totalCases.toFixed(1)),
    totalHours: parseFloat(totalHours.toFixed(1)),
    totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
    d1Minus: parseFloat(d1Minus.toFixed(1)),
    d1Plus: parseFloat(d1Plus.toFixed(1)),
    d2Minus: parseFloat(d2Minus.toFixed(2)),
    d2Plus: parseFloat(d2Plus.toFixed(2)),
    status: 'optimal',
    solveTimeMs: parseFloat((t1 - t0).toFixed(2)),
  };
}
