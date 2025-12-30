import ExcelJS from "exceljs";
import { AR_NUM_FMT } from "./constants";
import { getHeadersMap, loadAllRowsOrdered } from "./importer";
import { getNumericColsFromHeader } from "./rows";
import { HistCollectionName } from "./types";

export async function buildExcelBuffer(): Promise<ArrayBuffer> {
  const [rowsBySheet, headers] = await Promise.all([loadAllRowsOrdered(), getHeadersMap()]);

  const workbook = new ExcelJS.Workbook();
  const sheets: HistCollectionName[] = [
    "Ventas_Hist",
    "Estadisticas_CC_Hist",
    "Estadisticas_Productos_Hist",
    "Estadisticas_Grupos_Hist",
    "Estadisticas_FormasPago_Hist",
    "Clientes_Hist"
  ];

  for (const name of sheets) {
    const sheet = workbook.addWorksheet(name);
    const header = headers[name] || inferHeader(rowsBySheet[name]);
    if (header) sheet.addRow(header);
    if (header) sheet.views = [{ state: "frozen", ySplit: 1 }];

    const numericCols = header ? getNumericColsFromHeader(header) : [];

    rowsBySheet[name].forEach((doc) => {
      sheet.addRow(doc.row);
    });

    applyFormats(sheet, name, header, numericCols);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  // Normalize to ArrayBuffer so it's compatible with Web Response/Blob types
  const view = new Uint8Array(buffer as ArrayBufferLike);
  const arrayBuffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(arrayBuffer).set(view);
  return arrayBuffer;
}

function inferHeader(rows: { row: any[] }[]): string[] | null {
  if (!rows.length) return null;
  const maxRow = rows.reduce((acc, cur) => (cur.row.length > acc.row.length ? cur : acc), rows[0]);
  return maxRow.row.map((_, idx) => `Col${idx + 1}`);
}

function applyFormats(
  sheet: ExcelJS.Worksheet,
  name: HistCollectionName,
  header: string[] | null,
  numericCols: number[]
) {
  const headerLower = (header || []).map((h) => String(h || "").trim().toLowerCase());
  const colOf = (needle: string) => headerLower.findIndex((h) => h.indexOf(needle) >= 0) + 1;

  if (name === "Ventas_Hist") {
    const fechaCol = colOf("fecha");
    if (fechaCol > 0) sheet.getColumn(fechaCol).numFmt = "@";
    sheet.getColumn(8).numFmt = AR_NUM_FMT; // col H
  } else if (name === "Estadisticas_CC_Hist") {
    [4, 5, 6].forEach((c) => (sheet.getColumn(c).numFmt = AR_NUM_FMT));
  } else if (name === "Clientes_Hist") {
    [7, 8].forEach((c) => (sheet.getColumn(c).numFmt = AR_NUM_FMT));
    numericCols.forEach((c) => {
      sheet.getColumn(c).numFmt = AR_NUM_FMT;
    });
  } else {
    numericCols.forEach((c) => {
      sheet.getColumn(c).numFmt = AR_NUM_FMT;
    });
  }
}
