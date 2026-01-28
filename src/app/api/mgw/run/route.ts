import { NextResponse } from "next/server";
import { runImportOnce } from "@/lib/mgw/importer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runImportOnce();
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
