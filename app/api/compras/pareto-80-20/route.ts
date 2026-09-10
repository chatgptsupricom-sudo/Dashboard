import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Las compras son mucho menos frecuentes que las ventas, asi que 90 dias
// puede dejar fuera productos que se compran por temporada. La ventana es
// elegible desde la UI; 90 dias queda como default para no cambiar de golpe
// lo que ya veia compras.
const VENTANAS_VALIDAS = [90, 180, 365];
const VENTANA_DEFAULT = 90;

const COMPANIES = [9, 10, 7];

/**
 * Clasificacion ABC por monto comprado (curva de Pareto): mismo criterio que
 * clasificarABC() en app/api/compras/mayor_rotacion/route.ts (A = hasta 80%
 * acumulado, B = hasta 95%, C = resto), pero aplicado a price_subtotal de las
 * lineas de compra — responde "en que productos se concentra el gasto de
 * compra", que es distinto de la rotacion de inventario de mayor_rotacion.
 */
function clasificarPorMonto(
  productos: { id: number; monto: number }[],
): Map<number, { clase: "A" | "B" | "C"; pctIndividual: number; pctAcumulado: number }> {
  const total = productos.reduce((s, p) => s + p.monto, 0);
  const sorted = [...productos].sort((a, b) => b.monto - a.monto);
  const map = new Map<number, { clase: "A" | "B" | "C"; pctIndividual: number; pctAcumulado: number }>();
  let acumulado = 0;
  for (const p of sorted) {
    acumulado += p.monto;
    const pctAcumulado = total > 0 ? (acumulado / total) * 100 : 100;
    const pctIndividual = total > 0 ? (p.monto / total) * 100 : 0;
    const clase = pctAcumulado <= 80 ? "A" : pctAcumulado <= 95 ? "B" : "C";
    map.set(p.id, {
      clase,
      pctIndividual: Number(pctIndividual.toFixed(2)),
      pctAcumulado: Number(pctAcumulado.toFixed(2)),
    });
  }
  return map;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;
    const companies = sedeId ? [sedeId] : COMPANIES;

    const diasParam = parseInt(searchParams.get("dias") || "", 10);
    const dias = VENTANAS_VALIDAS.includes(diasParam) ? diasParam : VENTANA_DEFAULT;

    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const desdeStr = desde.toISOString().split("T")[0];

    // purchase.order.line, NO account.move.line: este reporte vive bajo
    // /compras y antes consultaba facturas de VENTA (out_invoice/out_refund),
    // asi que mostraba unidades vendidas disfrazadas de compradas (issue #176).
    //
    // Solo `state = "purchase"` (ordenes confirmadas) — borradores y
    // canceladas no son compras reales. Mismo criterio que
    // lib/compras/purchaseOrders.ts::getPendingPurchaseQtyByProduct().
    //
    // A diferencia de la version de ventas, aca NO se excluyen los partners
    // del grupo ("supricom" / "office solution"): las sucursales le compran
    // de verdad a la importadora del grupo (SUPRICOM LLC) y a la otra
    // compania, y esas SI son compras desde el punto de vista de la sede.
    // Filtrarlas vaciaba el reporte — verificado contra Odoo: el producto del
    // reporte del bug (SATUR1000+) tiene sus 1188 unidades en una orden a
    // SUPRICOM LLC.
    //
    // Tampoco hay que restar devoluciones: al sumar `product_qty` de ordenes
    // confirmadas no entran notas de credito, que era la causa secundaria del
    // numero inflado.
    //
    // Se excluyen los productos de tipo servicio: en las ordenes de compra
    // viajan gastos modelados como producto (el caso gordo es `FLE_ACA_V`
    // "GASTO FLETES Y ACARREOS VALENCIA", ~$349.000 en 90 dias repartidos en
    // 34 lineas de `product_qty = 1`). Agregados como un SKU mas se metian en
    // Clase A y desplazaban productos reales de una curva cuyo objetivo es
    // priorizar QUE COMPRAR. Se filtra por `!= "service"` y no por
    // `in ["product","consu"]` a proposito: los consumibles (toners, tintas,
    // cartuchos) SI son mercancia real y tienen que contar.
    const domain: any[] = [
      ["state", "=", "purchase"],
      ["product_id", "!=", false],
      ["product_id.type", "!=", "service"],
      ["date_order", ">=", desdeStr],
      ["company_id", "in", companies],
    ];

    const lines: any[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "purchase.order.line",
        "search_read",
        [domain],
        {
          fields: ["product_id", "product_qty", "price_subtotal"],
          order: "id asc",
          limit: 5000,
          offset,
        },
      );
      if (!page || page.length === 0) break;
      lines.push(...page);
      if (page.length < 5000) break;
      offset += 5000;
    }

    const stats: Record<number, { monto: number; unidades: number }> = {};
    lines.forEach((l: any) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      if (!stats[id]) stats[id] = { monto: 0, unidades: 0 };
      stats[id].monto += l.price_subtotal || 0;
      stats[id].unidades += l.product_qty || 0;
    });

    const productIds = Object.keys(stats)
      .map(Number)
      .filter((id) => stats[id].monto > 0);

    if (productIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        resumen: { totalProductos: 0, productosClaseA: 0, pctProductosClaseA: 0, pctMontoClaseA: 0 },
        dias,
      });
    }

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productIds]]],
      { fields: ["id", "default_code", "name", "categ_id"], limit: 0 },
    );

    const clasificacion = clasificarPorMonto(
      productIds.map((id) => ({ id, monto: stats[id].monto })),
    );

    const data = (productos || [])
      .map((prod: any) => {
        const pId = prod.id;
        const clase = clasificacion.get(pId);
        return {
          id: pId,
          codigo: prod.default_code ? String(prod.default_code).trim() : `PROD-${pId}`,
          name: prod.name,
          marca: prod.name ? prod.name.split(" ")[0].toUpperCase() : "SIN MARCA",
          categoria: prod.categ_id ? prod.categ_id[1] : "Sin Categoría",
          monto: Number(stats[pId].monto.toFixed(2)),
          unidades: Math.round(stats[pId].unidades),
          pctIndividual: clase?.pctIndividual ?? 0,
          pctAcumulado: clase?.pctAcumulado ?? 0,
          clase: clase?.clase ?? "C",
        };
      })
      .sort((a, b) => b.monto - a.monto);

    const productosClaseA = data.filter((d) => d.clase === "A").length;
    const montoClaseA = data
      .filter((d) => d.clase === "A")
      .reduce((s, d) => s + d.monto, 0);
    const montoTotal = data.reduce((s, d) => s + d.monto, 0);

    const resumen = {
      totalProductos: data.length,
      productosClaseA,
      pctProductosClaseA: data.length > 0 ? Number(((productosClaseA / data.length) * 100).toFixed(1)) : 0,
      pctMontoClaseA: montoTotal > 0 ? Number(((montoClaseA / montoTotal) * 100).toFixed(1)) : 0,
    };

    return NextResponse.json({ success: true, data, resumen, dias });
  } catch (error: any) {
    console.error("❌ Error en API compras/pareto-80-20:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
