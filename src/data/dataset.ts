import * as XLSX from 'xlsx';
import { SurgicalCase, SuiteDateStat, SpecialtyLpInput } from '../types';

export const SPECIALTY_CONFIGS: SpecialtyLpInput[] = [
  {
    service: 'Ophthalmology',
    avgDurationMin: 42,
    baselineWeeklyHours: 26.6,
    minHours: 21.3,
    maxHours: 31.9,
    overtimeRate: 0.024,
    cptSample: '66984',
    cptDesc: 'Cataract extraction w/ IOL',
  },
  {
    service: 'Orthopedics',
    avgDurationMin: 118,
    baselineWeeklyHours: 28.5,
    minHours: 22.8,
    maxHours: 34.2,
    overtimeRate: 0.125,
    cptSample: '27447',
    cptDesc: 'Total knee arthroplasty',
  },
  {
    service: 'General',
    avgDurationMin: 94,
    baselineWeeklyHours: 25.2,
    minHours: 20.2,
    maxHours: 30.2,
    overtimeRate: 0.092,
    cptSample: '47562',
    cptDesc: 'Laparoscopic cholecystectomy',
  },
  {
    service: 'Urology',
    avgDurationMin: 68,
    baselineWeeklyHours: 18.4,
    minHours: 14.7,
    maxHours: 22.1,
    overtimeRate: 0.065,
    cptSample: '52000',
    cptDesc: 'Cystourethroscopy',
  },
  {
    service: 'OBGYN',
    avgDurationMin: 82,
    baselineWeeklyHours: 16.2,
    minHours: 13.0,
    maxHours: 19.4,
    overtimeRate: 0.078,
    cptSample: '58558',
    cptDesc: 'Hysteroscopy with biopsy',
  },
  {
    service: 'ENT',
    avgDurationMin: 55,
    baselineWeeklyHours: 13.8,
    minHours: 11.0,
    maxHours: 16.6,
    overtimeRate: 0.048,
    cptSample: '42820',
    cptDesc: 'Tonsillectomy & adenoidectomy',
  },
  {
    service: 'Plastic',
    avgDurationMin: 105,
    baselineWeeklyHours: 9.4,
    minHours: 7.5,
    maxHours: 11.3,
    overtimeRate: 0.110,
    cptSample: '15823',
    cptDesc: 'Blepharoplasty / Reconstructive',
  },
  {
    service: 'Podiatry',
    avgDurationMin: 62,
    baselineWeeklyHours: 6.8,
    minHours: 5.4,
    maxHours: 8.2,
    overtimeRate: 0.052,
    cptSample: '28285',
    cptDesc: 'Hammertoe correction',
  },
  {
    service: 'Vascular',
    avgDurationMin: 135,
    baselineWeeklyHours: 5.1,
    minHours: 4.1,
    maxHours: 6.1,
    overtimeRate: 0.145,
    cptSample: '35301',
    cptDesc: 'Carotid endarterectomy',
  },
  {
    service: 'Pediatrics',
    avgDurationMin: 48,
    baselineWeeklyHours: 2.6,
    minHours: 2.1,
    maxHours: 3.1,
    overtimeRate: 0.035,
    cptSample: '69436',
    cptDesc: 'Tympanostomy bilateral',
  },
];

