import { parseFlexibleNumber } from "./number-utils";

export function isRowBlank(row: Array<unknown>): boolean {
  return row.every((c) => c === "" || c == null);
}

export function buildRowKey(row: Array<unknown>, keyCols: number[]): string {
  return keyCols.map((idx) => String(row[idx] ?? "").trim()).join("|");
}

export function guessVentasKeyCols(headerSrc: string[], idxFechaFinal: number): number[] {
  const headers = ["Sucursal"].concat(headerSrc).map((h) => String(h || "").toLowerCase());

  function idx(cands: string[]) {
    for (const c of cands) {
      const j = headers.findIndex((h) => h.indexOf(c) >= 0);
      if (j >= 0) return j;
    }
    return -1;
  }

  const iFecha = idxFechaFinal >= 0 ? idxFechaFinal : idx(["fecha"]);
  const iNro = idx(["comprobante", "nro", "numero", "número", "ticket", "n°", "nº"]);
  const iTotal = idx(["total", "importe"]);
  const iCli = idx(["cliente", "razon", "razón"]);

  const cols = [0];
  if (iFecha >= 0) cols.push(iFecha);
  if (iNro >= 0) cols.push(iNro);
  if (iCli >= 0) cols.push(iCli);
  if (iTotal >= 0) cols.push(iTotal);

  if (cols.length >= 3) return cols;
  return [0, 1, 2, 3, 4, 5].filter((i) => i < headers.length);
}

export function looksLikeVentasHeaderRow(rowWithSucursal: string[]): boolean {
  const r = rowWithSucursal.map((v) => String(v || "").trim().toLowerCase());
  const b = r[1] || "";
  const c = r[2] || "";
  const hasN = b === "n°" || b === "nº" || b === "nro" || b === "n°." || b === "nº.";
  const hasFecha = c === "fecha" || r.findIndex((x) => x.indexOf("fecha") >= 0) >= 0;
  const hasOther =
    r.findIndex((x) => x.indexOf("responsable") >= 0) >= 0 ||
    r.findIndex((x) => x.indexOf("cliente") >= 0) >= 0 ||
    r.findIndex((x) => x.indexOf("forma de pago") >= 0) >= 0 ||
    r.findIndex((x) => x.indexOf("total") >= 0) >= 0 ||
    r.findIndex((x) => x.indexOf("comentarios") >= 0) >= 0;
  return hasN && hasFecha && hasOther;
}

export function isIntercalatedHeaderVentas(rowWithSucursal: unknown[]): boolean {
  const r = (rowWithSucursal || []).map((v) => String(v || "").trim().toLowerCase());
  const a = r[0] || "";
  const b = r[1] || "";
  const c = r[2] || "";

  const casePure = a === "sucursal" && (r.indexOf("fecha") >= 0 || r.indexOf("responsable") >= 0 || r.indexOf("total") >= 0);

  const hasN = b === "n°" || b === "nº" || b === "nro" || b === "n°." || b === "nº.";
  const hasFecha = c === "fecha" || r.indexOf("fecha") >= 0;
  const hasOther =
    r.indexOf("responsable") >= 0 ||
    r.indexOf("cliente") >= 0 ||
    r.indexOf("forma de pago") >= 0 ||
    r.indexOf("comentarios") >= 0 ||
    r.indexOf("total") >= 0 ||
    r.indexOf("importe") >= 0;

  return casePure || (hasN && hasFecha && hasOther);
}

export function detectFechaColumnVentas(headerSrc: string[], data2d: string[][]): number {
  const idx = headerSrc
    .map((h) => String(h || "").trim().toLowerCase())
    .findIndex((h) => h.indexOf("fecha") >= 0);
  if (idx >= 0) return idx;

  if (data2d.length >= 2) {
    const r = data2d[1];
    for (let c = 0; c < r.length; c++) {
      const v = String(r[c] || "").trim();
      if (/^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2})?$/.test(v)) return c;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return c;
    }
  }
  return -1;
}

export function getNumericColsFromHeader(fullHeaderRow: string[]): number[] {
  if (!fullHeaderRow || !fullHeaderRow.length) return [];

  const numericHints = [
    "factur",
    "gananc",
    "unidad",
    "unidades",
    "peso",
    "precio",
    "menor",
    "mayor",
    "medio",
    "total",
    "costo",
    "ganancia",
    "utilidad",
    "importe",
    "monto",
    "debe",
    "haber",
    "ventas",
    "pagos",
    "saldo",
    "margen",
    "%",
    "porc",
    "kg",
    "kilo"
  ];

  const nonNumericExact = new Set([
    "fecha",
    "sucursal",
    "cliente",
    "clientes",
    "producto",
    "grupo",
    "grupos",
    "razon social",
    "razón social",
    "tipo",
    "responsable",
    "comentarios"
  ]);

  const cols: number[] = [];
  for (let c = 0; c < fullHeaderRow.length; c++) {
    const hRaw = String(fullHeaderRow[c] ?? "").trim();
    if (!hRaw) continue;

    const h = hRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nonNumericExact.has(h)) continue;
    if (h === "fecha" || h === "sucursal") continue;

    if (numericHints.some((k) => h.indexOf(k) >= 0)) cols.push(c + 1);
  }

  cols.sort((a, b) => a - b);
  return cols;
}

export function parseNumericCols(row: any[], numericCols1Based: number[]): any[] {
  const out = [...row];
  numericCols1Based.forEach((col) => {
    const idx = col - 1;
    if (idx < 0 || idx >= out.length) return;
    const parsed = parseFlexibleNumber(out[idx]);
    if (parsed != null) out[idx] = parsed;
  });
  return out;
}

export function isIntercalatedCcRow(row: unknown[]): boolean {
  const r = (row || []).map((v) => String(v || "").trim().toLowerCase());

  const isOldLike =
    r[0] === "sucursal" &&
    (r.some((x) => x.indexOf("pagos:") >= 0) ||
      r.some((x) => x.indexOf("ventas:") >= 0) ||
      r.indexOf("cliente") >= 0);
  const isPureHeader = r[0] === "fecha" && r[1] === "sucursal" && r.indexOf("cliente") >= 0 && r.indexOf("ventas") >= 0;
  const hasPagosLinea = r.some((c) => String(c).indexOf("pagos:") === 0);
  const hasVentasLinea = r.some((c) => String(c).indexOf("ventas:") === 0);

  return isOldLike || isPureHeader || hasPagosLinea || hasVentasLinea;
}
