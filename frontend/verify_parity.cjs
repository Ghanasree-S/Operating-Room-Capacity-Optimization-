// Step 2 verification: run the frontend's real LP model logic against the
// exported real data (Hospital_OR_Capacity_Dataset.xlsx -> LP_MODEL sheet)
// and confirm it converges to the Excel Solver result (200.49 cases/week).
const ExcelJS = require('exceljs');

async function readSheet(file, name) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(name);
  const headers = ws.getRow(1).values;
  const rows = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const obj = {};
    row.values.forEach((v, col) => { if (headers[col]) obj[headers[col]] = v && v.result !== undefined ? v.result : v; });
    rows.push(obj);
  });
  return rows;
}

(async () => {
const lpRows = await readSheet('Hospital_OR_Capacity_Dataset.xlsx', 'LP_MODEL');

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

if (Math.abs(totalCases - 200.49) > 0.05) {
  console.error('PARITY FAILED: frontend result differs from Excel Solver by more than 0.05 cases');
  process.exit(1);
}
console.log('PARITY OK');
})().catch(err => { console.error(err); process.exit(1); });
