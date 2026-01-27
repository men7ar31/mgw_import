import "dotenv/config";
import { getDb } from "../src/lib/db";
import { getHeadersMap, loadAllRowsOrdered } from "../src/lib/mgw/importer";
import { mirrorDocsToMgw2, isMgw2Enabled } from "../src/lib/mgw/mgw2";
import { HistCollectionName } from "../src/lib/mgw/types";

const CHUNK_SIZE = 500;

async function main() {
  if (!isMgw2Enabled()) {
    throw new Error("Habilita mgw2 con MGW2_ENABLED=true o MONGO_URI_MGW2/MONGO_DB_MGW2 antes de backfillear.");
  }

  const db = await getDb();
  const [rowsBySheet, headers] = await Promise.all([loadAllRowsOrdered(db), getHeadersMap(db)]);

  for (const name of Object.keys(rowsBySheet) as HistCollectionName[]) {
    const header = headers[name] || inferHeader(rowsBySheet[name]);
    if (!header) {
      console.warn(`[mgw2] Sin header para ${name}, se omite backfill.`);
      continue;
    }

    const rows = rowsBySheet[name];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const slice = rows.slice(i, i + CHUNK_SIZE);
      await mirrorDocsToMgw2(name, header, slice);
    }
    console.log(`[mgw2] ${name}: ${rows.length} docs replicados`);
  }

  console.log("[mgw2] Backfill completo");
}

function inferHeader(rows: { row: any[] }[]): string[] | null {
  if (!rows.length) return null;
  const maxRow = rows.reduce((acc, cur) => (cur.row.length > acc.row.length ? cur : acc), rows[0]);
  return maxRow.row.map((_, idx) => `Col${idx + 1}`);
}

main().catch((err) => {
  console.error("[mgw2] Error en backfill", err);
  process.exit(1);
});
