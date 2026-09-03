import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const VENTANA_DIAS = 90;

const COMPANIES = [9, 10, 7];

/**
 * Clasificacion ABC por ingresos (curva de Pareto): mismo criterio que
 * clasificarABC() en app/api/compras/mayor_rotacion/route.ts (A = hasta 80%
 * acumulado, B = hasta 95%, C = resto), pero aplicado a price_subtotal en
 * vez de unidades vendidas — esa es la pregunta que compras pedia y que
 * mayor_rotacion no responde (esa pantalla es sobre rotacion de inventario,
 * no sobre que productos concentran la facturacion).
 */
function clasificarPorIngresos(
  productos: { id: number; ingresos: number }[],
): Map<number, { clase: "A" | "B" | "C"; pctIndividual: number; pctAcumulado: number }> {
  const total = productos.reduce((s, p) => s + p.ingresos, 0);
  const sorted = [...productos].sort((a, b) => b.ingresos - a.ingresos);
  const map = new Map<number, { clase: "A" | "B" | "C"; pctIndividual: number; pctAcumulado: number }>();
  let acumulado = 0;
  for (const p of sorted) {
    acumulado += p.ingresos;
    const pctAcumulado = total > 0 ? (acumulado / total) * 100 : 100;
    const pctIndividual = total > 0 ? (p.ingresos / total) * 100 : 0;
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

    const desde = new Date();
    desde.setDate(desde.getDate() - VENTANA_DIAS);
    const desdeStr = desde.toISOString().split("T")[0];

    const domain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", desdeStr],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.partner_id.name", "not ilike", "office solution"],
      ["product_id", "!=", false],
    ];
    if (sedeId) domain.push(["move_id.company_id", "=", sedeId]);

    const lines: any[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [domain],
        {
          fields: ["product_id", "quantity", "price_subtotal", "move_id"],
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

    const stats: Record<number, { ingresos: number; unidades: number }> = {};
    lines.forEach((l: any) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      if (!stats[id]) stats[id] = { ingresos: 0, unidades: 0 };
      stats[id].ingresos += l.price_subtotal || 0;
      stats[id].unidades += l.quantity || 0;
    });

    const productIds = Object.keys(stats)
      .map(Number)
      .filter((id) => stats[id].ingresos > 0);

    if (productIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        resumen: { totalProductos: 0, productosClaseA: 0, pctProductosClaseA: 0, pctIngresosClaseA: 0 },
      });
    }

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productIds]]],
      { fields: ["id", "default_code", "name", "categ_id"], limit: 0 },
    );

    const clasificacion = clasificarPorIngresos(
      productIds.map((id) => ({ id, ingresos: stats[id].ingresos })),
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
          ingresos: Number(stats[pId].ingresos.toFixed(2)),
          unidades: Math.round(stats[pId].unidades),
          pctIndividual: clase?.pctIndividual ?? 0,
          pctAcumulado: clase?.pctAcumulado ?? 0,
          clase: clase?.clase ?? "C",
        };
      })
      .sort((a, b) => b.ingresos - a.ingresos);

    const productosClaseA = data.filter((d) => d.clase === "A").length;
    const ingresosClaseA = data
      .filter((d) => d.clase === "A")
      .reduce((s, d) => s + d.ingresos, 0);
    const ingresosTotal = data.reduce((s, d) => s + d.ingresos, 0);

    const resumen = {
      totalProductos: data.length,
      productosClaseA,
      pctProductosClaseA: data.length > 0 ? Number(((productosClaseA / data.length) * 100).toFixed(1)) : 0,
      pctIngresosClaseA: ingresosTotal > 0 ? Number(((ingresosClaseA / ingresosTotal) * 100).toFixed(1)) : 0,
    };

    return NextResponse.json({ success: true, data, resumen });
  } catch (error: any) {
    console.error("❌ Error en API compras/pareto-80-20:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
