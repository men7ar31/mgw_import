import { google, sheets_v4, drive_v3 } from "googleapis";
import { loadAllRowsOrdered, getHeadersMap } from "./importer";
import { getNumericColsFromHeader } from "./rows";
import { HistCollectionName } from "./types";

const SHEET_NAMES: HistCollectionName[] = [
  "Ventas_Hist",
  "Estadisticas_CC_Hist",
  "Estadisticas_Productos_Hist",
  "Estadisticas_Grupos_Hist",
  "Estadisticas_FormasPago_Hist",
  "Clientes_Hist"
];

const ROWS_PER_VALUE_BATCH = Number(process.env.GOOGLE_SHEETS_ROWS_PER_BATCH || 10000);
const MAX_VALUE_BATCH_BYTES = Number(process.env.GOOGLE_SHEETS_MAX_BATCH_BYTES || 8_000_000);
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = Number(process.env.GOOGLE_SHEETS_RETRY_DELAY_MS || 2000);
const WRITE_THROTTLE_MS = Number(process.env.GOOGLE_SHEETS_WRITE_THROTTLE_MS || 0);

type PushSheetsParams = {
  spreadsheetId?: string;
  createNew?: boolean;
};

export async function pushToGoogleSheets(params: PushSheetsParams) {
  const auth = await buildAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const { spreadsheetId, spreadsheetUrl } = await ensureSpreadsheet(sheets, drive, params);

  const [rowsBySheet, headers] = await Promise.all([loadAllRowsOrdered(), getHeadersMap()]);
  await ensureSheetsExist(sheets, spreadsheetId, SHEET_NAMES);
  const sheetMeta = await getSheetMeta(sheets, spreadsheetId);

  const clearRanges: string[] = [];
  const valueRanges: sheets_v4.Schema$ValueRange[] = [];
  const formatRequests: sheets_v4.Schema$Request[] = [];

  for (const name of SHEET_NAMES) {
    const header = headers[name] || inferHeader(rowsBySheet[name]);
    const values = buildValues(header, rowsBySheet[name]);
    const sheetId = sheetMeta[name];
    const totalRows = values.length || 1;
    const maxCols = values.reduce((m, r) => Math.max(m, r.length), 0) || 1;

    clearRanges.push(`'${name}'`);
    valueRanges.push(...buildValueRanges(name, values));

    if (sheetId !== undefined) {
      formatRequests.push(
        buildResizeRequest(sheetId, totalRows, maxCols),
        ...buildFormatRequests(name, sheetId, header, totalRows)
      );
    }
  }

  if (formatRequests.length) {
    await withRateLimitRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: formatRequests }
      })
    );
  }

  if (clearRanges.length) {
    await withRateLimitRetry(() =>
      sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: clearRanges } })
    );
  }

  if (valueRanges.length) {
    await pushValueRanges(sheets, spreadsheetId, valueRanges);
  }

  return { spreadsheetId, url: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

async function buildAuth() {
  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY || "";
  const key = (rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey).trim();
  if (!email || !key) throw new Error("Faltan GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY");
  if (!key.includes("BEGIN PRIVATE KEY")) throw new Error("La GOOGLE_SA_PRIVATE_KEY no parece un PEM válido");
  const client = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"]
  });
  await client.authorize();
  return client;
}

