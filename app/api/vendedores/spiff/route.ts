import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/roles";
import { calcularSpiffDelMes } from "@/lib/spiff/calculo";

/**
 * Spiff del vendedor (y ranking de la sede). Usa el MISMO cálculo que el
 * resumen de Gerencia de Ventas (lib/spiff/calculo.ts), así lo que ve el
 * vendedor coincide con lo que se le paga: respeta las fechas de cada regla,
 * las reglas de producto cuentan solo ese producto, las notas de crédito
 * restan, y el total incluye reglas de marca y de producto.
 *
 * Antes esta ruta tenía su propio cálculo: ignoraba las fechas de la regla,
 * aplicaba cada regla de producto a todos los productos de la marca, no
 * restaba devoluciones y el total solo sumaba las reglas de marca.
 *
 * `?company_id=` lo usa el administrador de reglas (superadmin/gerencia) para
 * ver el ranking de una sede; el resto de los roles ve la suya.
 */
export async function GET(request: NextRequest) {
  const sesion = await requireSession(request);
  if (sesion.error) return sesion.error;
  const payload = sesion.payload;

  try {
    const uid = Number(payload.uid);
    const role = String(payload.role || "").toLowerCase().trim();
    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const mes = parseInt(sp.get("month") || "", 10) || now.getMonth() + 1;
    const anio = parseInt(sp.get("year") || "", 10) || now.getFullYear();

    const puedeElegirSede = ["superadmin", "gerencia de ventas", "gerente de operaciones"].includes(role);
    const param = parseInt(sp.get("company_id") || "", 10);
    const companyId = puedeElegirSede && Number.isFinite(param) ? param : Number(payload.cids) || 9;

    const resumen = await calcularSpiffDelMes(companyId, anio, mes);
    const mm = String(mes).padStart(2, "0");
    const fechaInicioGlobal = `${anio}-${mm}-01`;
    const fechaFinGlobal = `${anio}-${mm}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;

    const yo = resumen.vendedores.find((v) => v.userId === uid);
    const totalGeneral = yo?.facturado ?? 0;
    const reglasMarca = (yo?.detalle || []).filter((d) => d.tipo === "marca");
    const reglasProducto = (yo?.detalle || []).filter((d) => d.tipo === "producto");

    const marcas = reglasMarca
      .map((d) => ({
        nombre: d.marca,
        monto: d.monto,
        cantidad: d.cantidad,
        porcentaje: totalGeneral > 0 ? parseFloat(((d.monto / totalGeneral) * 100).toFixed(1)) : 0,
        spiffMeta: d.meta,
        spiffPorMeta: d.spiffPorMeta,
        spiffGanado: d.spiff,
        tieneRegla: true,
        modo: d.modo,
        productos: d.productos.slice(0, 5).map((p) => ({
          ...p,
          porcentaje: d.monto > 0 ? parseFloat(((p.monto / d.monto) * 100).toFixed(1)) : 0,
        })),
      }))
      .sort((a, b) => b.monto - a.monto);

    const allProducts = reglasProducto
      .map((d) => ({
        nombre: d.producto || d.productos[0]?.nombre || d.marca,
        marca: d.marca,
        monto: d.monto,
        cantidad: d.cantidad,
        spiffGanado: d.spiff,
        spiffMeta: d.meta,
        spiffPorMeta: d.spiffPorMeta,
        modo: d.modo,
      }))
      .sort((a, b) => b.spiffGanado - a.spiffGanado || b.monto - a.monto);

    // Ranking: sin asistentes ni cuentas internas (mismo criterio que el
    // resumen de gerencia y que el ranking del administrador de reglas).
    const rankingVendedores = resumen.vendedores
      .filter((v) => !v.excluido && v.facturado > 0)
      .sort((a, b) => b.totalSpiff - a.totalSpiff || b.facturado - a.facturado)
      .map((v, i) => ({ posicion: i + 1, nombre: v.nombre, totalSpiff: v.totalSpiff, totalFacturado: v.facturado }));
    const miPosicion = rankingVendedores.find((r) => yo && r.nombre === yo.nombre);

    // Por vendedor y regla, para el ranking por regla del administrador.
    const sellerRuleData: Record<string, Record<number, { monto: number; cantidad: number; metas: number; spiff: number }>> = {};
    resumen.vendedores.filter((v) => !v.excluido).forEach((v) => {
      sellerRuleData[v.nombre] = {};
      v.detalle.forEach((d) => {
        sellerRuleData[v.nombre][d.reglaId] = { monto: d.monto, cantidad: d.cantidad, metas: d.metasCumplidas, spiff: d.spiff };
      });
    });

    return NextResponse.json({
      marcas,
      totalGeneral,
      totalSpiff: yo?.totalSpiff ?? 0,
      totalFacturas: yo?.facturas ?? 0,
      reglasActivas: resumen.reglas,
      marcasPorSpiff: [...marcas].sort((a, b) => b.spiffGanado - a.spiffGanado),
      allProducts,
      totalSpiffProductos: allProducts.reduce((s, p) => s + p.spiffGanado, 0),
      rankingVendedores,
      miPosicion: miPosicion || { posicion: 0, nombre: yo?.nombre || "", totalSpiff: yo?.totalSpiff ?? 0, totalFacturado: totalGeneral },
      fechaInicioGlobal,
      fechaFinGlobal,
      sellerRuleData,
      selectedMonth: mes,
      selectedYear: anio,
    });
  } catch (e: any) {
    console.error("Error API spiff:", e.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
