import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import {
  almacenSede,
  almacenables,
  cachear,
  diasEntre,
  hoyCaracas,
  inicioDiaUtc,
  leerTodo,
  sumarDias,
} from "@/lib/compras/datosOdoo";
import { historialStock, sumaEntre, ventasPorDia } from "@/lib/compras/historial";
import { sinIntercompania } from "@/lib/intercompania";
import { NextRequest, NextResponse } from "next/server";

const SEMANAS = 26;
/** Un pedido de estos últimos días sin entregar es lo normal, no un faltante. */
const DIAS_GRACIA_ENTREGA = 3;

/**
 * GET /api/compras/quiebres-historicos?sede=9 — productos que se quedaron
 * sin stock en los últimos 6 meses teniendo demanda, con el stock de cada
 * día reconstruido desde los movimientos de Odoo (lib/compras/historial.ts):
 * - Quiebres: veces que el stock llegó a 0 (episodios).
 * - Sem. en quiebre: semanas (de 26) con al menos un día sin stock.
 * - Pedidos sin entregar / unidades faltantes: líneas de pedidos de venta
 *   confirmados (sin intercompañía, de hace más de 3 días) con menos entregado
 *   que pedido.
 * Antes Panamá leía el almacén de Ofimaster Panamá (id 11) y la pantalla
 * pedía columnas que la API no calculaba.
 */
async function quiebresHistoricos(sedeId: number) {
  const hoy = hoyCaracas();
  const inicio = sumarDias(hoy, -(SEMANAS * 7 - 1));
  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const ini = sumarDias(inicio, i * 7);
    return { ini, fin: sumarDias(ini, 6) };
  });

  const [productos, almacen, hist, ventas, pedidos] = await Promise.all([
    almacenables(),
    almacenSede(sedeId),
    historialStock(sedeId, inicio, hoy),
    ventasPorDia(sedeId, sumarDias(inicio, -90), hoy),
    (async () =>
      leerTodo(
        "sale.order.line",
        [
          ["order_id.state", "in", ["sale", "done"]],
          ["company_id", "=", sedeId],
          ["product_id.type", "=", "product"],
          ["order_id.date_order", ">=", inicioDiaUtc(inicio)],
          ["order_id.date_order", "<", inicioDiaUtc(sumarDias(hoy, -DIAS_GRACIA_ENTREGA + 1))],
          await sinIntercompania("order_id.partner_id.commercial_partner_id"),
        ],
        ["product_id", "product_uom_qty", "qty_delivered"],
      ))(),
  ]);

  const faltantes = new Map<number, { lineas: number; unidades: number }>();
  for (const l of pedidos) {
    const falta = (Number(l.product_uom_qty) || 0) - (Number(l.qty_delivered) || 0);
    if (!l.product_id || falta <= 0) continue;
    const f = faltantes.get(l.product_id[0]) ?? { lineas: 0, unidades: 0 };
    f.lineas++;
    f.unidades += falta;
    faltantes.set(l.product_id[0], f);
  }

  const filas = [];
  for (const p of productos) {
    const dias = ventas.porProducto.get(p.id);
    // Días con venta, ordenados: "tenía demanda el día d" = vendió en los 90 días previos.
    const conVenta = dias ? [...dias].filter(([, q]) => q > 0).map(([d]) => d).sort() : [];
    const conDemanda = (d: string) => {
      const desde = sumarDias(d, -89);
      let lo = 0;
      let hi = conVenta.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (conVenta[mid] < desde) lo = mid + 1;
        else hi = mid;
      }
      return lo < conVenta.length && conVenta[lo] <= d;
    };
    // Sin movimientos y con stock hoy, nunca estuvo en 0.
    const pudoQuebrar = hist.conMovimiento.has(p.id) || hist.stockAlCierre(p.id, hoy) <= 0;

    let semanasConVenta = 0;
    let semanasQuiebre = 0;
    let quiebres = 0;
    let anterior = hist.stockAlCierre(p.id, sumarDias(inicio, -1));
    for (const s of semanas) {
      if (sumaEntre(dias, s.ini, s.fin) > 0) semanasConVenta++;
      if (!pudoQuebrar || conVenta.length === 0) continue;
      let sinStock = false;
      for (let d = s.ini; d <= s.fin && d <= hoy; d = sumarDias(d, 1)) {
        const stock = hist.stockAlCierre(p.id, d);
        if (stock <= 0 && conDemanda(d)) {
          sinStock = true;
          if (anterior > 0) quiebres++;
        }
        anterior = stock;
      }
      if (sinStock) semanasQuiebre++;
    }
    const f = faltantes.get(p.id);
    if (semanasQuiebre === 0 && !f) continue;
    filas.push({
      id: p.id,
      codigo: p.codigo,
      name: p.nombre,
      categoria: p.categoria,
      stockActual: Math.max(0, (almacen.stock.get(p.id)?.fisico ?? 0) - (almacen.stock.get(p.id)?.reservado ?? 0)),
      totalSalidas180d: Math.max(0, Math.round(sumaEntre(dias, inicio, hoy))),
      semanasConVenta,
      quiebresContados: quiebres,
      semanasQuiebre,
      ventasNoCumplidas: f?.lineas ?? 0,
      unidadesFaltantes: Math.round(f?.unidades ?? 0),
      frecuenciaQuiebre: Math.round((semanasQuiebre / SEMANAS) * 100),
      diasAnalizados: diasEntre(inicio, hoy) + 1,
    });
  }
  return filas.sort((a, b) => b.semanasQuiebre - a.semanasQuiebre || b.unidadesFaltantes - a.unidadesFaltantes);
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const data = await cachear(`quiebres-hist|${sedeId}|${hoyCaracas()}`, () => quiebresHistoricos(sedeId), 20 * 60 * 1000);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Error en API quiebres-historicos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
