import { NextRequest, NextResponse } from "next/server";
import { accesoPlanificacion } from "@/lib/visitas/acceso";
import { resumenPorAsesor } from "@/lib/visitas/planificacion";

export const dynamic = "force-dynamic";

/** GET ?mes=YYYY-MM → cobertura territorial del mes por asesor. */
export async function GET(request: NextRequest) {
  const acceso = await accesoPlanificacion(request);
  if (acceso.error) return acceso.error;
  try {
    const now = new Date();
    const p = request.nextUrl.searchParams.get("mes") || "";
    const mes = /^\d{4}-\d{2}$/.test(p) ? p : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = mes.split("-").map(Number);
    let asesores = await resumenPorAsesor(acceso.companyId, `${mes}-01`, `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`, now);
    if (acceso.rol === "vendedor") asesores = asesores.filter((a) => a.userId === acceso.uid);
    return NextResponse.json({ success: true, data: { mes, asesores } });
  } catch (error: any) {
    console.error("Error en resumen de planificación:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
