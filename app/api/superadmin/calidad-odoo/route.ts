import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { filtrar, resultado, resumir, sedesDe } from "@/lib/calidad-odoo/servicio";

export const maxDuration = 120;

/**
 * Calidad de datos de Odoo (SuperAdmin > Auditoría). Solo lee Odoo: las
 * correcciones las hace el auditor en Odoo. Lógica en lib/calidad-odoo/.
 *
 * GET ?company_id=9|10|7|todas&refrescar=1   → resumen de todos los chequeos
 * GET ?company_id=…&chequeo=<id>             → registros de un chequeo
 * GET ?company_id=…&todo=1                   → todos los chequeos con sus registros (Excel)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const qs = request.nextUrl.searchParams;
  const sedes = sedesDe(qs.get("company_id"));
  if (!sedes) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });

  try {
    const r = await resultado(qs.get("refrescar") === "1");
    const id = qs.get("chequeo");
    if (id) {
      const c = r.chequeos.find((x) => x.id === id);
      if (!c) return NextResponse.json({ error: "Chequeo no encontrado" }, { status: 404 });
      return NextResponse.json({ success: true, data: { ...filtrar(c, sedes), generado: r.generado } });
    }
    if (qs.get("todo") === "1") {
      return NextResponse.json({ success: true, data: { chequeos: r.chequeos.map((c) => filtrar(c, sedes)), generado: r.generado } });
    }
    return NextResponse.json({ success: true, data: { ...resumir(r.chequeos, sedes), generado: r.generado } });
  } catch (error: any) {
    console.error("Error en calidad-odoo GET:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
