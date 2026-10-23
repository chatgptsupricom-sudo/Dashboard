import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { detalleCliente } from "@/lib/mapaClientes/detalleCliente";

// GET /api/gerente_venta/mapa_cliente/detalle?partner_id=&startDate=&endDate=
// Ficha de cliente del Mapa de Clientes: plazo de pago, ultima compra,
// facturas y productos, siempre de la sede del usuario (payload.cids).
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  const companyId = Number(auth.payload?.cids);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json({ error: "Tu usuario no tiene una sede asignada (cids)." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const partnerId = Number(searchParams.get("partner_id"));
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: "Falta partner_id" }, { status: 400 });
  }
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const desde = searchParams.get("startDate");
  const hasta = searchParams.get("endDate");
  const conRango = !!(desde && hasta && re.test(desde) && re.test(hasta));

  try {
    const detalle = await detalleCliente(partnerId, companyId, conRango ? desde : null, conRango ? hasta : null);
    if (!detalle) return NextResponse.json({ error: "Cliente no encontrado en tu sede" }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (error: any) {
    console.error("Error detalle cliente (mapa):", error?.message || error);
    if (error instanceof OdooUnreachableError) {
      return NextResponse.json({ error: "No se pudo conectar con Odoo" }, { status: 503 });
    }
    return NextResponse.json({ error: error?.message ? `Error leyendo Odoo: ${error.message}` : "Error interno" }, { status: 500 });
  }
}
