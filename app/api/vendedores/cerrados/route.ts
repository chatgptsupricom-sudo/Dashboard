import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = parseInt(payload.uid as string);

    // 1. Buscamos el ID del vendedor
    const sellerResult = await query(
      "SELECT id FROM sellers WHERE user_id = ?",
      [userId],
    );
    const sellerRows = Array.isArray(sellerResult)
      ? sellerResult
      : (sellerResult as any).rows;

    if (!sellerRows || sellerRows.length === 0) {
      return NextResponse.json([], { status: 404 });
    }

    const sellerId = sellerRows[0].id;

    // 2. Consulta de leads filtrados por seller_id Y status 'Cerrado'
    const sql = `
      SELECT * FROM leads
      WHERE seller_id = ? AND status = 'Cerrado'
      ORDER BY fecha_ingreso DESC
    `;
    const result = await query(sql, [sellerId]);

    const rows = Array.isArray(result) ? result : (result as any).rows;

    return NextResponse.json(rows || [], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Error crítico en API de Leads Cerrados:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// El PATCH se mantiene igual para permitir actualizar el status si es necesario
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    await query("UPDATE leads SET status = ? WHERE id = ?", [status, id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
