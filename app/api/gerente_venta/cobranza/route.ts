import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { cobranzaPorVendedor } from "@/lib/cxc/cobranzaVendedores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cobranza por vendedor (Gerencia de Ventas): facturado y cobrado del mes por
 * vendedor, con su cartera pendiente de hoy. `?mes=YYYY-MM` (por defecto el
 * actual). Solo superadmin elige sede con `?company_id=`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const rol = String(auth.payload.role || "").toLowerCase().trim();
    const sp = request.nextUrl.searchParams;
    const param = parseInt(sp.get("company_id") || "", 10);
    const companyId = rol === "superadmin" && Number.isFinite(param) ? param : Number(auth.payload.cids) || 9;

    const now = new Date();
    const mesParam = sp.get("mes") || "";
    const mes = /^\d{4}-\d{2}$/.test(mesParam)
      ? mesParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anio, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(new Date(anio, m, 0).getDate()).padStart(2, "0")}`;

    const vendedores = await cobranzaPorVendedor(companyId, desde, hasta);
    return NextResponse.json({ success: true, data: { mes, companyId, vendedores } });
  } catch (error: any) {
    console.error("Error en cobranza por vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
