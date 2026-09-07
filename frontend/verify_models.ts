// Step 5 validation (README.md §9): exercise the REAL production solver code
// (src/solver/lpSolver.ts) against the REAL decision-variable sets
// (src/data/dataset.ts) at both granularities, and check the results against
// the Excel Solver baseline.
//
// Run with:  npx tsx verify_models.ts
import { SPECIALTY_CONFIGS, PROCEDURE_CONFIGS, REAL_TARGET_OVERTIME_HOURS } from './src/data/dataset';
import { solveLpModel, solveGoalProgramming } from './src/solver/lpSolver';
import { SpecialtyLpInput } from './src/types';

const CAPACITY = 320;
const EXCEL_BASELINE_CASES = 200.49;
const THROUGHPUT_TARGET = 200;

let failures = 0;

function check(label: string, condition: boolean, detail: string) {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label} — ${detail}`);
}

function reportLp(name: string, inputs: SpecialtyLpInput[]) {
  console.log(`\n=== LP MODEL: ${name} (${inputs.length} decision variables) ===`);
  const sol = solveLpModel(inputs, CAPACITY);

  const sumMax = inputs.reduce((a, i) => a + i.maxHours, 0);
  const sumMin = inputs.reduce((a, i) => a + i.minHours, 0);

  console.log(`  Status .................. ${sol.status}`);
  console.log(`  Total cases (Z*) ........ ${sol.totalCases.toFixed(2)} cases/week`);
  console.log(`  Total hours allocated ... ${sol.totalHours.toFixed(2)} / ${CAPACITY} hrs`);
  console.log(`  Sum of Min_Hours ........ ${sumMin.toFixed(2)} hrs`);
  console.log(`  Sum of Max_Hours ........ ${sumMax.toFixed(2)} hrs`);
  console.log(`  Solve time .............. ${sol.solveTimeMs}ms`);

  check('solver reached optimality', sol.status === 'optimal', `status=${sol.status}`);
  check(
    'capacity constraint respected',
    sol.totalHours <= CAPACITY + 1e-6,
    `${sol.totalHours.toFixed(2)} <= ${CAPACITY}`
  );
  check(
    'every variable within [min, max] bounds',
    inputs.every(i => {
      const x = sol.allocatedHours[i.service];
      return x >= i.minHours - 1e-6 && x <= i.maxHours + 1e-6;
    }),
    'all Xs within historical demand bounds'
  );
  check(
    'capacity is non-binding (the key project finding)',
    sol.totalHours < CAPACITY,
    `slack = ${(CAPACITY - sol.totalHours).toFixed(2)} hrs unused`
  );

  return sol;
}

// ---------------------------------------------------------------- LP models
const specialtySol = reportLp('By Specialty', SPECIALTY_CONFIGS);
check(
  'specialty-level result matches Excel Solver baseline',
  Math.abs(specialtySol.totalCases - EXCEL_BASELINE_CASES) < 0.5,
  `${specialtySol.totalCases.toFixed(2)} vs Excel ${EXCEL_BASELINE_CASES} (diff ${Math.abs(specialtySol.totalCases - EXCEL_BASELINE_CASES).toFixed(2)})`
);

const procedureSol = reportLp('By Procedure (Service + CPT)', PROCEDURE_CONFIGS);

console.log('\n=== GRANULARITY COMPARISON (at full 320 hr capacity) ===');
const delta = procedureSol.totalCases - specialtySol.totalCases;
console.log(`  By Specialty ............ ${specialtySol.totalCases.toFixed(2)} cases/week (${SPECIALTY_CONFIGS.length} vars)`);
console.log(`  By Procedure ............ ${procedureSol.totalCases.toFixed(2)} cases/week (${PROCEDURE_CONFIGS.length} vars)`);
console.log(`  Difference .............. ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} cases/week`);
console.log('  Identical, and that is mathematically expected: with 320 hrs of');
console.log('  capacity against ~152 hrs of demand, capacity never binds, so every');
console.log('  variable simply goes to its own max bound. Splitting a specialty into');
console.log('  its procedures splits that same max bound into parts that sum back to');
console.log('  the same total case count. Granularity cannot change the answer when');
console.log('  the solver never has to CHOOSE between variables.');

// Where the refinement actually pays off: once capacity binds, the solver must
// choose what to fund. A specialty-level model can only pick whole specialties
// using one blended average duration; a procedure-level model can favour the
// short, high-throughput procedures INSIDE a specialty. That is precisely the
// blind spot the faculty feedback identified.
const TIGHT_CAPACITY = 110; // below the ~152 hrs of total max demand
console.log(`\n=== GRANULARITY COMPARISON (capacity constrained to ${TIGHT_CAPACITY} hrs) ===`);
const tightSpecialty = solveLpModel(SPECIALTY_CONFIGS, TIGHT_CAPACITY);
const tightProcedure = solveLpModel(PROCEDURE_CONFIGS, TIGHT_CAPACITY);
const tightDelta = tightProcedure.totalCases - tightSpecialty.totalCases;
console.log(`  By Specialty ............ ${tightSpecialty.totalCases.toFixed(2)} cases/week`);
console.log(`  By Procedure ............ ${tightProcedure.totalCases.toFixed(2)} cases/week`);
console.log(`  Difference .............. ${tightDelta >= 0 ? '+' : ''}${tightDelta.toFixed(2)} cases/week`);
console.log('  Under scarcity the procedure-level model can prioritise short, high-');
console.log('  throughput procedures within a specialty instead of treating the whole');
console.log('  specialty as one averaged block — this is the value of the refinement.');

check(
  'procedure-level model is at least as good under scarce capacity',
  tightProcedure.totalCases >= tightSpecialty.totalCases - 1e-6,
  `${tightProcedure.totalCases.toFixed(2)} >= ${tightSpecialty.totalCases.toFixed(2)}`
);

// ---------------------------------------------------- Goal Programming model
console.log(`\n=== GOAL PROGRAMMING (target ${THROUGHPUT_TARGET} cases, overtime ${REAL_TARGET_OVERTIME_HOURS} hrs/wk) ===`);
const gp = solveGoalProgramming(
  SPECIALTY_CONFIGS,
  THROUGHPUT_TARGET,
  REAL_TARGET_OVERTIME_HOURS,
  6,
  6,
  CAPACITY
);
console.log(`  Status .................. ${gp.status}`);
console.log(`  Total cases achieved .... ${gp.totalCases.toFixed(2)} cases/week`);
console.log(`  Total hours allocated ... ${gp.totalHours.toFixed(2)} / ${CAPACITY} hrs`);
console.log(`  Total overtime .......... ${gp.totalOvertimeHours.toFixed(4)} hrs/week`);
console.log(`  d1- (throughput short) .. ${gp.d1Minus.toFixed(4)}`);
console.log(`  d1+ (throughput over) ... ${gp.d1Plus.toFixed(4)}`);
console.log(`  d2- (overtime under) .... ${gp.d2Minus.toFixed(4)}`);
console.log(`  d2+ (overtime overrun) .. ${gp.d2Plus.toFixed(4)}`);
console.log(`  Solve time .............. ${gp.solveTimeMs}ms`);

check('goal programming solved', gp.status === 'optimal' || gp.status === 'feasible', `status=${gp.status}`);
check(
  'capacity constraint respected',
  gp.totalHours <= CAPACITY + 1e-6,
  `${gp.totalHours.toFixed(2)} <= ${CAPACITY}`
);
check(
  'deviation variables are non-negative',
  gp.d1Minus >= -1e-9 && gp.d1Plus >= -1e-9 && gp.d2Minus >= -1e-9 && gp.d2Plus >= -1e-9,
  'all d >= 0'
);
check(
  'throughput goal equation balances',
  Math.abs(gp.totalCases + gp.d1Minus - gp.d1Plus - THROUGHPUT_TARGET) < 0.01,
  `cases + d1- - d1+ = ${(gp.totalCases + gp.d1Minus - gp.d1Plus).toFixed(2)} (target ${THROUGHPUT_TARGET})`
);
check(
  'overtime goal equation balances',
  Math.abs(gp.totalOvertimeHours + gp.d2Minus - gp.d2Plus - REAL_TARGET_OVERTIME_HOURS) < 0.01,
  `overtime + d2- - d2+ = ${(gp.totalOvertimeHours + gp.d2Minus - gp.d2Plus).toFixed(4)} (target ${REAL_TARGET_OVERTIME_HOURS})`
);
check(
  'only one side of each goal pair is active',
  gp.d1Minus * gp.d1Plus < 1e-6 && gp.d2Minus * gp.d2Plus < 1e-6,
  'no goal has both under- and over-achievement simultaneously'
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
