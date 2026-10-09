'use client';

import type { Workbook, Worksheet, CellValue } from 'exceljs';
import { cellText } from '@/lib/item-cells';
import { deptLabel, type ColumnSpec, type CustomColumn } from '@/lib/item-columns';
import type { GridItem, ImportBody } from '@/types/items';

/**
 * Excel export / import for a lot's Items tab. ExcelJS is large, so it is loaded only
 * when the user actually exports or imports.
 *
 * Sheet layout — the same as the lot's Excel on screen:
 *   row 1   department bands   Details | Decision | Digitalization & Storage | Logging
 *   row 2   column names       Media type · Archive code · …
 *   row 3…  one row per item
 * One sheet per media type (sub-type). Import finds the "Archive code" column by name, so a
 * re-ordered or trimmed sheet still imports; unknown columns are ignored.
 */

type Spec = ColumnSpec & { custom?: CustomColumn };

const loadExcel = async () => (await import('exceljs')).default ?? (await import('exceljs'));

/** Excel sheet names: ≤ 31 chars, none of  \ / ? * [ ] :  — and unique. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Items';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 28)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** The workbook for an export (one sheet per media type) — kept apart from the download so it can be tested. */
export async function buildItemsWorkbook({
  sheets,
  columns,
  refLabel,
}: {
  sheets: { name: string; rows: GridItem[] }[];
  columns: Spec[];
  refLabel: (list: string, value: string | null) => string;
}): Promise<Workbook> {
  const ExcelJS = await loadExcel();
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = 'Archive Tracker';
  const used = new Set<string>();

  for (const sheet of sheets) {
    const ws: Worksheet = wb.addWorksheet(sheetName(sheet.name, used));
    // Row 1 — department bands, merged over their columns.
    let bandStart = 1;
    columns.forEach((c, i) => {
      const next = columns[i + 1];
      const col = i + 1;
      if (col === bandStart) ws.getCell(1, col).value = deptLabel(c.dept);
      if (!next || next.dept !== c.dept) {
        if (col > bandStart) ws.mergeCells(1, bandStart, 1, col);
        bandStart = col + 1;
      }
    });
    // Row 2 — column names.
    columns.forEach((c, i) => {
      ws.getCell(2, i + 1).value = c.label;
      ws.getColumn(i + 1).width = Math.max(10, Math.round(c.width / 7));
    });
    for (const rowNo of [1, 2]) {
      const r = ws.getRow(rowNo);
      r.font = { bold: true };
      r.alignment = { vertical: 'middle', horizontal: rowNo === 1 ? 'center' : 'left' };
      r.border = { bottom: { style: 'thin' } };
    }
    // Data.
    for (const item of sheet.rows) {
      ws.addRow(columns.map((c) => cellText(item, c, refLabel)));
    }
    const codeCol = Math.max(1, columns.findIndex((c) => c.id === 'code') + 1);
    ws.views = [{ state: 'frozen', xSplit: codeCol, ySplit: 2 }];
  }
  return wb;
}

export async function exportItemsToExcel({
  fileName,
  sheets,
  columns,
  refLabel,
}: {
  fileName: string;
  sheets: { name: string; rows: GridItem[] }[];
  columns: Spec[];
  refLabel: (list: string, value: string | null) => string;
}): Promise<void> {
  const wb = await buildItemsWorkbook({ sheets, columns, refLabel });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ import */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const pad2 = (n: number) => String(n).padStart(2, '0');

function textOf(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${pad2(v.getUTCDate())}/${pad2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim(); // hyperlink
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('').trim();
    if ('result' in o) return textOf(o.result as CellValue); // formula
  }
  return '';
}

export interface ParsedWorkbook {
  rows: ImportBody['rows'];
  sheets: number;
  skippedSheets: string[];
}

/** Reads every sheet that has an "Archive code" column. */
export async function readItemsFromExcel(file: File): Promise<ParsedWorkbook> {
  const ExcelJS = await loadExcel();
  const wb: Workbook = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const rows: ImportBody['rows'] = [];
  const skippedSheets: string[] = [];
  let sheets = 0;

  wb.eachSheet((ws) => {
    // The header row is the first of the top 10 rows that has an "Archive code" cell.
    let headerRow = 0;
    let codeCol = 0;
    for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r += 1) {
      for (let c = 1; c <= ws.columnCount; c += 1) {
        if (norm(textOf(ws.getCell(r, c).value)) === 'archive code') {
          headerRow = r;
          codeCol = c;
          break;
        }
      }
    }
    if (!headerRow) {
      skippedSheets.push(ws.name);
      return;
    }
    sheets += 1;
    // Department per column from the row above (merged bands carry forward).
    const keys: string[] = [];
    let dept = '';
    for (let c = 1; c <= ws.columnCount; c += 1) {
      const d = headerRow > 1 ? textOf(ws.getCell(headerRow - 1, c).value) : '';
      if (d) dept = d;
      const label = textOf(ws.getCell(headerRow, c).value);
      keys[c] = label ? `${dept}|${label}` : '';
    }
    for (let r = headerRow + 1; r <= ws.rowCount; r += 1) {
      const code = textOf(ws.getCell(r, codeCol).value);
      if (!code) continue;
      const cells: Record<string, string> = {};
      for (let c = 1; c <= ws.columnCount; c += 1) {
        if (c === codeCol || !keys[c]) continue;
        const t = textOf(ws.getCell(r, c).value);
        if (t) cells[keys[c]!] = t;
      }
      rows.push({ code, cells });
    }
  });

  return { rows, sheets, skippedSheets };
}
