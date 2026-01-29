import { DATE_FMT } from "./constants";

const MGW_TIMEZONE = "America/Argentina/Buenos_Aires";

export function normalizeDateInput(input: unknown): string {
  if (input == null || input === "") return "";

  if (input instanceof Date && !isNaN(input.getTime())) {
    return formatDate(input);
  }

  const s = String(input).trim();
  if (!s) return "";

  const dt = s.match(/^(\d{4}-\d{2}-\d{2})\s+\d{1,2}:\d{2}/);
  if (dt) return dt[1];

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dd = ("0" + m[1]).slice(-2);
    const mm = ("0" + m[2]).slice(-2);
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }

  return "";
}

export function formatDate(dateObj: Date): string {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: MGW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dateObj);
  return iso;
}

export function hoyStr(): string {
  return formatDate(new Date());
}

export function listDates(desdeStr: string, hastaStr: string): string[] {
  const out: string[] = [];
  let d = toUtc(desdeStr);
  const end = toUtc(hastaStr);
  while (d.getTime() <= end.getTime()) {
    out.push(formatDate(d));
    d = addDaysUtc(d, 1);
  }
  return out;
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = toUtc(dateStr);
  const shifted = addDaysUtc(d, days);
  return formatDateUtc(shifted);
}

function toUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUtc(dateObj: Date): string {
  const y = dateObj.getUTCFullYear();
  const m = ("0" + (dateObj.getUTCMonth() + 1)).slice(-2);
  const d = ("0" + dateObj.getUTCDate()).slice(-2);
  return `${y}-${m}-${d}`;
}

function addDaysUtc(d: Date, days: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}
