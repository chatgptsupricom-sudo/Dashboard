import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { datosSede } from "@/lib/auditoria-nc/servicio";
import { verificarSede } from "@/lib/auditoria-nc/verificacion";
import { leerPeriodo } from "../periodo";

export const maxDuration = 60;

/**
 * Verificación de los datos de Odoo de la auditoría de NC (una por sede).
 * Relee Odoo siempre: contra la caché, un documento nuevo daba falso "Error".
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const p = leerPeriodo(request);
  if ("error" in p) return p.error;

  try {
    const verificaciones = await Promise.all(p.sedes.map(async (s) => verificarSede(await datosSede(s, p.desde, p.hasta, true), p.desde, p.hasta)));
    return NextResponse.json({ success: true, data: { desde: p.desde, hasta: p.hasta, verificaciones } });
  } catch (error: any) {
    console.error("Error en auditoria-nc verificacion:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
