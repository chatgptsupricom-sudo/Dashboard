import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

/**
 * Landing de "Estado de Cuentas": un vendedor por fila, con su cartera
 * pendiente total. De aqui se entra al detalle de sus clientes.
 *
 * Misma fuente que el resto del modulo de Cuentas por Cobrar
 * (digiflex.cxc.report, ver app/api/superadmin/cuentas-por-cobrar/detail) para
 * que los montos coincidan entre el listado de vendedores, el estado de
 * cuenta de cada cliente y el detalle de cada factura — mezclar ese reporte
 * con account.move directo (como hace top-clients/route.ts) daria numeros
 * distintos entre pantallas.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "asistente de ventas"]);
  if (auth.error) return auth.error;

  try {
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    const cids = Number(auth.payload?.cids);
    const companyIds =
      rol === "superadmin" || !Number.isFinite(cids) || cids <= 0
        ? [7, 9, 10]
        : [cids];

    const records = await fetchPaginated(
      "digiflex.cxc.report",
      [
        ["company_id", "in", companyIds],
        // != 0 (no solo > 0): incluye notas de credito abiertas, que en este
        // modelo traen amount_residual NEGATIVO — mismo fix que
        // detail/route.ts (92822c9). Sin esto, esta lista de "vendedores"
        // no coincidiria con lo que se ve al entrar al detalle de cada uno.
        ["amount_residual", "!=", 0],
      ],
      ["user_id", "user_name", "partner_id", "amount_residual", "days_overdue"],
    );

    const byUser: Record<
      number,
      {
        userId: number;
        userName: string;
        totalReceivable: number;
        totalOverdue: number;
        clientIds: Set<number>;
        invoiceCount: number;
      }
    > = {};

    records.forEach((r: any) => {
      const uid = r.user_id?.[0] || 0;
      if (!uid) return;
      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          userName: r.user_name || r.user_id?.[1] || "Sin asignar",
          totalReceivable: 0,
          totalOverdue: 0,
          clientIds: new Set(),
          invoiceCount: 0,
        };
      }
      const b = byUser[uid];
      // Con signo, no Math.abs: una nota de credito abierta (residual
      // negativo) tiene que restar del total del vendedor, no sumarse como
      // si fuera deuda adicional.
      const residual = r.amount_residual || 0;
      b.totalReceivable += residual;
      if ((r.days_overdue || 0) > 0) b.totalOverdue += residual;
      b.invoiceCount++;
      const pid = r.partner_id?.[0];
      if (pid) b.clientIds.add(pid);
    });

    const vendedores = Object.values(byUser)
      .map((v) => ({
        userId: v.userId,
        userName: v.userName,
        totalReceivable: Math.round(v.totalReceivable * 100) / 100,
        totalOverdue: Math.round(v.totalOverdue * 100) / 100,
        clientCount: v.clientIds.size,
        invoiceCount: v.invoiceCount,
      }))
      .sort((a, b) => b.totalReceivable - a.totalReceivable);

    return NextResponse.json({ success: true, vendedores });
  } catch (error: any) {
    console.error("Error listando vendedores para estado de cuenta:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
