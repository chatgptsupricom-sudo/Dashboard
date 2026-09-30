import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { catalogo, hoyCaracas, inicioDiaUtc, leerTodo, sumarDias } from "@/lib/compras/datosOdoo";
import { NextRequest, NextResponse } from "next/server";

// Las compras son mucho menos frecuentes que las ventas, asi que 90 dias
// puede dejar fuera productos que se compran por temporada. La ventana es
// elegible desde la UI; 90 dias queda como default para no cambiar de golpe
// lo que ya veia compras.
const VENTANAS_VALIDAS = [90, 180, 365];
const VENTANA_DEFAULT = 90;

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

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const { searchParams } = new URL(request.url);
    const diasParam = parseInt(searchParams.get("dias") || "", 10);
    const dias = VENTANAS_VALIDAS.includes(diasParam) ? diasParam : VENTANA_DEFAULT;
    // `dias` días de calendario contando hoy (Caracas); date_order es un
    // datetime en UTC.
    const desde = sumarDias(hoyCaracas(), -(dias - 1));

    // purchase.order.line, NO account.move.line: este reporte vive bajo
    // /compras y antes consultaba facturas de VENTA (out_invoice/out_refund),
    // asi que mostraba unidades vendidas disfrazadas de compradas (issue #176).
    //
    // Solo `state = "purchase"` (ordenes confirmadas) — borradores y
    // canceladas no son compras reales.
    //
    // A diferencia de la version de ventas, aca NO se excluyen los partners
    // del grupo ("supricom" / "office solution"): las sucursales le compran
    // de verdad a la importadora del grupo (SUPRICOM LLC) y a la otra
    // compania, y esas SI son compras desde el punto de vista de la sede.
    // Filtrarlas vaciaba el reporte — verificado contra Odoo: el producto del
    // reporte del bug (SATUR1000+) tiene sus 1188 unidades en una orden a
    // SUPRICOM LLC.
    //
    // Se excluyen los productos de tipo servicio: en las ordenes de compra
    // viajan gastos modelados como producto (el caso gordo es `FLE_ACA_V`
    // "GASTO FLETES Y ACARREOS VALENCIA", ~$349.000 en 90 dias repartidos en
    // 34 lineas de `product_qty = 1`). Agregados como un SKU mas se metian en
    // Clase A y desplazaban productos reales de una curva cuyo objetivo es
    // priorizar QUE COMPRAR. Se filtra por `!= "service"` y no por
    // `in ["product","consu"]` a proposito: los consumibles (toners, tintas,
    // cartuchos) SI son mercancia real y tienen que contar.
    const lines = await leerTodo(
      "purchase.order.line",
      [
        ["state", "=", "purchase"],
        ["product_id", "!=", false],
        ["product_id.type", "!=", "service"],
        ["date_order", ">=", inicioDiaUtc(desde)],
        ["company_id", "=", sedeId],
      ],
      ["product_id", "product_qty", "qty_received", "price_subtotal"],
    );

    // Cantidad comprada de verdad = lo recibido + lo que falta por recibir.
    // No `product_qty` de la orden: una orden confirmada que se recibio y se
    // devolvio al proveedor, o a la que se le cancelo el resto, sigue en
    // estado "purchase" con su cantidad original. En Valencia la P-00103
    // ($614k, factura INV00928) se recibio y se devolvio el mismo dia y la
    // compra real es la P-00105: sumando product_qty se contaba dos veces.
    const pendiente = new Map<number, number>();
    for (let i = 0; i < lines.length; i += 2000) {
      const grupos = await callOdooRPC<any[]>("stock.move", "read_group", [
        [["purchase_line_id", "in", lines.slice(i, i + 2000).map((l) => l.id)], ["state", "not in", ["draft", "done", "cancel"]]],
        ["product_uom_qty:sum"],
        ["purchase_line_id"],
      ], { lazy: false });
      if (!Array.isArray(grupos)) throw new Error("Odoo no respondió las recepciones pendientes");
      for (const g of grupos) if (g.purchase_line_id) pendiente.set(g.purchase_line_id[0], Number(g.product_uom_qty) || 0);
    }

    const stats: Record<number, { monto: number; unidades: number }> = {};
    lines.forEach((l: any) => {
      if (!l.product_id) return;
      const pedida = Number(l.product_qty) || 0;
      if (pedida <= 0) return;
      const comprada = (Number(l.qty_received) || 0) + (pendiente.get(l.id) ?? 0);
      if (comprada <= 0) return;
      const id = l.product_id[0];
      if (!stats[id]) stats[id] = { monto: 0, unidades: 0 };
      stats[id].monto += (Number(l.price_subtotal) || 0) * (comprada / pedida);
      stats[id].unidades += comprada;
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

    const [productos, cat] = await Promise.all([
      callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", productIds]]],
        // Incluye archivados: si un producto comprado se archivo despues, su
        // gasto igual cuenta en la curva.
        { fields: ["id", "default_code", "name", "categ_id", "spiff_brand_id"], limit: 0, context: { active_test: false } },
      ),
      catalogo(),
    ]);

    const clasificacion = clasificarPorMonto(
      productIds.map((id) => ({ id, monto: stats[id].monto })),
    );

    const data = (productos || [])
      .map((prod: any) => {
        const pId = prod.id;
        const clase = clasificacion.get(pId);
        const nombre = String(prod.name ?? "").trim();
        return {
          id: pId,
          codigo: prod.default_code ? String(prod.default_code).trim() : `PROD-${pId}`,
          name: nombre,
          // Marca de Odoo (spiff_brand_id), la misma del resto de Compras y
          // de Metas por marca. Nunca "" (Radix se cae con <SelectItem value="">).
          marca: cat.get(pId)?.marca || (prod.spiff_brand_id ? String(prod.spiff_brand_id[1]).trim().toUpperCase() : "") || "SIN MARCA",
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
