import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/seguridad/firmas/actas?rol=almacen|tecnico[&rma_case_id=N]
 *
 * Actas de RMA (ingresos y despachos) para que cada rol firme la suya desde
 * su panel: Almacén ve las de su sucursal de los últimos 45 días; RMA, las de
 * un caso (`rma_case_id`). Dice si el rol pedido ya firmó cada una.
 */
const ROLES = ["almacen", "tecnico", "seguridad", "cliente"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRoles(request, ["seguridad", "rma", "almacen"]);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { searchParams } = new URL(request.url);
    const rol = searchParams.get("rol") || "";
    if (!ROLES.includes(rol)) {
      return NextResponse.json({ error: "rol invalido" }, { status: 400 });
    }
    const caseId = parseInt(searchParams.get("rma_case_id") || "", 10) || null;

    const filtroIngreso: string[] = [];
    const filtroDespacho: string[] = [];
    const pIngreso: any[] = [rol];
    const pDespacho: any[] = [rol];
    if (caseId) {
      filtroIngreso.push("i.rma_case_id = ?");
      pIngreso.push(caseId);
      filtroDespacho.push("d.rma_case_id = ?");
      pDespacho.push(caseId);
    } else {
      filtroIngreso.push("i.fecha_entrega >= DATE_SUB(CURDATE(), INTERVAL 45 DAY)");
      filtroDespacho.push("d.fecha_despacho >= DATE_SUB(CURDATE(), INTERVAL 45 DAY)");
    }
    if (cids !== null) {
      filtroIngreso.push("i.cids = ?");
      pIngreso.push(cids);
      filtroDespacho.push("d.cids = ?");
      pDespacho.push(cids);
    }

    const r = await query(
      `SELECT * FROM (
         SELECT 'ingreso' AS tipo, i.id, i.fecha_entrega AS fecha, i.cliente_nombre AS cliente,
                i.hardware, i.nd_numero AS guia, rc.case_number,
                EXISTS (SELECT 1 FROM seguridad_firmas f
                         WHERE f.acta_tipo = 'ingreso' AND f.acta_id = i.id AND f.rol = ?) AS firmado
           FROM seguridad_ingresos i
           LEFT JOIN rma_cases rc ON rc.id = i.rma_case_id
          WHERE ${filtroIngreso.join(" AND ")}
         UNION ALL
         SELECT 'despacho' AS tipo, d.id, d.fecha_despacho AS fecha,
                COALESCE(d.cliente_retira, i2.cliente_nombre) AS cliente,
                i2.hardware, d.nd_numero AS guia, rc2.case_number,
                EXISTS (SELECT 1 FROM seguridad_firmas f
                         WHERE f.acta_tipo = 'despacho' AND f.acta_id = d.id AND f.rol = ?) AS firmado
           FROM seguridad_despachos d
           LEFT JOIN seguridad_ingresos i2 ON i2.id = d.ingreso_id
           LEFT JOIN rma_cases rc2 ON rc2.id = d.rma_case_id
          WHERE ${filtroDespacho.join(" AND ")}
       ) t
       ORDER BY firmado ASC, fecha DESC, id DESC
       LIMIT 100`,
      [...pIngreso, ...pDespacho],
    );

    return NextResponse.json({
      success: true,
      actas: (r.rows as any[]).map((x) => ({ ...x, firmado: !!Number(x.firmado) })),
    });
  } catch (error: any) {
    console.error("Error listando actas para firmar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
