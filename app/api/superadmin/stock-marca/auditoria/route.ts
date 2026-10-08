import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { auditarSede } from "@/lib/stock-marca/auditoria";
import { periodoDe } from "@/lib/stock-marca/periodo";
import { sedesDe } from "@/lib/stock-marca/servicio";

export const maxDuration = 120;

/**
 * Auditoría de Stock por marca (lib/stock-marca/auditoria): una por sede,
 * siempre con datos releídos de Odoo.
 * GET ?company_id=9|10|7|todas&modo=mes|30|90&mes=YYYY-MM&ic=1 (ic solo con una sede, como la pantalla)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDe(sp.get("company_id"));
  if (!sedes) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const periodo = periodoDe(sp.get("modo"), sp.get("mes"));

  try {
    // Una sede a la vez: cada auditoría hace decenas de consultas a Odoo.
    const auditorias = [];
    const ic = sedes.length === 1 && sp.get("ic") === "1";
    for (const s of sedes) auditorias.push(await auditarSede(s, periodo, ic));
    return NextResponse.json({ success: true, data: { periodo, auditorias } });
  } catch (error: any) {
    console.error("Error en stock-marca auditoria:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "No se pudo completar la auditoría" }, { status });
  }
}
