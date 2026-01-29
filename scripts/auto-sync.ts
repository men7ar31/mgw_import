import "dotenv/config";
import { resumeImport, runImportOnce } from "../src/lib/mgw/importer";

const intervalMs = Number(process.env.MGW_SYNC_INTERVAL_MS || 5 * 60 * 1000); // default 5 min

async function loop() {
  const startedAt = new Date().toISOString();
  console.log(`[sync] Inicio ciclo ${startedAt} (intervalo ${intervalMs} ms)`);
  try {
    await resumeImport(); // asegura RUNNING=true para continuar desde el cursor guardado
    const importResult = await runImportOnce();
    console.log("[sync] runImportOnce ok", importResult);
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
