// Thin wrapper over exceljs that works with plain row objects, so the rest of
// the app never touches the library directly. exceljs is loaded on demand to
// keep it out of the initial bundle.

export type Row = Record<string, string | number | null>;

export interface SheetData {
  name: string;
  rows: Row[];
}

async function loadExcelJs() {
  const mod = await import('exceljs');
  return (mod as any).default ?? mod;
}

/** Read every worksheet into an array of row objects keyed by the header row. */
export async function readWorkbook(buffer: ArrayBuffer): Promise<Record<string, Row[]>> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheets: Record<string, Row[]> = {};
  wb.eachSheet((ws: any) => {
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell: any, col: number) => {
      headers[col] = String(cell.text ?? '').trim();
    });

    const rows: Row[] = [];
    ws.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      const obj: Row = {};
      headers.forEach((h, col) => {
        if (!h) return;
        const v = row.getCell(col).value;
        obj[h] = cellToPrimitive(v);
      });
      rows.push(obj);
    });
    sheets[ws.name] = rows;
  });
  return sheets;
}

function cellToPrimitive(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return cellToPrimitive(o.result); // formula
    if ('text' in o) return String(o.text); // hyperlink
    if (Array.isArray(o.richText)) return o.richText.map((t: any) => t.text).join('');
  }
  return String(v);
}

/** Build a workbook from row objects and trigger a browser download. */
export async function downloadWorkbook(sheets: SheetData[], filename: string): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const ws = wb.addWorksheet(name);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    ws.columns = headers.map(h => ({ header: h, key: h, width: Math.max(12, h.length + 2) }));
    ws.addRows(rows);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
