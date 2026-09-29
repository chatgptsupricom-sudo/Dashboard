import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { estadoCuentaVendedor } from "@/lib/cxc/cobranzaVendedores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Estado de cuenta personal de un vendedor (Gerencia de Ventas → Cobranza):
 * `?user_id=` (0 = sin vendedor) y `?mes=YYYY-MM`. Mismas cifras que su fila
 * en /api/gerente_venta/cobranza, con el detalle documento por documento para
 * exportarlo a Excel. Solo superadmin elige sede con `?company_id=`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const rol = String(auth.payload.role || "").toLowerCase().trim();
    const sp = request.nextUrl.searchParams;
    const param = parseInt(sp.get("company_id") || "", 10);
    const companyId = rol === "superadmin" && Number.isFinite(param) ? param : Number(auth.payload.cids) || 9;

    const userId = parseInt(sp.get("user_id") || "", 10);
    if (!Number.isFinite(userId) || userId < 0) {
      return NextResponse.json({ error: "user_id inválido" }, { status: 400 });
    }

    const now = new Date();
    const mesParam = sp.get("mes") || "";
    const mes = /^\d{4}-\d{2}$/.test(mesParam)
      ? mesParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anio, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(new Date(anio, m, 0).getDate()).padStart(2, "0")}`;

    const estado = await estadoCuentaVendedor(companyId, userId, desde, hasta);
    if (!estado) return NextResponse.json({ error: "Sin movimientos para ese vendedor" }, { status: 404 });
    return NextResponse.json({ success: true, data: { mes, companyId, ...estado } });
  } catch (error: any) {
    console.error("Error en estado de cuenta del vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
