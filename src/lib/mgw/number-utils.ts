export function parseFlexibleNumber(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace(/\s+/g, "");
  s = s.replace(/\$/g, "");

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return null;

  if (/^,0+$/.test(s)) return 0;
  if (/^0,0+$/.test(s)) return 0;

  const hasDot = s.indexOf(".") >= 0;
  const hasComma = s.indexOf(",") >= 0;

  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    s = s.replace(",", ".");
  } else if (!hasComma && hasDot) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, "");
  }

  s = s.replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;

  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function parseNumberAny(v: unknown, blankToZero: boolean): number | null {
  const n = parseFlexibleNumber(v);
  if (n == null) return blankToZero ? 0 : null;
  return n;
}

export function round2(n: unknown): number | null {
  if (n == null || n === "") return null;
  let val: number | null = null;
  if (typeof n !== "number") {
    const p = parseFlexibleNumber(n);
    val = p == null ? null : p;
  } else {
    val = n;
  }
  if (val == null) return null;
  return Math.round(val * 100) / 100;
}
