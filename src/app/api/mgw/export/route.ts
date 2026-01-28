import { NextResponse } from "next/server";
import { buildExcelBuffer } from "@/lib/mgw/exporter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const buffer = await buildExcelBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="mgw_export.xlsx"`
      }
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
