import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ case_number: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { case_number } = await params;
    if (!case_number || case_number.length > 20) {
      return NextResponse.json({ error: "case_number invalido" }, { status: 400 });
    }

    let rmaResult;
    try {
      rmaResult = await query(
        `SELECT id, case_number, client_name, hardware, serial, invoice_number, reported_fault
         FROM rma_cases
         WHERE case_number = ?`,
        [case_number],
      );
    } catch (e: any) {
      console.error("Error buscando caso RMA:", e?.message);
      return NextResponse.json({ error: "Error al buscar el ticket" }, { status: 500 });
    }

    if (rmaResult.rows.length === 0) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, case: rmaResult.rows[0] });
  } catch (error: any) {
    console.error("Error buscando ticket:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
