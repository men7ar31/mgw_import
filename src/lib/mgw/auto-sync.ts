import { runImportOnce, resumeImport } from "./importer";

let timer: NodeJS.Timeout | null = null;
let lastRun: { startedAt: string; finishedAt?: string; error?: string } | null = null;

export function getAutoSyncStatus() {
  return {
    running: !!timer,
    lastRun,
    intervalMs: currentIntervalMs()
  };
}

export async function startAutoSync(params?: { intervalMs?: number }) {
  stopAutoSync();
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
    await resumeImport(); // asegura RUNNING=true para que runImportOnce procese
    await runImportOnce();
    lastRun.finishedAt = new Date().toISOString();
  } catch (err: any) {
    lastRun.error = err?.message || String(err);
    lastRun.finishedAt = new Date().toISOString();
    throw err;
  }
}
