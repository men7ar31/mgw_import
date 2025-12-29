import { NextResponse } from "next/server";
import { resumeImport } from "@/lib/mgw/importer";

export async function POST() {
  try {
    const cursor = await resumeImport();
    return NextResponse.json({ ok: true, cursor });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
