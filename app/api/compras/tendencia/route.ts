import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import {
  cachear,
  catalogo,
  dominioVentas,
  hoyCaracas,
  idsPorCodigo,
  leerSmartbit,
  signoDocumento,
  type ProductoCompras,
} from "@/lib/compras/datosOdoo";
import { ventasPorDia } from "@/lib/compras/historial";
import { callOdooRPC } from "@/lib/odoo";
import { CORTE_ODOO, SQL_SIN_INTERCOMPANIA, desdeOdoo, rangoSmartbit } from "@/lib/smartbit";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/tendencia?sede=9&mes=YYYY-MM | &historico=true
 *
 * Unidades vendidas con las reglas de Compras (lib/compras/datosOdoo.ts): sin
 * las líneas de costo (COGS) que triplicaban las unidades, notas de crédito
 * restando, sin intercompañía ni servicios ("Saldo Inicial" salía entre los
 * más vendidos). Antes del corte (abr-2026) la venta sale de Smartbit: en
 * Odoo esos meses solo tienen las facturas abiertas migradas.
 */

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const dd = (n: number) => String(n).padStart(2, "0");

/** Semanas del mes: 1–7, 8–14, 15–21, 22–28 y 29–fin. */
function semanasDelMes(anio: number, mes: number) {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const semanas: { label: string; ini: string; fin: string }[] = [];
  for (let d = 1, n = 1; d <= ultimo; d += 7, n++) {
    const hasta = Math.min(d + 6, ultimo);
    semanas.push({
      label: `Sem ${n} (${d}/${mes}–${hasta}/${mes})`,
      ini: `${anio}-${dd(mes)}-${dd(d)}`,
      fin: `${anio}-${dd(mes)}-${dd(hasta)}`,
    });
  }
  return semanas;
}

const nombreDe = (p: ProductoCompras) => (p.codigo.startsWith("PROD-") ? p.nombre : `[${p.codigo}] ${p.nombre}`);

async function mensual(sedeId: number, anio: number, mes: number) {
  const semanas = semanasDelMes(anio, mes);
  const desde = semanas[0].ini;
  const hasta = semanas[semanas.length - 1].fin;
  const [{ porProducto, sinProducto }, cat] = await Promise.all([ventasPorDia(sedeId, desde, hasta), catalogo()]);

  // producto -> unidades por semana
  const filas: { key: string; nombre: string; semanal: number[] }[] = [];
  const agregar = (key: string, nombre: string, dias: Map<string, number>) => {
    const semanal = semanas.map((s) => {
      let t = 0;
      for (const [d, q] of dias) if (d >= s.ini && d <= s.fin) t += q;
      return t;
    });
    filas.push({ key, nombre, semanal });
  };
  for (const [id, dias] of porProducto) {
    const p = cat.get(id);
    agregar(String(id), p ? nombreDe(p) : `Producto ${id}`, dias);
  }
  for (const [codigo, x] of sinProducto) agregar(`sb:${codigo}`, `[${codigo}] ${x.nombre}`, x.dias);

  const total = (f: { semanal: number[] }) => f.semanal.reduce((a, b) => a + b, 0);
  const ordenadas = filas
    .map((f) => ({ ...f, total: total(f) }))
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total);

  const productosPorSemana: Record<string, { nombre: string; qty: number }[]> = {};
  semanas.forEach((s, i) => {
    productosPorSemana[s.label] = filas
      .map((f) => ({ nombre: f.nombre, qty: Math.round(f.semanal[i]) }))
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  });

  return {
    historico: false,
    mes: `${anio}-${dd(mes)}`,
    // "smartbit" = mes previo al corte: la venta sale del histórico de Smartbit.
    fuente: hasta < CORTE_ODOO ? "smartbit" : "odoo",
    semanas: semanas.map((s) => s.label),
    totalPorSemana: semanas.map((s, i) => ({
      semana: s.label,
      total: Math.round(filas.reduce((t, f) => t + f.semanal[i], 0)),
    })),
    topProductos: ordenadas.slice(0, 10).map((f) => ({
      id: f.key,
      nombre: f.nombre,
      totalVentas: Math.round(f.total),
      semanal: f.semanal.map((q) => Math.round(q)),
    })),
    productosPorSemana,
    productosTotal: ordenadas.map((f) => ({ nombre: f.nombre, qty: Math.round(f.total) })),
  };
}

