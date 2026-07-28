import { query } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { NextResponse } from "next/server";

const ADMIN_ROLES = ["adminLeads", "superAdmin", "programmers"];

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];

    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload || !ADMIN_ROLES.includes(payload.role as string)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { id, status } = await request.json();
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const targetStatus = status ?? "NUEVO";

    // Log the status change in history
    const current: any = await query(
      "SELECT status, seller_id, motivo_cierre FROM leads WHERE id = ?",
      [id]
    );
    const leadRows = Array.isArray(current) ? current : current.rows;
    const lead = leadRows?.[0];
    if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

    if (lead.status !== targetStatus) {
      await query(
        `INSERT INTO leads_status_history (lead_id, status_anterior, status_nuevo, seller_id, fecha_cambio)
         VALUES (?, ?, ?, ?, NOW())`,
        [id, lead.status, targetStatus, lead.seller_id]
      );
    }

    // Solo los cierres PERDIDO cuentan como reactivación
    const esPerdido = lead.motivo_cierre !== "GANADO" && lead.motivo_cierre !== "VENTA";

    await query(
      "UPDATE leads SET status = ?, motivo_cierre = NULL, reactivacion = ? WHERE id = ?",
      [targetStatus, esPerdido ? 1 : 0, id]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en reactivar lead (admin):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
