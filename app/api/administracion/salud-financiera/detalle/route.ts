import { NextRequest, NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { canViewAdministracion, getAdminUser, sedesDelUsuario } from "@/lib/administracion/auth";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { companyIdsDeEmpresa } from "@/lib/administracion/empresas";
import { detalleAlerta } from "@/lib/administracion/saludDetalle";

// GET /api/administracion/salud-financiera/detalle?alerta=<id>&empresa=&mes=YYYY-MM
// De donde sale una alerta del Top 10 y los registros de Odoo que la componen.
export async function GET(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canViewAdministracion(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const p = request.nextUrl.searchParams;
    const alerta = (p.get("alerta") || "").trim();
    const mes = p.get("mes") || "";
    if (!/^[a-z0-9_.-]{1,120}$/i.test(alerta) || !/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ error: "Parámetros inválidos: alerta y mes (YYYY-MM)" }, { status: 400 });
    }
    // Administracion solo lee la sede de su `cids`, igual que el indice.
    const companyIds = sedesDelUsuario(user, companyIdsDeEmpresa((p.get("empresa") || "").toLowerCase().trim()));
    if (companyIds.length === 0) return respuestaSedeNoPermitida();

    const detalle = await detalleAlerta(alerta, companyIds, mes);
    if (!detalle) return NextResponse.json({ error: "Esa alerta no tiene detalle" }, { status: 404 });
    // Sin la accion del menu (no se encontro en Odoo) no se ofrece el enlace.
    if (detalle.odoo && !detalle.odoo.url) detalle.odoo = null;
    return NextResponse.json({ success: true, ...detalle });
  } catch (error: any) {
    if (error instanceof OdooUnreachableError) {
      return NextResponse.json({ success: false, error: "No se pudo conectar con Odoo" }, { status: 503 });
    }
    console.error("[salud] detalle de alerta:", error?.message);
    return NextResponse.json({ error: "No se pudo cargar el detalle" }, { status: 500 });
  }
}
