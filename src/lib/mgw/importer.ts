import { Db } from "mongodb";
import { getDb } from "../db";
import { FECHA_INICIO_MASTER, MAX_DIAS_POR_CORRIDA, SUCURSALES } from "./constants";
import {
  detectFechaColumnVentas,
  getNumericColsFromHeader,
  guessVentasKeyCols,
  isRowBlank,
  looksLikeVentasHeaderRow,
  parseNumericCols,
  buildRowKey,
  isIntercalatedHeaderVentas,
  isIntercalatedCcRow
} from "./rows";
import { hoyStr, listDates, normalizeDateInput } from "./date-utils";
import {
  fetchCcXls,
  fetchClientesHtml,
  fetchStatsHtml,
  fetchVentasXls,
  loginSucursal,
  MGWSession
} from "./client";
import { parseVentasExportTo2D, xlsBufferTo2D } from "./xls-utils";
import { cleanBlock, isTotalRow, parseFirstHtmlTable, parseHtmlTable10, splitStatsBlocks } from "./html-utils";
import { parseFlexibleNumber, parseNumberAny, round2 } from "./number-utils";
import { CursorDoc, HistCollectionName, RowDoc } from "./types";

const HEADER_META_PREFIX = "header:";
const HEADER_COLLECTION = "mgw_meta";
type HeaderDoc = { _id: string; header: string[]; updatedAt?: Date; createdAt?: Date };

async function getCursor(db: Db): Promise<CursorDoc> {
  const curCol = db.collection<CursorDoc>("mgw_cursor");
  const existing = await curCol.findOne({ _id: "mgw_cursor" });
  if (existing) return existing;
  const base: CursorDoc = {
    _id: "mgw_cursor",
    running: false,
    curSucIdx: 0,
    curFecha: normalizeDateInput(FECHA_INICIO_MASTER),
    startedAt: null,
    updatedAt: new Date()
  };
  await curCol.insertOne(base);
  return base;
}

async function saveCursor(db: Db, patch: Partial<CursorDoc>) {
  const curCol = db.collection<CursorDoc>("mgw_cursor");
  const setOnInsert: Partial<CursorDoc> = { startedAt: null };
  if (patch.startedAt !== undefined) {
    delete setOnInsert.startedAt;
  }
  await curCol.updateOne(
    { _id: "mgw_cursor" },
    { $set: { ...patch, updatedAt: new Date() }, ...(Object.keys(setOnInsert).length ? { $setOnInsert: setOnInsert } : {}) },
    { upsert: true }
  );
}

