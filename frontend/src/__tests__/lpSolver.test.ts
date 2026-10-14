import { describe, expect, it } from 'vitest';
import { PROCEDURE_CONFIGS, REAL_TARGET_OVERTIME_HOURS, SPECIALTY_CONFIGS } from '../data/dataset';
import { solveGoalProgramming, solveLpModel } from '../solver/lpSolver';

const EXCEL_BASELINE_CASES = 200.49;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('solveLpModel', () => {
  it('matches the Excel Solver baseline at 320 h (specialty view)', () => {
    const sol = solveLpModel(SPECIALTY_CONFIGS, 320);
    expect(sol.status).toBe('optimal');
    expect(sol.totalCases).toBeCloseTo(EXCEL_BASELINE_CASES, 1);
  });

  it('procedure view (32 vars) also reaches the baseline at 320 h', () => {
    const sol = solveLpModel(PROCEDURE_CONFIGS, 320);
    expect(sol.status).toBe('optimal');
    expect(sol.totalCases).toBeCloseTo(EXCEL_BASELINE_CASES, 0);
  });

  it('leaves capacity non-binding at 320 h (the key project finding)', () => {
    const sol = solveLpModel(SPECIALTY_CONFIGS, 320);
    expect(sol.totalHours).toBeLessThan(320);
  });

  it('respects capacity and every variable bound', () => {
    for (const capacity of [110, 150, 320]) {
      const sol = solveLpModel(SPECIALTY_CONFIGS, capacity);
      expect(sol.totalHours).toBeLessThanOrEqual(capacity + 1e-6);
      for (const s of SPECIALTY_CONFIGS) {
        const h = sol.allocatedHours[s.service];
        expect(h).toBeGreaterThanOrEqual(s.minHours - 1e-6);
        expect(h).toBeLessThanOrEqual(s.maxHours + 1e-6);
      }
    }
  });

  it('fills capacity exactly when capacity is scarce', () => {
    const sol = solveLpModel(SPECIALTY_CONFIGS, 110);
    expect(sol.totalHours).toBeCloseTo(110, 4);
  });

  it('never gets worse as capacity grows', () => {
    let previous = -Infinity;
    for (let capacity = 100; capacity <= 320; capacity += 20) {
      const cases = solveLpModel(SPECIALTY_CONFIGS, capacity).totalCases;
      expect(cases).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = cases;
    }
  });

  it('procedure view is at least as good as specialty view', () => {
    const spec = solveLpModel(SPECIALTY_CONFIGS, 110).totalCases;
    const proc = solveLpModel(PROCEDURE_CONFIGS, 110).totalCases;
    expect(proc).toBeGreaterThanOrEqual(spec - 1e-6);
  });

  it('reports infeasible when minimum hours exceed capacity', () => {
    const minTotal = sum(SPECIALTY_CONFIGS.map(s => s.minHours));
    const sol = solveLpModel(SPECIALTY_CONFIGS, minTotal - 1);
    expect(sol.status).toBe('infeasible');
  });
});

describe('solveGoalProgramming', () => {
  it('meets the throughput goal and balances both goal equations', () => {
    const gp = solveGoalProgramming(SPECIALTY_CONFIGS, 200, REAL_TARGET_OVERTIME_HOURS, 6, 6, 320);
    expect(gp.d1Minus).toBeCloseTo(0, 4);
    expect(gp.totalCases + gp.d1Minus - gp.d1Plus).toBeCloseTo(200, 4);
    expect(gp.totalOvertimeHours + gp.d2Minus - gp.d2Plus).toBeCloseTo(REAL_TARGET_OVERTIME_HOURS, 4);
    expect(gp.totalHours).toBeLessThanOrEqual(320 + 1e-6);
  });

  it('keeps deviations non-negative with at most one side of each goal active', () => {
    const gp = solveGoalProgramming(SPECIALTY_CONFIGS, 200, REAL_TARGET_OVERTIME_HOURS, 6, 6, 320);
    for (const d of [gp.d1Minus, gp.d1Plus, gp.d2Minus, gp.d2Plus]) {
      expect(d).toBeGreaterThanOrEqual(0);
    }
    expect(gp.d1Minus * gp.d1Plus).toBeLessThan(1e-6);
    expect(gp.d2Minus * gp.d2Plus).toBeLessThan(1e-6);
  });
});
