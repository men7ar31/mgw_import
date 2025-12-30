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

  for (const name of SHEET_NAMES) {
    const header = headers[name] || inferHeader(rowsBySheet[name]);
    const values = buildValues(header, rowsBySheet[name]);
    const sheetId = sheetMeta[name];
    await replaceSheetValues(sheets, spreadsheetId, name, sheetId, values);

    if (sheetId !== undefined) {
      const fmtRequests = buildFormatRequests(name, sheetId, header, values.length);
      if (fmtRequests.length) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fmtRequests } });
      }
    }
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
    if (title && id !== undefined) map[title] = id;
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

async function replaceSheetValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
  sheetId: number | undefined,
  values: any[][]
) {
  const totalRows = values.length;
  const maxCols = values.reduce((m, r) => Math.max(m, r.length), 0);

  if (sheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { rowCount: Math.max(totalRows, 1000), columnCount: Math.max(maxCols, 26) }
              },
              fields: "gridProperties.rowCount,gridProperties.columnCount"
            }
          }
        ]
      }
    });
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${title}'` });
  if (!values.length) return;
  const batchSize = 1000;
  for (let start = 0; start < values.length; start += batchSize) {
    const chunk = values.slice(start, start + batchSize);
    const range = `${title}!A${start + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: chunk }
    });
  }
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
