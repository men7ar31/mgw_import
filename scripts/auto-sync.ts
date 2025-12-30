import "dotenv/config";
import { runImportOnce } from "../src/lib/mgw/importer";
import { pushToGoogleSheets } from "../src/lib/mgw/sheets-export";

const intervalMs = Number(process.env.MGW_SYNC_INTERVAL_MS || 5 * 60 * 1000); // default 5 min
let spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "";

async function loop() {
  const startedAt = new Date().toISOString();
  console.log(`[sync] Inicio ciclo ${startedAt} (intervalo ${intervalMs} ms)`);
  try {
    const importResult = await runImportOnce();
    console.log("[sync] runImportOnce ok", importResult);

    const res = await pushToGoogleSheets({ spreadsheetId: spreadsheetId || undefined, createNew: !spreadsheetId });
    spreadsheetId = res.spreadsheetId;
    console.log("[sync] pushToGoogleSheets ok", res);
  } catch (err) {
    console.error("[sync] error en ciclo", err);
  } finally {
    setTimeout(loop, intervalMs);
  }
}

loop().catch((err) => {
  console.error("[sync] error inicial", err);
  process.exit(1);
});