async function ensureSpreadsheet(
  sheets: sheets_v4.Sheets,
  drive: drive_v3.Drive,
  params: PushSheetsParams
) {
  const { spreadsheetId, createNew } = params;
  if (!spreadsheetId || createNew) {
    const res = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: "MGW Export" },
        sheets: SHEET_NAMES.map((title) => ({ properties: { title } }))
      },
      fields: "spreadsheetId,spreadsheetUrl"
    });
    const id = res.data.spreadsheetId!;
    const url = res.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}`;
    const folderId = process.env.GOOGLE_SHEETS_FOLDER_ID;
    if (folderId) {
      await drive.files.update({ fileId: id, addParents: folderId });
    }
    return { spreadsheetId: id, spreadsheetUrl: url };
  }
  return { spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

async function ensureSheetsExist(sheets: sheets_v4.Sheets, spreadsheetId: string, required: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties?.title || ""));
  const requests = required
    .filter((name) => !existing.has(name))
    .map((name) => ({ addSheet: { properties: { title: name } } }));
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}

async function getSheetMeta(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title,sheets.properties.sheetId" });
  const map: Record<string, number> = {};
  (meta.data.sheets || []).forEach((s) => {
    const title = s.properties?.title;
    const id = s.properties?.sheetId;
    if (title && typeof id === "number") map[title] = id;
  });
  return map;
}

function buildValues(header: string[] | null, rows: { row: any[] }[]) {
  if (!header) return rows.map((r) => r.row);
  const values = [header];
  for (const doc of rows) {
    const padded = padRow(doc.row, header.length);
    values.push(padded);
  }
  return values;
}

function buildFormatRequests(
  name: HistCollectionName,
  sheetId: number,
  header: string[] | null,
  totalRows: number
): sheets_v4.Schema$Request[] {
  if (!header) return [];
  const reqs: sheets_v4.Schema$Request[] = [];
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount"
    }
  });
  reqs.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold"
    }
  });

  const headerLower = header.map((h) => String(h || "").trim().toLowerCase());
  const colOf = (needle: string) => headerLower.findIndex((h) => h.indexOf(needle) >= 0) + 1;
  const colRequests = (cols: number[], numberFormat: sheets_v4.Schema$NumberFormat) =>
    cols
      .filter((c) => c > 0)
      .map((c) => ({
        repeatCell: {
          range: { sheetId, startColumnIndex: c - 1, endColumnIndex: c, startRowIndex: 0, endRowIndex: totalRows || 1 },
          cell: { userEnteredFormat: { numberFormat } },
          fields: "userEnteredFormat.numberFormat"
        }
      }));

  if (name === "Ventas_Hist") {
    const fechaCol = colOf("fecha");
    const numCol = 8; // col H
    if (fechaCol > 0) {
      reqs.push({
        repeatCell: {
          range: { sheetId, startColumnIndex: fechaCol - 1, endColumnIndex: fechaCol, startRowIndex: 0, endRowIndex: totalRows || 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    }
    reqs.push(
      ...colRequests([numCol], {
        type: "NUMBER",
        pattern: "#,##0.00"
      })
    );
  } else if (name === "Estadisticas_CC_Hist") {
    reqs.push(
      ...colRequests([4, 5, 6], {
        type: "NUMBER",
        pattern: "#,##0.00"
      })
    );
  } else if (name === "Clientes_Hist") {
    const factCol = colOf("factur");
    const ganCol = colOf("gananc");
    reqs.push(
      ...colRequests(
        [factCol, ganCol],
        {
          type: "NUMBER",
          pattern: "#,##0.00"
        }
      )
    );
  } else {
    const numeric = getNumericColsFromHeader(header);
    reqs.push(
      ...colRequests(
        numeric,
        {
          type: "NUMBER",
          pattern: "#,##0.00"
        }
      )
    );
  }

  return reqs;
}

function buildResizeRequest(sheetId: number, totalRows: number, maxCols: number): sheets_v4.Schema$Request {
  return {
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { rowCount: Math.max(totalRows, 1000), columnCount: Math.max(maxCols, 26) }
      },
      fields: "gridProperties.rowCount,gridProperties.columnCount"
    }
  };
}

function buildValueRanges(title: string, values: any[][]): sheets_v4.Schema$ValueRange[] {
  if (!values.length) return [];
  const chunkSize = Math.max(1, ROWS_PER_VALUE_BATCH);
  const out: sheets_v4.Schema$ValueRange[] = [];
  for (let start = 0; start < values.length; start += chunkSize) {
    out.push({
      range: `${title}!A${start + 1}`,
      values: values.slice(start, start + chunkSize)
    });
  }
  return out;
}

async function pushValueRanges(sheets: sheets_v4.Sheets, spreadsheetId: string, ranges: sheets_v4.Schema$ValueRange[]) {
  if (!ranges.length) return;
  const batches = chunkValueRanges(ranges, MAX_VALUE_BATCH_BYTES);
  for (const batch of batches) {
    await withRateLimitRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { data: batch, valueInputOption: "RAW" }
      })
    );
  }
}

function chunkValueRanges(ranges: sheets_v4.Schema$ValueRange[], maxBytes: number) {
  const batches: sheets_v4.Schema$ValueRange[][] = [];
  let current: sheets_v4.Schema$ValueRange[] = [];
  let accBytes = 0;

  for (const range of ranges) {
    const size = estimateRangeBytes(range);
    if (current.length && accBytes + size > maxBytes) {
      batches.push(current);
      current = [];
      accBytes = 0;
    }
    current.push(range);
    accBytes += size;
  }

  if (current.length) batches.push(current);
  return batches;
}

function estimateRangeBytes(range: sheets_v4.Schema$ValueRange) {
  const values = range.values || [];
  let total = 0;
  for (const row of values) {
    for (const cell of row || []) {
      const str = cell == null ? "" : typeof cell === "string" ? cell : JSON.stringify(cell);
      total += str.length + 1;
    }
  }
  return total;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    const res = await fn();
    if (WRITE_THROTTLE_MS > 0) {
      await sleep(WRITE_THROTTLE_MS);
    }
    return res;
  } catch (err: any) {
    if (attempt >= MAX_RATE_LIMIT_RETRIES || !isRateLimitError(err)) throw err;
    const delayMs = RETRY_BASE_DELAY_MS * attempt;
    await sleep(delayMs);
    return withRateLimitRetry(fn, attempt + 1);
  }
}

function isRateLimitError(err: any) {
  const message =
    (err?.message || err?.response?.data?.error?.message || err?.response?.statusText || "").toString().toLowerCase();
  const status = err?.code || err?.response?.status;
  return status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("write requests");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padRow(row: any[], len: number) {
  const out = [...row];
  while (out.length < len) out.push("");
  return out;
}

function inferHeader(rows: { row: any[] }[]): string[] | null {
  if (!rows.length) return null;
  const maxRow = rows.reduce((acc, cur) => (cur.row.length > acc.row.length ? cur : acc), rows[0]);
  return maxRow.row.map((_, idx) => `Col${idx + 1}`);
}
