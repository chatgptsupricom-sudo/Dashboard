import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { auditarSede } from "@/lib/metas-marca/auditoria";
import { inventarioSede } from "@/lib/metas-marca/inventario";
import { leerMetas } from "@/lib/metas-marca/metas";
import { partnersIntercompania } from "@/lib/intercompania";
import { mesActual, mesValido, sedesDe, ventasDelMes } from "@/lib/metas-marca/servicio";

export const maxDuration = 60;

/**
 * Auditoría de los datos de Odoo de Metas por marca (lib/metas-marca/auditoria).
 * GET ?company_id=9|10|7|todas&mes=YYYY-MM  → una auditoría por sede.
 * GET ...&lineas=1 → además, las líneas leídas (para el Excel de verificación).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDe(sp.get("company_id"));
  if (!sedes) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const mes = mesValido(sp.get("mes")) || mesActual();

  try {
    // La auditoría relee Odoo siempre: contra la caché de 3 min, una factura
    // publicada entretanto salía como "Error" de conteo y de cuadre. El Excel
    // (lineas=1) sí usa la caché, para bajar exactamente lo que se auditó.
    const exportar = sp.get("lineas") === "1";
    const fresco = !exportar || sp.get("refrescar") === "1";
    if (fresco && sp.get("refrescar") === "1") await partnersIntercompania(true);
    const ventas = await Promise.all(sedes.map((s) => ventasDelMes(s, mes, fresco)));

    if (exportar) {
      const lineas = ventas.flatMap((v) => v.lineas.map((l) => ({ ...l, companyId: v.companyId })));
      const facturas = new Map(ventas.flatMap((v) => v.facturas).map((f) => [f.id, f.numero]));
      const inventarios = await Promise.all(sedes.map((s) => inventarioSede(s)));
      return NextResponse.json({
        success: true,
        data: lineas.map((l) => ({ ...l, factura: facturas.get(l.facturaId) || "" })),
        inventario: inventarios.flatMap((inv) => inv.productos.map((p) => ({ ...p, companyId: inv.companyId, ubicacion: inv.ubicacion }))),
      });
    }

    const auditorias = await Promise.all(ventas.map(async (v) => {
      const [metas, inventario] = await Promise.all([
        leerMetas([v.companyId], mes),
        inventarioSede(v.companyId, sp.get("refrescar") === "1"),
      ]);
      return auditarSede(v, metas, inventario);
    }));
    return NextResponse.json({ success: true, data: { mes, auditorias } });
  } catch (error: any) {
    console.error("Error en metas-marca auditoria:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
