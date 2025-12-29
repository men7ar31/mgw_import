import { NextResponse } from "next/server";
import { startImport } from "@/lib/mgw/importer";

export async function POST(req: Request) {
  try {
    let fechaOverride: string | undefined;
    try {
      const body = await req.json();
      fechaOverride = body?.fecha;
    } catch (e) {
      fechaOverride = undefined;
    }
    const cursor = await startImport(fechaOverride);
    return NextResponse.json({ ok: true, cursor });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
