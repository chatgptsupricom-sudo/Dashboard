import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { auditoriaPeriodo } from "@/lib/auditoria-nc/servicio";
import { leerPeriodo } from "./periodo";

export const maxDuration = 60;

/**
 * Auditoría de notas de crédito, facturas anuladas y facturas reabiertas
 * (SuperAdmin). Lógica en lib/auditoria-nc/.
 * GET ?company_id=9|10|7|todas&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&refrescar=1
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const p = leerPeriodo(request);
  if ("error" in p) return p.error;
  const refrescar = request.nextUrl.searchParams.get("refrescar") === "1";

  try {
    if (refrescar) await partnersIntercompania(true);
    const r = await auditoriaPeriodo(p.sedes, p.desde, p.hasta, refrescar);
    // El historial de impuestos por línea es largo (una fila por línea); en la
    // lista va resumido en la alerta y el detalle completo sale de /documento.
    // Sin alertas no hay nada que mostrar en "Qué cambió": se omiten (achica la respuesta).
    const sinLineas = <T extends { cambios: { campo: string }[]; alertas: unknown[] }>(x: T) =>
      ({ ...x, cambios: x.alertas.length ? x.cambios.filter((c) => c.campo !== "tax_ids") : [] });
    return NextResponse.json({
      success: true,
      data: {
        ...r,
        reabiertas: r.reabiertas.map(sinLineas),
        anuladas: r.anuladas.map((a) => ({ ...a, cambiosAntes: a.cambiosAntes.filter((c) => c.campo !== "tax_ids") })),
      },
    });
  } catch (error: any) {
    console.error("Error en auditoria-nc GET:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