async function historico(sedeId: number) {
  const hoy = hoyCaracas();
  const [y, m] = hoy.split("-").map(Number);
  // Últimos 24 meses, contando el actual.
  const inicio = new Date(Date.UTC(y, m - 1 - 23, 1));
  const since = `${inicio.getUTCFullYear()}-${dd(inicio.getUTCMonth() + 1)}-01`;

  const ini = desdeOdoo(since);
  const rango = rangoSmartbit(since, hoy);
  const dominio = [...(await dominioVentas(sedeId)), ["invoice_date", ">=", ini], ["invoice_date", "<=", hoy]];
  const leerGrupos = async (groupby: string[]) => {
    const r = await callOdooRPC<any[]>("account.move.line", "read_group", [dominio, ["quantity:sum"], groupby], { lazy: false });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió la tendencia");
    return r;
  };
  const [porMesOdoo, porProductoOdoo, porMesSb, porProductoSb, cat, codigos] = await Promise.all([
    leerGrupos(["invoice_date:month", "move_type"]),
    leerGrupos(["product_id", "move_type"]),
    rango
      ? leerSmartbit(
          `SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, SUM(unidades) AS unidades
             FROM ventas_smartbit
            WHERE company_id = ? AND fecha BETWEEN ? AND ? AND ${SQL_SIN_INTERCOMPANIA}
            GROUP BY mes`,
          [sedeId, rango[0], rango[1]],
        )
      : Promise.resolve([] as any[]),
    rango
      ? leerSmartbit(
          `SELECT UPPER(TRIM(codigo_articulo)) AS codigo, MAX(articulo) AS articulo, SUM(unidades) AS unidades
             FROM ventas_smartbit
            WHERE company_id = ? AND fecha BETWEEN ? AND ? AND codigo_articulo IS NOT NULL
              AND ${SQL_SIN_INTERCOMPANIA}
            GROUP BY UPPER(TRIM(codigo_articulo))`,
          [sedeId, rango[0], rango[1]],
        )
      : Promise.resolve([] as any[]),
    catalogo(),
    idsPorCodigo(),
  ]);

  const porMes = new Map<string, number>();
  for (const g of porMesOdoo) {
    const mes = String(g.__range?.["invoice_date:month"]?.from || "").slice(0, 7);
    if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + signoDocumento(g.move_type) * (Number(g.quantity) || 0));
  }
  for (const f of porMesSb) {
    const mes = String(f.mes || "");
    if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(f.unidades) || 0));
  }

  const porProducto = new Map<string, { nombre: string; qty: number }>();
  const sumarProducto = (key: string, nombre: string, q: number) => {
    const x = porProducto.get(key) ?? { nombre, qty: 0 };
    x.qty += q;
    porProducto.set(key, x);
  };
  for (const g of porProductoOdoo) {
    const id = g.product_id?.[0];
    if (!id) continue;
    const p = cat.get(id);
    sumarProducto(String(id), p ? nombreDe(p) : String(g.product_id[1] || id), signoDocumento(g.move_type) * (Number(g.quantity) || 0));
  }
  for (const f of porProductoSb) {
    const codigo = String(f.codigo || "");
    if (!codigo) continue;
    const id = codigos.get(codigo);
    const p = id ? cat.get(id) : undefined;
    sumarProducto(id ? String(id) : `sb:${codigo}`, p ? nombreDe(p) : `[${codigo}] ${f.articulo || ""}`.trim(), Number(f.unidades) || 0);
  }

  const meses = [...porMes.entries()].filter(([, q]) => q > 0);
  const totalHistorico = meses.reduce((s, [, q]) => s + q, 0);
  const mesesConVenta = meses.length;
  const mejor = meses.sort((a, b) => b[1] - a[1])[0];
  const mejorMesLabel = mejor
    ? `${MESES_ES[parseInt(mejor[0].slice(5, 7), 10) - 1]} ${mejor[0].slice(0, 4)}`
    : "-";

  return {
    historico: true,
    totalHistorico: Math.round(totalHistorico),
    promedioMensual: mesesConVenta > 0 ? Math.round(totalHistorico / mesesConVenta) : 0,
    mejorMes: { label: mejorMesLabel, total: mejor ? Math.round(mejor[1]) : 0 },
    mesesConVenta,
    topProductos: [...porProducto.values()]
      .map((v) => ({ nombre: v.nombre, qty: Math.round(v.qty) }))
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("historico") === "true") {
      const data = await cachear(`tendencia|hist|${sedeId}|${hoyCaracas()}`, () => historico(sedeId), 15 * 60 * 1000);
      return NextResponse.json({ success: true, data });
    }

    const mesParam = searchParams.get("mes") ?? hoyCaracas().slice(0, 7);
    const [anio, mes] = mesParam.split("-").map((x) => parseInt(x, 10));
    if (!anio || !mes || mes < 1 || mes > 12) {
      return NextResponse.json({ error: "Parámetro mes inválido" }, { status: 400 });
    }
    const data = await cachear(`tendencia|${sedeId}|${mesParam}|${hoyCaracas()}`, () => mensual(sedeId, anio, mes), 15 * 60 * 1000);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Error en API tendencia:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
