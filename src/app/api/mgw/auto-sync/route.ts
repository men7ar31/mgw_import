import { NextRequest, NextResponse } from "next/server";
import { getAutoSyncStatus, startAutoSync, stopAutoSync } from "@/lib/mgw/auto-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, status: getAutoSyncStatus() });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) || {};
    const action = body.action || "start";
    const { intervalMs } = body;
    if (action === "stop") {
      const status = stopAutoSync();
      return NextResponse.json({ ok: true, status });
    }
    const status = await startAutoSync({ intervalMs });
    return NextResponse.json({ ok: true, status });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
