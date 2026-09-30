import { requireRoles } from "@/lib/auth/roles";
import { SEDES, leerSede } from "@/lib/compras/constants";
import { almacenSede, almacenables, costoOdoo, disponible } from "@/lib/compras/datosOdoo";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/sin-costo?sede=9 — productos con stock disponible en el
 * almacén principal de la sede y sin costo (`standard_price` = 0) en Odoo:
 * son los que dejan el capital estancado por debajo de lo real. Mismo stock
 * que el resto de Compras (lib/compras/datosOdoo.ts); antes Panamá leía el
 * almacén de Ofimaster Panamá (id 11) en vez del de Supricom, S.A. (id 7).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const nombre = SEDES.find((s) => Number(s.id) === sedeId)?.label ?? String(sedeId);
    const [productos, almacen, costo] = await Promise.all([almacenables(), almacenSede(sedeId), costoOdoo(sedeId)]);
    const data = productos
      .map((p) => ({ p, stock: disponible(almacen.stock.get(p.id)) }))
      .filter(({ p, stock }) => stock > 0 && !((costo.get(p.id) ?? 0) > 0))
      .map(({ p, stock }) => ({
        id: p.id,
        codigo: p.codigo,
        name: p.nombre,
        categoria: p.categoria,
        stockTotal: stock,
        stockPorSede: { [nombre]: stock },
        sinCostoEn: [nombre],
      }))
      .sort((a, b) => b.stockTotal - a.stockTotal);
    return NextResponse.json({ success: true, total: data.length, data });
  } catch (error: any) {
    console.error("❌ Error en API sin-costo:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
