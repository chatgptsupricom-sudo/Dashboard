import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { accesoStoplight } from "@/lib/stoplight/acceso";
import { obtenerLineasMargen, margenPct } from "@/lib/stoplight/margen";

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Clave del grupo que junta las facturas de usuarios que no están en `sellers`. */
const OTROS = "__otros__";

// Detalle del KPI "Margen bruto" (modal del Stoplight): totales, por vendedor
// (con su serie semanal) y por producto. Usa las mismas líneas que la fila de
// la grilla, así que el total del modal cuadra con ella.
export async function GET(request: NextRequest) {
  try {
    const acceso = await accesoStoplight(request);
    if (acceso.error) return acceso.error;
    const { rol, companyId } = acceso;

    // Gerencia de Ventas ve margen % pero no costo ni ganancia (issue #178).
    // Se quita acá y no solo en la UI, para que no viaje en la respuesta.
    const ocultarCosto = rol === "gerencia de ventas";

    const now = new Date();
    const mesParam = request.nextUrl.searchParams.get("mes");
    const mes = /^\d{4}-\d{2}$/.test(mesParam || "")
      ? mesParam!
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const fechaInicio = `${mes}-01`;
    const fechaFin = `${mes}-${String(new Date(anio, mesNum, 0).getDate()).padStart(2, "0")}`;

    // Mismas semanas que las columnas de la grilla.
    const semanas = obtenerSemanasDelMes(anio, mesNum);

    const [lineas, sellersResult, metaResult] = await Promise.all([
      obtenerLineasMargen(companyId, fechaInicio, fechaFin),
      query("SELECT name FROM sellers WHERE cids = ?", [companyId]),
      query(
        "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
        ["margen_bruto", companyId, mes],
      ),
    ]);
    const meta = Number((metaResult.rows as any[])[0]?.meta_mensual) || 0;

    // Vendedores: todos los de la sede (como la grilla, sin exigir cuota).
    // Las facturas de usuarios que no están en `sellers` van a "Otros" para
    // que la suma de vendedores dé el total.
    type Acum = { ingreso: number; costo: number; semanas: { ingreso: number; costo: number }[] };
    const nuevo = (): Acum => ({ ingreso: 0, costo: 0, semanas: semanas.map(() => ({ ingreso: 0, costo: 0 })) });
    const nombrePorNorm = new Map<string, string>();
    const porVendedor = new Map<string, Acum>();
    (sellersResult.rows as any[]).forEach((s) => {
      nombrePorNorm.set(normalize(s.name), s.name);
      porVendedor.set(s.name, nuevo());
    });

    const porProducto = new Map<number, { nombre: string; cantidad: number; ingreso: number; costo: number }>();
    let ingresoTotal = 0;
    let costoTotal = 0;

    for (const l of lineas) {
      ingresoTotal += l.ingreso;
      costoTotal += l.costo;

      const clave = nombrePorNorm.get(normalize(l.vendedor)) ?? OTROS;
      if (!porVendedor.has(clave)) porVendedor.set(clave, nuevo());
      const v = porVendedor.get(clave)!;
      v.ingreso += l.ingreso;
      v.costo += l.costo;
      const i = semanas.findIndex((s) => l.fecha >= s.inicio && l.fecha <= s.fin);
      if (i !== -1) {
        v.semanas[i].ingreso += l.ingreso;
        v.semanas[i].costo += l.costo;
      }

      const p = porProducto.get(l.productId) ?? { nombre: l.producto, cantidad: 0, ingreso: 0, costo: 0 };
      p.cantidad += l.cantidad;
      p.ingreso += l.ingreso;
      p.costo += l.costo;
      porProducto.set(l.productId, p);
    }

    // Montos de costo/ganancia: se omiten para Gerencia de Ventas.
    const montos = (ingreso: number, costo: number) =>
      ocultarCosto ? { revenue: r2(ingreso) } : { revenue: r2(ingreso), costo: r2(costo), ganancia: r2(ingreso - costo) };

    const sellers = [...porVendedor.entries()]
      // Vendedores sin movimiento en el mes no aportan nada a la tabla.
      .filter(([, v]) => v.ingreso !== 0 || v.costo !== 0)
      .map(([nombre, v]) => ({
        nombre: nombre === OTROS ? null : nombre,
        esOtros: nombre === OTROS,
        ...montos(v.ingreso, v.costo),
        margen: r1(margenPct(v.ingreso, v.costo)),
        semanas: v.semanas.map((s, i) => ({
          numero: i + 1,
          inicio: ymd(semanas[i].inicio),
          fin: ymd(semanas[i].fin),
          futura: semanas[i].inicio > now,
          ...montos(s.ingreso, s.costo),
          margen: r1(margenPct(s.ingreso, s.costo)),
        })),
      }))
      .sort((a, b) => Number(a.esOtros) - Number(b.esOtros) || b.revenue - a.revenue);

    const products = [...porProducto.entries()]
      .map(([productId, p]) => ({
        productId,
        nombre: p.nombre,
        cantidadVendida: r2(p.cantidad),
        ...montos(p.ingreso, p.costo),
        margen: r1(margenPct(p.ingreso, p.costo)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        meta,
        costoOculto: ocultarCosto,
        totales: {
          ...montos(ingresoTotal, costoTotal),
          margen: r1(margenPct(ingresoTotal, costoTotal)),
          productos: products.length,
        },
        sellers,
        products,
      },
    });
  } catch (error: any) {
    console.error("Error en API margen-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
