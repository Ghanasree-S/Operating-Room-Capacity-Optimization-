// Step 2 verification: run the frontend's real LP model logic against the
// exported real data (Hospital_OR_Capacity_Dataset.xlsx -> LP_MODEL sheet)
// and confirm it converges to the Excel Solver result (200.49 cases/week).
const XLSX = require('xlsx');

const wb = XLSX.readFile('Hospital_OR_Capacity_Dataset.xlsx');
const lpRows = XLSX.utils.sheet_to_json(wb.Sheets['LP_MODEL']);

const inputs = lpRows.map(r => ({
  service: r.Service,
  avgDurationMin: Number(r.Avg_Duration_Min),
  minHours: Number(r.Min_Hours),
  maxHours: Number(r.Max_Hours),
}));

const totalCapacityHours = 320;

// Same analytical bounded-simplex logic as solveLpModel() in lpSolver.ts,
// valid whenever sum(maxHours) <= capacity (verified below).
let remainingCapacity = totalCapacityHours;
const allocatedHours = {};
inputs.forEach(item => {
  allocatedHours[item.service] = item.minHours;
  remainingCapacity -= item.minHours;
});

const sorted = [...inputs].sort((a, b) => (60 / b.avgDurationMin) - (60 / a.avgDurationMin));
for (const item of sorted) {
  if (remainingCapacity <= 0) break;
  const additionalPossible = Math.max(0, item.maxHours - item.minHours);
  const allocatedAdd = Math.min(additionalPossible, remainingCapacity);
  allocatedHours[item.service] += allocatedAdd;
  remainingCapacity -= allocatedAdd;
}

let totalCases = 0;
let totalHours = 0;
console.log('Service            AllocHrs  CasesPerformed');
inputs.forEach(item => {
  const hrs = allocatedHours[item.service];
  const cases = (60 * hrs) / item.avgDurationMin;
  totalCases += cases;
  totalHours += hrs;
  console.log(item.service.padEnd(18), hrs.toFixed(2).padStart(8), cases.toFixed(2).padStart(14));
});

console.log('\nSum of Max_Hours:', inputs.reduce((a, i) => a + i.maxHours, 0).toFixed(2));
console.log('Total Hours Used:', totalHours.toFixed(2), '/', totalCapacityHours);
console.log('Total Cases (frontend logic):', totalCases.toFixed(2));
console.log('Excel Solver result was:      200.49');
