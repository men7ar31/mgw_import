import * as XLSX from "xlsx";

export function xlsBufferTo2D(buffer: Buffer): any[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: ""
  }) as any[][];

  if (!data || !data.length) return data;

  const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);
  return data.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
}

export function parseVentasExportTo2D(buffer: Buffer): string[][] {
  const snippet = buffer.slice(0, 2048).toString("utf8").toLowerCase();
  const looksLikeHtml = snippet.trim().startsWith("<") || snippet.indexOf("<table") >= 0;
  if (!looksLikeHtml) return xlsBufferTo2D(buffer);

  const html = buffer.toString("utf8");
  return parseHtmlTableTo2D(html);
}

function parseHtmlTableTo2D(html: string): string[][] {
  // Lazy import to avoid adding cheerio to the default XLS path
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cheerio = require("cheerio") as typeof import("cheerio");

  const $ = cheerio.load(html);
  const table = $("table").first();
  if (!table || table.length === 0) return [];

  const rows: string[][] = [];
  const rowspanMap: Record<number, number> = {};

  table.find("tr").each((_, tr) => {
    const row: string[] = [];

    // Apply pending rowspans (occupy columns)
    Object.keys(rowspanMap).forEach((colStr) => {
      const col = Number(colStr);
      if (rowspanMap[col] > 0) {
        row[col] = "";
        rowspanMap[col] -= 1;
        if (rowspanMap[col] === 0) delete rowspanMap[col];
      }
    });

    let colIdx = 0;
    $(tr)
      .children("th,td")
      .each((__, cell) => {
        while (row[colIdx] !== undefined) colIdx += 1;

        const value = $(cell).text().trim();
        const colspan = parseInt($(cell).attr("colspan") || "1", 10) || 1;
        const rowspan = parseInt($(cell).attr("rowspan") || "1", 10) || 1;

        for (let c = 0; c < colspan; c++) {
          const target = colIdx + c;
          row[target] = c === 0 ? value : "";
          if (rowspan > 1) {
            rowspanMap[target] = Math.max(rowspanMap[target] || 0, rowspan - 1);
          }
        }

        colIdx += colspan;
      });

    rows.push(row);
  });

  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
}
