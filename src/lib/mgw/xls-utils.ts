import * as XLSX from "xlsx";

export function xlsBufferTo2D(buffer: Buffer): any[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: ""
  }) as any[][];
  return data;
}
