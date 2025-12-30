import { NextRequest, NextResponse } from "next/server";
import { pushToGoogleSheets } from "@/lib/mgw/sheets-export";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) || {};
    const { spreadsheetId, createNew } = body || {};
    const result = await pushToGoogleSheets({ spreadsheetId, createNew });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
