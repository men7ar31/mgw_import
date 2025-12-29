import * as cheerio from "cheerio";

export function parseFirstHtmlTable(html: string): string[][] {
  return parseHtmlTableAt(html, 0);
}

export function parseHtmlTable10(html: string): string[][] {
  return parseHtmlTableAt(html, 9);
}

export function parseHtmlTableAt(html: string, index: number): string[][] {
  const root = cheerio.load(html);
  const tables = root("table").toArray();
  if (index >= tables.length) return [];
  const table = tables[index];
  return htmlTableTo2D(root, table);
}

function htmlTableTo2D(root: cheerio.CheerioAPI, table: cheerio.Element): string[][] {
  const rows: string[][] = [];
  let maxCols = 0;

  root(table)
    .find("tr")
    .each((_, tr) => {
      const row: string[] = [];
      root(tr)
        .find("th,td")
        .each((__, cell) => {
          const text = root(cell)
            .text()
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
          row.push(text);
        });
      if (row.length) {
        rows.push(row);
        if (row.length > maxCols) maxCols = row.length;
      }
    });

  return rows.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
}

export type StatsBlocks = {
  productos: string[][];
  grupos: string[][];
  formas: string[][];
};

export function splitStatsBlocks(tabla2d: string[][]): StatsBlocks {
  if (!tabla2d || tabla2d.length === 0) return { productos: [], grupos: [], formas: [] };

  const markers = { productos: "-Productos-", grupos: "-Grupos-", formas: "-Formas de pago-" };
  let rp = -1;
  let rg = -1;
  let rf = -1;

  for (let i = 0; i < tabla2d.length; i++) {
    const a = String(tabla2d[i][0] || "").trim();
    if (a === markers.productos) rp = i;
    if (a === markers.grupos) rg = i;
    if (a === markers.formas) rf = i;
  }

  if (rp === -1 || rg === -1 || rf === -1) return { productos: [], grupos: [], formas: [] };

  return {
    productos: cleanBlock(tabla2d.slice(rp + 1, rg)),
    grupos: cleanBlock(tabla2d.slice(rg + 1, rf)),
    formas: cleanBlock(tabla2d.slice(rf + 1))
  };
}

export function cleanBlock(block: string[][]): string[][] {
  return (block || []).filter((row) => row.some((c) => c !== "" && c != null));
}

export function isTotalRow(row: string[]): boolean {
  if (!row || !row.length) return false;
  for (let i = 0; i < Math.min(row.length, 6); i++) {
    const s = String(row[i] ?? "").trim().toLowerCase();
    if (s === "total" || s === "total:" || s.indexOf("total ") === 0) return true;
  }
  return row.some((c) => String(c ?? "").trim().toLowerCase() === "total:");
}
