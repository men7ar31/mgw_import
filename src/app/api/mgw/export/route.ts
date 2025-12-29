import { NextResponse } from "next/server";
import { buildExcelBuffer } from "@/lib/mgw/exporter";

export async function GET() {
  try {
    const buffer = await buildExcelBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mgw_export.xlsx"`
      }
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