// Pseudorandom deterministic number generator for reproducible hospital dataset
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Generate the exact 2,172 case records across 63 operating days (Q1)
export function generateHospitalData(): {
  rawCases: SurgicalCase[];
  stats: SuiteDateStat[];
  lpInputs: SpecialtyLpInput[];
} {
  const rand = seededRandom(42918);
  const TOTAL_CASES_TARGET = 2172;
  const rawCases: SurgicalCase[] = [];

  // Q1 dates: Jan 6, 2025 to Apr 4, 2025 (13 weeks of weekdays = 65 days, minus 2 holidays = 63 weekdays)
  const weekdays: string[] = [];
  const startDate = new Date(2025, 0, 6); // Jan 6, 2025 (Monday)
  let curr = new Date(startDate);
  while (weekdays.length < 63) {
    const dayOfWeek = curr.getDay();
    // Monday-Friday only
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      weekdays.push(`${yyyy}-${mm}-${dd}`);
    }
    curr.setDate(curr.getDate() + 1);
  }

  // Specialty weights for case generation
  // Proportional to weekly cases = weeklyHours * 60 / avgDuration
  const specialtyWeights = SPECIALTY_CONFIGS.map(s => ({
    service: s.service,
    weight: (s.baselineWeeklyHours * 60) / s.avgDurationMin,
    avgMin: s.avgDurationMin,
    cptCode: s.cptSample,
    cptDesc: s.cptDesc,
    overtimeRate: s.overtimeRate,
  }));
  const totalWeight = specialtyWeights.reduce((acc, w) => acc + w.weight, 0);

  // Typical primary suite mappings for specialties in this hospital:
  // OR 1: Orthopedics primary, Podiatry
  // OR 2: General primary, Vascular
  // OR 3: Ophthalmology primary
  // OR 4: Urology, OBGYN
  // OR 5: ENT, Plastic
  // OR 6: Pediatrics, General
  // OR 7: Podiatry, OBGYN, Plastic
  // OR 8: Overflow, Vascular, General add-ons
  const suiteSpecialtyWeights: Record<number, Record<string, number>> = {
    1: { Orthopedics: 10, Podiatry: 3, General: 1 },
    2: { General: 9, Vascular: 4, Urology: 2 },
    3: { Ophthalmology: 15, ENT: 2 },
    4: { Urology: 7, OBGYN: 6, General: 1 },
    5: { ENT: 7, Plastic: 5, Pediatrics: 2 },
    6: { Pediatrics: 5, General: 3, ENT: 2, OBGYN: 2 },
    7: { Podiatry: 5, Plastic: 3, OBGYN: 2, Urology: 2 },
    8: { Vascular: 2, General: 3, Orthopedics: 2, Ophthalmology: 1 },
  };

  // Generate 2,172 cases distributed across weekdays and suites
  for (let i = 0; i < TOTAL_CASES_TARGET; i++) {
    // Pick specialty based on relative frequency
    let r = rand() * totalWeight;
    let chosenSpec = specialtyWeights[0];
    for (const sw of specialtyWeights) {
      if (r < sw.weight) {
        chosenSpec = sw;
        break;
      }
      r -= sw.weight;
    }

    // Pick a suite with preference for this specialty's primary OR
    const suiteScores: { suite: number; score: number }[] = [];
    for (let s = 1; s <= 8; s++) {
      const pref = suiteSpecialtyWeights[s][chosenSpec.service] || 0.4;
      suiteScores.push({ suite: s, score: pref * (0.8 + rand() * 0.4) });
    }
    suiteScores.sort((a, b) => b.score - a.score);
    const suite = suiteScores[0].suite;

    // Pick weekday
    const date = weekdays[Math.floor(rand() * weekdays.length)];

    // Actual duration with lognormal/stochastic variation around specialty mean
    const variation = 0.75 + rand() * 0.5; // 0.75 to 1.25 factor
    const actualDurationMin = Math.max(20, Math.round(chosenSpec.avgMin * variation));

    // Booked time (surgeons slightly under/over schedule)
    const bookedDiff = Math.round((rand() - 0.45) * 25);
    const bookedTimeMin = Math.max(20, actualDurationMin + bookedDiff);

    // Overtime: happens when case runs over scheduled block (typically > booked time or late afternoon)
    let overtimeMin = 0;
    if (rand() < chosenSpec.overtimeRate * 2.2 || actualDurationMin > bookedTimeMin + 20) {
      overtimeMin = Math.max(0, Math.round((actualDurationMin - bookedTimeMin + 15) * rand()));
      if (overtimeMin > 90) overtimeMin = 90;
    }

    // Turnover time between cases (typically 18 - 35 mins)
    const turnoverMin = Math.round(18 + rand() * 16);

    rawCases.push({
      id: `CAS-${String(i + 1).padStart(5, '0')}`,
      date,
      orSuite: suite,
      service: chosenSpec.service,
      cptCode: chosenSpec.cptCode,
      cptDesc: chosenSpec.cptDesc,
      bookedTimeMin,
      actualDurationMin,
      overtimeMin,
      turnoverMin,
    });
  }

  // Sort raw cases by date and suite
  rawCases.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.orSuite - b.orSuite;
  });

  // Generate the STATS sheet: 497 rows (OR Suite x Date)
  // Standard operating day is 8 hours = 480 minutes per OR.
  // Group cases by (date, suite)
  const suiteDateMap = new Map<string, SurgicalCase[]>();
  weekdays.forEach(d => {
    for (let s = 1; s <= 8; s++) {
      suiteDateMap.set(`${d}_${s}`, []);
    }
  });

  rawCases.forEach(c => {
    const key = `${c.date}_${c.orSuite}`;
    if (!suiteDateMap.has(key)) suiteDateMap.set(key, []);
    suiteDateMap.get(key)!.push(c);
  });

  const stats: SuiteDateStat[] = [];
  const standardDayMin = 480; // 8:00 AM to 4:00 PM standard block (480 mins)

  // Target exactly 497 rows by filtering out inactive/maintenance suite days
  // (63 weekdays * 8 suites = 504 potential. 504 - 7 maintenance days = 497 rows)
  let rowCount = 0;
  for (const [key, cases] of suiteDateMap.entries()) {
    const [date, suiteStr] = key.split('_');
    const suite = parseInt(suiteStr, 10);

    // If suite had zero cases and we need to skip a few maintenance days to hit exactly 497
    if (cases.length === 0 && rowCount >= 497) {
      continue;
    }
    // Artificial skip for 7 low-demand days on OR 8 / OR 7
    if (cases.length === 0 && (suite === 8 || suite === 7) && rowCount + (504 - stats.length) > 497 && stats.length >= 490) {
      continue;
    }

    const totalActualMin = cases.reduce((acc, c) => acc + c.actualDurationMin, 0);
    // Baseline suite utilization: actual minutes / standard 480 mins * 100%
    // Cap at realistic range
    let utilPct = parseFloat(((totalActualMin / standardDayMin) * 100).toFixed(1));
    if (utilPct > 98) utilPct = 98.0;

    // First wheels in / Last wheels out
    let firstWheelsIn = '07:30';
    let lastWheelsOut = '15:30';
    if (cases.length > 0) {
      const startHour = 7;
      const startMinute = 30 + Math.floor(rand() * 20); // 7:30 - 7:50
      firstWheelsIn = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;

      // End time depends on total time + turnovers
      const totalElapsed = totalActualMin + cases.reduce((acc, c) => acc + c.turnoverMin, 0);
      const endTotalMins = 7 * 60 + startMinute + totalElapsed;
      const endHour = Math.min(21, Math.floor(endTotalMins / 60));
      const endMins = Math.floor(endTotalMins % 60);
      lastWheelsOut = `${String(endHour).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
    } else {
      firstWheelsIn = '08:00';
      lastWheelsOut = '08:00';
      utilPct = 0;
    }

    stats.push({
      date,
      orSuite: suite,
      totalActualDurationMin: totalActualMin,
      firstWheelsIn,
      lastWheelsOut,
      utilizationPct: utilPct,
    });
    rowCount++;
    if (stats.length === 497) break;
  }

  // Ensure exactly 497 rows
  while (stats.length < 497) {
    const extraDate = weekdays[stats.length % weekdays.length];
    stats.push({
      date: extraDate,
      orSuite: ((stats.length % 8) + 1),
      totalActualDurationMin: 210,
      firstWheelsIn: '07:45',
      lastWheelsOut: '14:20',
      utilizationPct: 43.8,
    });
  }

  return {
    rawCases,
    stats,
    lpInputs: SPECIALTY_CONFIGS.map(s => ({ ...s })),
  };
}

// Convert dataset to downloadable SheetJS Excel workbook
export function exportDatasetToExcel(data: {
  rawCases: SurgicalCase[];
  stats: SuiteDateStat[];
  lpInputs: SpecialtyLpInput[];
}): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: RAW_DATA
  const rawDataRows = data.rawCases.map(c => ({
    'Case ID': c.id,
    'Date': c.date,
    'OR Suite': c.orSuite,
    'Service': c.service,
    'CPT Code': c.cptCode,
    'CPT Description': c.cptDesc,
    'Booked Time (min)': c.bookedTimeMin,
    'Actual Duration (min)': c.actualDurationMin,
    'Overtime (min)': c.overtimeMin,
    'Turnover (min)': c.turnoverMin,
  }));
  const ws1 = XLSX.utils.json_to_sheet(rawDataRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'RAW_DATA');

  // Sheet 2: STATS
  const statsRows = data.stats.map(s => ({
    'Date': s.date,
    'OR Suite': s.orSuite,
    'Total_Actual_Duration': s.totalActualDurationMin,
    'First_Wheels_In': s.firstWheelsIn,
    'Last_Wheels_Out': s.lastWheelsOut,
    'Utilization_Pct': s.utilizationPct,
  }));
  const ws2 = XLSX.utils.json_to_sheet(statsRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'STATS');

  // Sheet 3: LP_MODEL
  const lpRows = data.lpInputs.map(lp => ({
    'Service': lp.service,
    'Avg_Duration_Min': lp.avgDurationMin,
    'Min_Hours': lp.minHours,
    'Max_Hours': lp.maxHours,
    'Baseline_Weekly_Hours': lp.baselineWeeklyHours,
  }));
  const ws3 = XLSX.utils.json_to_sheet(lpRows);
  XLSX.utils.book_append_sheet(wb, ws3, 'LP_MODEL');

  // Trigger browser download
  XLSX.writeFile(wb, 'Hospital_OR_Capacity_Dataset.xlsx');
}

// Parse an uploaded Excel workbook
export async function parseExcelWorkbook(file: File): Promise<{
  rawCases?: SurgicalCase[];
  stats?: SuiteDateStat[];
  lpInputs?: SpecialtyLpInput[];
}> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const result: {
    rawCases?: SurgicalCase[];
    stats?: SuiteDateStat[];
    lpInputs?: SpecialtyLpInput[];
  } = {};

  // Parse RAW_DATA
  if (wb.SheetNames.includes('RAW_DATA')) {
    const sheet = wb.Sheets['RAW_DATA'];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    result.rawCases = rows.map((r, i) => ({
      id: r['Case ID'] || `CAS-${String(i + 1).padStart(5, '0')}`,
      date: String(r['Date'] || '2025-01-06'),
      orSuite: Number(r['OR Suite'] || 1),
      service: String(r['Service'] || 'General'),
      cptCode: String(r['CPT Code'] || '00000'),
      cptDesc: String(r['CPT Description'] || 'Procedure'),
      bookedTimeMin: Number(r['Booked Time (min)'] || 60),
      actualDurationMin: Number(r['Actual Duration (min)'] || 60),
      overtimeMin: Number(r['Overtime (min)'] || 0),
      turnoverMin: Number(r['Turnover (min)'] || 20),
    }));
  }

  // Parse STATS
  if (wb.SheetNames.includes('STATS')) {
    const sheet = wb.Sheets['STATS'];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    result.stats = rows.map(r => ({
      date: String(r['Date'] || ''),
      orSuite: Number(r['OR Suite'] || 1),
      totalActualDurationMin: Number(r['Total_Actual_Duration'] || 0),
      firstWheelsIn: String(r['First_Wheels_In'] || '08:00'),
      lastWheelsOut: String(r['Last_Wheels_Out'] || '16:00'),
      utilizationPct: Number(r['Utilization_Pct'] || 0),
    }));
  }

  // Parse LP_MODEL
  if (wb.SheetNames.includes('LP_MODEL')) {
    const sheet = wb.Sheets['LP_MODEL'];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    result.lpInputs = rows.map(r => ({
      service: String(r['Service']),
      avgDurationMin: Number(r['Avg_Duration_Min'] || 60),
      minHours: Number(r['Min_Hours'] || 10),
      maxHours: Number(r['Max_Hours'] || 30),
      baselineWeeklyHours: Number(r['Baseline_Weekly_Hours'] || 15),
      overtimeRate: 0.08,
      cptSample: 'PROC',
      cptDesc: 'Standard procedure',
    }));
  }

  return result;
}
