import { runImportOnce } from "./importer";
import { pushToGoogleSheets } from "./sheets-export";

let timer: NodeJS.Timeout | null = null;
let lastSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "";
let lastRun: { startedAt: string; finishedAt?: string; error?: string } | null = null;

export function getAutoSyncStatus() {
  return {
    running: !!timer,
    lastRun,
    spreadsheetId: lastSpreadsheetId,
    intervalMs: currentIntervalMs()
  };
}

export async function startAutoSync(params?: { spreadsheetId?: string; intervalMs?: number }) {
  stopAutoSync();
  if (params?.spreadsheetId) lastSpreadsheetId = params.spreadsheetId;
  const interval = params?.intervalMs ?? currentIntervalMs();
  timer = setInterval(() => tick().catch(() => {}), interval);
  await tick(); // fire immediately
  return getAutoSyncStatus();
}

export function stopAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  return getAutoSyncStatus();
}

function currentIntervalMs() {
  return Number(process.env.MGW_SYNC_INTERVAL_MS || 5 * 60 * 1000);
}

async function tick() {
  const startedAt = new Date().toISOString();
  lastRun = { startedAt };
  try {
    await runImportOnce();
    const res = await pushToGoogleSheets({
      spreadsheetId: lastSpreadsheetId || undefined,
      createNew: !lastSpreadsheetId
    });
    lastSpreadsheetId = res.spreadsheetId;
    lastRun.finishedAt = new Date().toISOString();
  } catch (err: any) {
    lastRun.error = err?.message || String(err);
    lastRun.finishedAt = new Date().toISOString();
    throw err;
  }
}
