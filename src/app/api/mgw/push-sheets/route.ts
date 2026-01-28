import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // Sheets export deshabilitado a pedido: solo base de datos.
    const message = "Exportar a Google Sheets está deshabilitado. Los datos solo se guardan en la base de datos.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
}
