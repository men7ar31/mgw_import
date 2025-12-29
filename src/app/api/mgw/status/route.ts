import { NextResponse } from "next/server";
import { getStatus } from "@/lib/mgw/importer";

export async function GET() {
  try {
    const cursor = await getStatus();
    return NextResponse.json({ ok: true, cursor });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
