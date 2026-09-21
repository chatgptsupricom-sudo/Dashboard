import { NextRequest, NextResponse } from "next/server";
import { accesoPlanificacion } from "@/lib/visitas/acceso";
import { marcarVisita, type EstadoVisita } from "@/lib/visitas/planificacion";

/**
 * POST { item_id, estado: "realizada" | "no_realizada" | "planificada", nota }
 * Solo gerencia / superadmin (igual que registrar visitas en el Stoplight).
 */
export async function POST(request: NextRequest) {
  const acceso = await accesoPlanificacion(request);
  if (acceso.error) return acceso.error;
  if (acceso.rol !== "gerencia") return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  try {
    const body = await request.json();
    const estado = String(body.estado) as EstadoVisita;
    if (!["realizada", "no_realizada", "planificada"].includes(estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const esSuper = String(acceso.payload.role || "").toLowerCase().trim() === "superadmin";
    await marcarVisita(Number(body.item_id), estado, String(body.nota || ""), acceso.usuario, acceso.uid, esSuper ? null : acceso.companyId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "NO_ENCONTRADA") return NextResponse.json({ error: "Visita no encontrada" }, { status: 404 });
    if (error.message === "OTRA_SEDE") return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    console.error("Error marcando visita:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
