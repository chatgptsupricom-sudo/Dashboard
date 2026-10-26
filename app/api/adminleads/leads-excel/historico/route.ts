// GET /api/adminleads/leads-excel/historico?sede=
//
// Pestaña "Histórico (Excel)" del Dashboard Leads: los leads de los Excel de
// antes del panel por mes (fecha de interacción) y por campaña: cuántos
// entraron, cuántos se vendieron (CONCRETADO), efectividad y monto. Sede = la
// del Excel; Panamá y Venezuela no se mezclan, como en el resto del Dashboard.

import { asegurarTablas } from "@/lib/adminleads/recompra";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  const userCids = Number(auth.payload?.cids) || null;
  let sede: number | null = [7, 9, 10].includes(Number(request.nextUrl.searchParams.get("sede")))
    ? Number(request.nextUrl.searchParams.get("sede"))
    : null;
  if (userCids === 7) sede = 7;
  else if ((userCids === 9 || userCids === 10) && sede === 7) sede = null;
  const donde = sede ? "company_id = ?" : "company_id <> 7";

  try {
    await asegurarTablas();
    const campos = `COUNT(*) AS leads,
                    SUM(estatus = 'CONCRETADO') AS vendidos,
                    IFNULL(SUM(CASE WHEN estatus = 'CONCRETADO' THEN monto END), 0) AS monto`;
    const [{ rows: porMes }, { rows: porCampana }] = await Promise.all([
      query(
        `SELECT DATE_FORMAT(fecha_interaccion, '%Y-%m') AS mes, ${campos}
           FROM leads_historicos WHERE ${donde} AND fecha_interaccion IS NOT NULL
          GROUP BY mes ORDER BY mes`,
        sede ? [sede] : [],
      ),
      query(
        `SELECT COALESCE(NULLIF(campana_editada, ''), NULLIF(campana, ''), 'Sin campaña') AS campana,
                DATE_FORMAT(MIN(fecha_interaccion), '%Y-%m-%d') AS desde,
                DATE_FORMAT(MAX(fecha_interaccion), '%Y-%m-%d') AS hasta, ${campos}
           FROM leads_historicos WHERE ${donde}
          GROUP BY campana ORDER BY desde DESC`,
        sede ? [sede] : [],
      ),
    ]);
    const fila = (r: any) => {
      const leads = Number(r.leads) || 0;
      const vendidos = Number(r.vendidos) || 0;
      return { ...r, leads, vendidos, monto: Number(r.monto) || 0, efectividad: leads ? (vendidos * 100) / leads : null };
    };
    const meses = porMes.map(fila);
    const total = fila({
      leads: meses.reduce((s: number, m: any) => s + m.leads, 0),
      vendidos: meses.reduce((s: number, m: any) => s + m.vendidos, 0),
      monto: meses.reduce((s: number, m: any) => s + m.monto, 0),
    });
    return NextResponse.json({ sede, total, porMes: meses, porCampana: porCampana.map(fila) });
  } catch (error: any) {
    console.error("GET /api/adminleads/leads-excel/historico error:", error?.message);
    return NextResponse.json({ error: error?.message || "Error leyendo el histórico" }, { status: 500 });
  }
}