async function setHeader(db: Db, sheet: HistCollectionName, header: string[]) {
  const col = db.collection<HeaderDoc>(HEADER_COLLECTION);
  await col.updateOne(
    { _id: `${HEADER_META_PREFIX}${sheet}` },
    { $set: { header, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

async function getHeader(db: Db, sheet: HistCollectionName): Promise<string[] | null> {
  const col = db.collection<HeaderDoc>(HEADER_COLLECTION);
  const doc = await col.findOne({ _id: `${HEADER_META_PREFIX}${sheet}` });
  return doc?.header || null;
}

function padRow(row: any[], targetLen: number): any[] {
  const out = [...row];
  while (out.length < targetLen) out.push("");
  return out;
}

function findVentasHeaderRowIdx(data: string[][]): number {
  for (let i = 0; i < data.length; i++) {
    const rowLower = (data[i] || []).map((c) => normalizeHeaderCell(c));
    const hasFecha = rowLower.some((v) => v.indexOf("fecha") >= 0);
    const hasNumero = rowLower.some((v) => {
      const compact = v.replace(/[^a-z0-9]/g, "");
      return compact === "nro" || compact === "numero" || compact === "num" || compact === "n";
    });
    if (hasFecha && hasNumero) return i;
  }
  return 0;
}

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function startImport(fechaOverride?: string) {
  const db = await getDb();
  const fecha = normalizeDateInput(fechaOverride || FECHA_INICIO_MASTER);
  await saveCursor(db, {
    running: true,
    curSucIdx: 0,
    curFecha: fecha,
    startedAt: new Date()
  });
  return getCursor(db);
}

export async function resumeImport() {
  const db = await getDb();
  const cur = await getCursor(db);
  const fecha = normalizeDateInput(cur.curFecha || FECHA_INICIO_MASTER);
  await saveCursor(db, {
    running: true,
    curSucIdx: cur.curSucIdx ?? 0,
    curFecha: fecha
  });
  return getCursor(db);
}

export async function stopImport() {
  const db = await getDb();
  await saveCursor(db, { running: false });
  return getCursor(db);
}

export async function getStatus() {
  const db = await getDb();
  return getCursor(db);
}

type ImportStats = {
  processedDays: number;
  status: "stopped" | "paused" | "done";
  cursor: CursorDoc;
};

export async function runImportOnce(): Promise<ImportStats> {
  const db = await getDb();
  let cursor = await getCursor(db);
  if (!cursor.running) {
    return { processedDays: 0, status: "stopped", cursor };
  }

  const hoy = hoyStr();
  const fechaInicio = normalizeDateInput(FECHA_INICIO_MASTER);
  let sucIdx = cursor.curSucIdx || 0;
  let curFecha = normalizeDateInput(cursor.curFecha || fechaInicio);
  let processed = 0;

  for (; sucIdx < SUCURSALES.length; sucIdx++) {
    const suc = SUCURSALES[sucIdx];
    const session = await loginSucursal(suc);
    const start = curFecha && curFecha < fechaInicio ? fechaInicio : curFecha || fechaInicio;

    if (start > hoy) {
      await saveCursor(db, { curSucIdx: sucIdx + 1, curFecha: fechaInicio });
      curFecha = fechaInicio;
      cursor = await getCursor(db);
      continue;
    }

    const dias = listDates(start, hoy);
    for (const d of dias) {
      if (processed >= MAX_DIAS_POR_CORRIDA) {
        await saveCursor(db, { curSucIdx: sucIdx, curFecha: d, running: true });
        cursor = await getCursor(db);
        return { processedDays: processed, status: "paused", cursor };
      }

      await importarVentas(session, suc.nombre, d, db);
      await importarEstadisticas(session, suc.nombre, d, db);
      await importarClientes(session, suc.nombre, d, db);
      await importarCC(session, suc.nombre, d, db);

      processed += 1;
    }

    curFecha = fechaInicio;
    await saveCursor(db, { curSucIdx: sucIdx + 1, curFecha: fechaInicio, running: true });
  }

  await saveCursor(db, { running: false, curSucIdx: SUCURSALES.length, curFecha: fechaInicio });
  cursor = await getCursor(db);
  return { processedDays: processed, status: "done", cursor };
}

async function importarVentas(session: MGWSession, sucursal: string, fecha: string, db: Db) {
  const buffer = await fetchVentasXls(session, fecha, fecha);
  if (!buffer || buffer.length === 0) return;
  const rawData = parseVentasExportTo2D(buffer);
  if (!rawData || rawData.length < 2) return;

  const headerRowIdx = findVentasHeaderRowIdx(rawData);
  const data = rawData.slice(headerRowIdx);
  if (!data || data.length < 2) return;

  const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRow = padRow(data[0] || [], maxCols);
  const headerSrc = headerRow.map((h: any) => String(h ?? ""));
  const idxFechaSrc = detectFechaColumnVentas(headerSrc, data as string[][]);
  const headerFinal = ["Sucursal", ...headerSrc];
  if (idxFechaSrc >= 0) headerFinal[1 + idxFechaSrc] = "Fecha";

  await setHeader(db, "Ventas_Hist", headerFinal);

  const idxFechaFinal = idxFechaSrc >= 0 ? 1 + idxFechaSrc : -1;
  const idxNumeroSrc = headerRow.findIndex((h: any) => {
    const compact = normalizeHeaderCell(h).replace(/[^a-z0-9]/g, "");
    return compact === "nro" || compact === "numero" || compact === "num" || compact === "n";
  });
  const idxResponsableSrc = headerRow.findIndex((h: any) => normalizeHeaderCell(h).indexOf("responsable") >= 0);
  const idxFormaPagoSrc = headerRow.findIndex((h: any) => normalizeHeaderCell(h).indexOf("forma") >= 0);
  const idxClienteSrc = headerRow.findIndex((h: any) => normalizeHeaderCell(h).indexOf("cliente") >= 0);
  const idxDetalleFinal = headerFinal.length - 1;

  const rows: any[][] = [];
  let currentTicket: any[] | null = null;
  let detalleParts: string[] = [];

  const finalizeCurrent = () => {
    if (!currentTicket) return;
    const detalleStr = detalleParts.join(" ").trim();
    if (idxDetalleFinal >= 0 && currentTicket.length > idxDetalleFinal) {
      currentTicket[idxDetalleFinal] = detalleStr;
    }

    if (idxFechaFinal >= 0 && currentTicket.length > idxFechaFinal) {
      const fn = normalizeDateInput(currentTicket[idxFechaFinal]);
      if (fn) currentTicket[idxFechaFinal] = fn;
    }

    const idxH = 7; // col H (Total) with Sucursal prepended
    if (currentTicket.length > idxH) {
      const parsed = parseFlexibleNumber(currentTicket[idxH]);
      if (parsed != null) currentTicket[idxH] = parsed;
    }

    const rowPadded = padRow(currentTicket, headerFinal.length);
    rows.push(rowPadded);
    currentTicket = null;
    detalleParts = [];
  };

  for (let i = 1; i < data.length; i++) {
    const rowSrc = padRow(data[i] || [], headerRow.length);
    const rowRaw = [sucursal, ...rowSrc];
    while (rowRaw.length < headerFinal.length) rowRaw.push("");
    if (looksLikeVentasHeaderRow(rowRaw as string[])) continue;
    if (isIntercalatedHeaderVentas(rowRaw)) continue;
    if (isRowBlank(rowRaw)) continue;

    const numeroVal = idxNumeroSrc >= 0 ? String(rowSrc[idxNumeroSrc] ?? "").trim() : "";
    const fechaVal = idxFechaSrc >= 0 ? String(rowSrc[idxFechaSrc] ?? "").trim() : "";
    const responsableVal = idxResponsableSrc >= 0 ? String(rowSrc[idxResponsableSrc] ?? "").trim() : "";
    const clienteVal = idxClienteSrc >= 0 ? String(rowSrc[idxClienteSrc] ?? "").trim() : "";
    const formaVal = idxFormaPagoSrc >= 0 ? String(rowSrc[idxFormaPagoSrc] ?? "").trim() : "";

    const isTicketRow = /^\d+$/.test(numeroVal) && /\d{4}-\d{2}-\d{2}/.test(fechaVal);
    const isProductRow = !/^\d+$/.test(numeroVal) && parseFlexibleNumber(fechaVal) != null;

    if (isTicketRow) {
      finalizeCurrent();
      currentTicket = rowRaw;
      detalleParts = [];
      continue;
    }

    if (isProductRow && currentTicket) {
      const precio = fechaVal;
      const cantidad = responsableVal;
      const clienteNum = clienteVal;
      const itemTotal = formaVal;
      const fragment = [numeroVal, precio, cantidad, clienteNum, itemTotal].join(" ").trim();
      if (fragment) detalleParts.push(fragment);
      continue;
    }

    if (idxFechaFinal >= 0 && rowRaw.length > idxFechaFinal) {
      const fn = normalizeDateInput(rowRaw[idxFechaFinal]);
      if (fn) rowRaw[idxFechaFinal] = fn;
    }

    const idxH = 7;
    if (rowRaw.length > idxH) {
      const parsed = parseFlexibleNumber(rowRaw[idxH]);
      if (parsed != null) rowRaw[idxH] = parsed;
    }

    currentTicket = rowRaw;
    detalleParts = [];
  }

  finalizeCurrent();

  if (!rows.length) return;

  const keyCols = guessVentasKeyCols(headerSrc, idxFechaFinal);
  const prepared = rows.map((row) => {
    const fechaVal =
      (idxFechaFinal >= 0 && row.length > idxFechaFinal
        ? normalizeDateInput(String(row[idxFechaFinal]).replace(/^'+/, ""))
        : normalizeDateInput(fecha)) || normalizeDateInput(fecha);
    const rowNormalized = padRow([...row], headerFinal.length);
    if (idxFechaFinal >= 0 && rowNormalized.length > idxFechaFinal) {
      rowNormalized[idxFechaFinal] = fechaVal;
    }
    const key = buildRowKey(rowNormalized, keyCols);
    return buildDoc("Ventas_Hist", { row: rowNormalized, key, fecha: fechaVal, sucursal });
  });

  await bulkUpsert(db, "Ventas_Hist", prepared);
}

async function importarCC(session: MGWSession, sucursal: string, fecha: string, db: Db) {
  if (await yaExisteFechaSucursal(db, "Estadisticas_CC_Hist", fecha, sucursal)) return;
  const buffer = await fetchCcXls(session, fecha);
  if (!buffer || buffer.length === 0) return;
  const data = xlsBufferTo2D(buffer);
  if (!data || data.length < 2) return;

  const parsedRows = parseCCXlsToRows(data);
  if (!parsedRows.length) return;

  const header = ["Fecha", "Sucursal", "Cliente", "Ventas", "Pagos", "Saldo parcial"];
  await setHeader(db, "Estadisticas_CC_Hist", header);

  const out = parsedRows.map((r) => [
    fecha,
    sucursal,
    r.cliente,
    round2(r.ventas),
    round2(r.pagos),
    round2(r.saldo)
  ]);

  const keyCols = [0, 1, 2, 3, 4, 5];
  const docs = out.map((row) => buildDoc("Estadisticas_CC_Hist", { row, key: buildRowKey(row, keyCols), fecha, sucursal }));
  await bulkUpsert(db, "Estadisticas_CC_Hist", docs);
}

async function importarEstadisticas(session: MGWSession, sucursal: string, fecha: string, db: Db) {
  if (await yaExisteFechaSucursal(db, "Estadisticas_Productos_Hist", fecha, sucursal)) return;
  const html = await fetchStatsHtml(session, fecha);
  const tabla = parseHtmlTable10(html);
  if (!tabla || !tabla.length) return;

  const blocks = splitStatsBlocks(tabla);

  if (blocks.productos.length) {
    await appendBlockWithKey(db, "Estadisticas_Productos_Hist", fecha, sucursal, blocks.productos);
  }
  if (blocks.grupos.length) {
    await appendBlockWithKey(db, "Estadisticas_Grupos_Hist", fecha, sucursal, blocks.grupos);
  }
  if (blocks.formas.length) {
    await appendBlockWithKey(db, "Estadisticas_FormasPago_Hist", fecha, sucursal, blocks.formas);
  }
}

async function importarClientes(session: MGWSession, sucursal: string, fecha: string, db: Db) {
  if (await yaExisteFechaSucursal(db, "Clientes_Hist", fecha, sucursal)) return;

  const html = await fetchClientesHtml(session, fecha);
  const tabla = parseFirstHtmlTable(html);
  if (!tabla || !tabla.length) return;

  await appendBlockWithKey(db, "Clientes_Hist", fecha, sucursal, cleanBlock(tabla));
}

async function appendBlockWithKey(
  db: Db,
  sheetName: HistCollectionName,
  fecha: string,
  sucursal: string,
  data2d: string[][]
) {
  if (!data2d || data2d.length === 0) return;

  const header = ["Fecha", "Sucursal", ...data2d[0]];
  await setHeader(db, sheetName, header);

  const numericCols1Based = getNumericColsFromHeader(header);
  const keyCols = header.map((_, idx) => idx); // all columns

  const rows: any[][] = [];
  for (let i = 1; i < data2d.length; i++) {
    const raw = data2d[i];
    if (isTotalRow(raw)) continue;

    const row = parseNumericCols([fecha, sucursal, ...raw], numericCols1Based);
    if (!isRowBlank(row)) rows.push(row);
  }

  if (!rows.length) return;

  const docs = rows.map((row) => buildDoc(sheetName, { row, key: buildRowKey(row, keyCols), fecha, sucursal }));
  await bulkUpsert(db, sheetName, docs);
}

function parseCCXlsToRows(data2d: any[][]) {
  let headerRowIndex = -1;
  let idxCliente = -1,
    idxVentas = -1,
    idxPagos = -1,
    idxSaldo = -1;

  for (let i = 0; i < data2d.length; i++) {
    const row = data2d[i].map((x: any) => String(x || "").trim().toLowerCase());
    const jCliente = row.findIndex((c) => c === "cliente" || c.indexOf("cliente") >= 0);
    const jVentas = row.findIndex((c) => c === "ventas" || c.indexOf("ventas") >= 0);
    const jPagos = row.findIndex((c) => c === "pagos" || c.indexOf("pagos") >= 0);
    const jSaldo = row.findIndex((c) => c.indexOf("saldo") >= 0);

    if (jCliente >= 0 && jVentas >= 0 && jPagos >= 0 && jSaldo >= 0) {
      headerRowIndex = i;
      idxCliente = jCliente;
      idxVentas = jVentas;
      idxPagos = jPagos;
      idxSaldo = jSaldo;
      break;
    }
  }
  if (headerRowIndex === -1) return [];

  const out: { cliente: string; ventas: any; pagos: any; saldo: any }[] = [];
  for (let r = headerRowIndex + 1; r < data2d.length; r++) {
    const rowRaw = data2d[r];
    if (!rowRaw || rowRaw.every((c: any) => String(c || "").trim() === "")) continue;
    if (isIntercalatedCcRow(rowRaw)) continue;

    const first = String(rowRaw[0] || "").trim().toLowerCase();
    if (first.indexOf("pagos:") === 0 || first.indexOf("ventas:") === 0) continue;

    const rowLower = rowRaw.map((x: any) => String(x || "").trim().toLowerCase());
    const isHeaderRepeat =
      rowLower.indexOf("cliente") >= 0 &&
      rowLower.indexOf("ventas") >= 0 &&
      rowLower.indexOf("pagos") >= 0 &&
      rowLower.some((x: string) => x.indexOf("saldo") >= 0);
    if (isHeaderRepeat) continue;

    const cliente = String(rowRaw[idxCliente] || "").trim();
    if (!cliente) continue;

    out.push({
      cliente,
      ventas: parseNumberAny(rowRaw[idxVentas], false),
      pagos: parseNumberAny(rowRaw[idxPagos], false),
      saldo: parseNumberAny(rowRaw[idxSaldo], false)
    });
  }
  return out;
}

async function yaExisteFechaSucursal(db: Db, colName: HistCollectionName, fecha: string, sucursal: string) {
  const count = await db.collection(colName).countDocuments({ fecha, sucursal }, { limit: 1 });
  return count > 0;
}

function buildDoc(
  col: HistCollectionName,
  payload: { row: any[]; key: string; fecha: string; sucursal: string }
): RowDoc {
  return {
    ...payload,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function bulkUpsert(db: Db, colName: HistCollectionName, docs: RowDoc[]) {
  if (!docs.length) return;
  const col = db.collection<RowDoc>(colName);
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { key: doc.key },
      update: {
        $set: {
          fecha: doc.fecha,
          sucursal: doc.sucursal,
          row: doc.row,
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      upsert: true
    }
  }));
  await col.bulkWrite(ops, { ordered: false });
}

export async function loadAllRowsOrdered(db?: Db) {
  const _db = db || (await getDb());
  const result: Record<HistCollectionName, RowDoc[]> = {
    Ventas_Hist: [],
    Estadisticas_CC_Hist: [],
    Estadisticas_Productos_Hist: [],
    Estadisticas_Grupos_Hist: [],
    Estadisticas_FormasPago_Hist: [],
    Clientes_Hist: []
  };

  for (const name of Object.keys(result) as HistCollectionName[]) {
    const rows = await _db.collection<RowDoc>(name).find({}).toArray();
    const header = (await getHeader(_db, name)) || inferHeaderFromRows(rows);
    result[name] = sortRows(name, rows, header);
  }
  return result;
}

export async function getHeadersMap(db?: Db) {
  const _db = db || (await getDb());
  const headers: Record<HistCollectionName, string[] | null> = {
    Ventas_Hist: null,
    Estadisticas_CC_Hist: null,
    Estadisticas_Productos_Hist: null,
    Estadisticas_Grupos_Hist: null,
    Estadisticas_FormasPago_Hist: null,
    Clientes_Hist: null
  };
  for (const name of Object.keys(headers) as HistCollectionName[]) {
    headers[name] = (await getHeader(_db, name)) || null;
  }
  return headers;
}

function inferHeaderFromRows(rows: RowDoc[]): string[] | null {
  if (!rows.length) return null;
  const maxRow = rows.reduce((acc, cur) => (cur.row.length > acc.row.length ? cur : acc), rows[0]);
  return maxRow.row.map((_, idx) => `Col${idx + 1}`);
}

function sortRows(name: HistCollectionName, rows: RowDoc[], header: string[] | null): RowDoc[] {
  const headerSorts: Record<HistCollectionName, string[]> = {
    Ventas_Hist: ["fecha", "sucursal", "comprob", "nro", "cliente", "total"],
    Estadisticas_CC_Hist: ["fecha", "sucursal", "cliente"],
    Estadisticas_Productos_Hist: ["fecha", "sucursal", "producto"],
    Estadisticas_Grupos_Hist: ["fecha", "sucursal", "grupo"],
    Estadisticas_FormasPago_Hist: ["fecha", "sucursal", "forma"],
    Clientes_Hist: ["fecha", "sucursal", "cliente"]
  };
  const keys = headerSorts[name] || [];
  const headerLower = (header || []).map((h) => String(h || "").trim().toLowerCase());
  const colOf = (needle: string) => headerLower.findIndex((h) => h.indexOf(needle) >= 0);
  const extraCols = keys.slice(2).map(colOf).filter((idx) => idx >= 0);

  return [...rows].sort((a, b) => {
    const cmpFecha = compare(a.fecha, b.fecha);
    if (cmpFecha !== 0) return cmpFecha;
    const cmpSuc = compare(a.sucursal, b.sucursal);
    if (cmpSuc !== 0) return cmpSuc;
    for (const idx of extraCols) {
      const cmp = compare(String(a.row[idx] ?? ""), String(b.row[idx] ?? ""));
      if (cmp !== 0) return cmp;
    }
    return compare(a.key, b.key);
  });
}

function compare(a: any, b: any) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}
