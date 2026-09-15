// Reporte de ventas cerradas por campaña de origen (adminleads).
//
// Responde tres cosas: qué se cerró en el período, de qué campaña venía cada
// venta, y qué tan bien convierte cada campaña.
//
// Las dos cohortes se mantienen separadas a propósito (mismo criterio que
// lib/campanas-meta.ts):
//   - "ventas del período" = leads cerrados cuya fecha_venta cae en el rango.
//     Una venta de septiembre cuenta en septiembre aunque el lead entrara en
//     julio. Es lo que factura el período.
//   - "conversión" = de los leads que INGRESARON en el rango, cuántos
//     terminaron cerrando (en cualquier momento). Mezclar ambas daría un
//     porcentaje sin sentido — es el error que advierte CLAUDE.md sobre
//     COALESCE(fecha_venta, fecha_ingreso, created_at).

import { query } from "@/lib/db";
import { canalNormalizadoSql } from "@/lib/canales";

export type VentaCerrada = {
  id: string;
  cliente: string;
  empresa: string;
  vendedor: string;
  campana: string;
  canal: string;
  categoria: string;
  monto: number;
  factura: string;
  fecha: string;
};

export type ResumenCampana = {
  campana: string;
  canal: string;
  /** Leads que ingresaron en el período. */
  leadsIngresados: number;
  /** De los que ingresaron en el período, cuántos terminaron cerrando. */
  leadsConvertidos: number;
  /** leadsConvertidos ÷ leadsIngresados × 100. null si no ingresó ninguno. */
  conversionPct: number | null;
  /** Ventas con fecha_venta dentro del período (cohorte distinta). */
  ventasPeriodo: number;
  montoPeriodo: number;
  /** montoPeriodo ÷ ventasPeriodo. null si no hubo ventas. */
  ticketPromedio: number | null;
};

export type ReporteVentasCampanas = {
  periodo: { desde: string; hasta: string; etiqueta: string };
  resumen: ResumenCampana[];
  ventas: VentaCerrada[];
  totales: {
    ventas: number;
    monto: number;
    campanas: number;
    ticketPromedio: number | null;
    leadsIngresados: number;
    leadsConvertidos: number;
    conversionPct: number | null;
  };
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Rango del query, con default al mes en curso e inversión si vienen al revés.
 * Vive acá y no en la ruta porque el export tiene que resolver exactamente el
 * mismo rango que la vista, o el Excel no coincidiría con la pantalla.
 */
export function resolverRango(params: URLSearchParams) {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let desde = DATE_REGEX.test(params.get("desde") || "") ? params.get("desde")! : iso(primero);
  let hasta = DATE_REGEX.test(params.get("hasta") || "") ? params.get("hasta")! : iso(hoy);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta };
}

/** Sede del query (un cids), o null para el alcance propio del usuario. */
export function resolverSede(params: URLSearchParams): number | null {
  const n = parseInt(params.get("sede") || "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ES_VENTA = "l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO')";
const ENTRADA = "COALESCE(l.fecha_ingreso, l.created_at)";
const CAMPANA = "COALESCE(NULLIF(TRIM(l.campana), ''), 'Sin campaña')";
const CANAL = canalNormalizadoSql("l.canal_origen");

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => Number(v) || 0;
const pct = (parte: number, total: number) =>
  total > 0 ? r2((parte * 100) / total) : null;

/**
 * Filtro de sucursal. `sede` es un id de cids ya validado como entero; sin él
 * se cae al alcance del propio usuario (Panamá ve Panamá, el resto ve el resto,
 * incluidos los leads sin vendedor asignado).
 */
function scopeSede(userCids: number | null, sede: number | null) {
  if (sede !== null) {
    return { sql: "l.seller_id IN (SELECT id FROM sellers WHERE cids = ?)", params: [sede] };
  }
  if (userCids === 7) {
    return { sql: "l.seller_id IN (SELECT id FROM sellers WHERE cids = 7)", params: [] };
  }
  // NULL IN (...) no es TRUE: sin el OR se perderían los leads sin vendedor.
  return {
    sql: "(l.seller_id IS NULL OR l.seller_id IN (SELECT id FROM sellers WHERE cids != 7))",
    params: [],
  };
}

export async function calcularVentasCampanas({
  userCids,
  sede,
  desde,
  hasta,
}: {
  userCids: number | null;
  sede: number | null;
  desde: string;
  hasta: string;
}): Promise<ReporteVentasCampanas> {
  const ini = `${desde} 00:00:00`;
  const fin = `${hasta} 23:59:59`;
  const scope = scopeSede(userCids, sede);

  // Los parentesis no son decorativos: estas condiciones se concatenan con AND
  // dentro de un CASE WHEN, y `x BETWEEN ? AND ? AND y` es facil de leer mal al
  // editarlo aunque MySQL lo agrupe bien.
  const entradaEnRango = `(${ENTRADA} BETWEEN ? AND ?)`;
  const ventaEnRango = `(${ES_VENTA} AND l.fecha_venta IS NOT NULL AND l.fecha_venta BETWEEN ? AND ?)`;

  const resumenSql = `
    SELECT
      ${CAMPANA} AS campana,
      ${CANAL} AS canal,
      SUM(CASE WHEN ${entradaEnRango} THEN 1 ELSE 0 END) AS leads_ingresados,
      SUM(CASE WHEN ${entradaEnRango} AND ${ES_VENTA} THEN 1 ELSE 0 END) AS leads_convertidos,
      SUM(CASE WHEN ${ventaEnRango} THEN 1 ELSE 0 END) AS ventas_periodo,
      IFNULL(SUM(CASE WHEN ${ventaEnRango} THEN l.monto_cerrado_usd ELSE 0 END), 0) AS monto_periodo
    FROM leads l
    WHERE ${scope.sql}
    GROUP BY campana, canal
    HAVING leads_ingresados > 0 OR ventas_periodo > 0
    ORDER BY monto_periodo DESC, ventas_periodo DESC
  `;
  const resumenParams = [ini, fin, ini, fin, ini, fin, ini, fin, ...scope.params];

  const ventasSql = `
    SELECT
      l.id,
      l.nombre,
      l.empresa,
      l.categoria_interes,
      l.num_factura,
      l.fecha_venta,
      l.monto_cerrado_usd,
      ${CAMPANA} AS campana,
      ${CANAL} AS canal,
      s.name AS vendedor_nombre
    FROM leads l
    LEFT JOIN sellers s ON l.seller_id = s.id
    WHERE ${scope.sql} AND ${ventaEnRango}
    ORDER BY l.fecha_venta DESC
  `;
  const ventasParams = [...scope.params, ini, fin];

  const [resRes, resVentas]: any[] = await Promise.all([
    query(resumenSql, resumenParams),
    query(ventasSql, ventasParams),
  ]);

  const filasResumen: any[] = Array.isArray(resRes) ? resRes : resRes?.rows || [];
  const filasVentas: any[] = Array.isArray(resVentas) ? resVentas : resVentas?.rows || [];

  const resumen: ResumenCampana[] = filasResumen.map((f) => {
    const ingresados = num(f.leads_ingresados);
    const convertidos = num(f.leads_convertidos);
    const ventasPeriodo = num(f.ventas_periodo);
    const montoPeriodo = r2(num(f.monto_periodo));
    return {
      campana: f.campana,
      canal: f.canal,
      leadsIngresados: ingresados,
      leadsConvertidos: convertidos,
      conversionPct: pct(convertidos, ingresados),
      ventasPeriodo,
      montoPeriodo,
      ticketPromedio: ventasPeriodo > 0 ? r2(montoPeriodo / ventasPeriodo) : null,
    };
  });

  const ventas: VentaCerrada[] = filasVentas.map((f) => ({
    id: String(f.id),
    cliente: f.nombre || "",
    empresa: f.empresa || "",
    vendedor: f.vendedor_nombre || "Sin asignar",
    campana: f.campana,
    canal: f.canal,
    categoria: f.categoria_interes || "",
    monto: r2(num(f.monto_cerrado_usd)),
    factura: f.num_factura || "",
    fecha: f.fecha_venta ? String(f.fecha_venta).slice(0, 10) : "",
  }));

  const montoTotal = r2(ventas.reduce((s, v) => s + v.monto, 0));
  const ingresadosTotal = resumen.reduce((s, c) => s + c.leadsIngresados, 0);
  const convertidosTotal = resumen.reduce((s, c) => s + c.leadsConvertidos, 0);

  return {
    periodo: { desde, hasta, etiqueta: `${desde} al ${hasta}` },
    resumen,
    ventas,
    totales: {
      ventas: ventas.length,
      monto: montoTotal,
      campanas: resumen.filter((c) => c.ventasPeriodo > 0).length,
      ticketPromedio: ventas.length > 0 ? r2(montoTotal / ventas.length) : null,
      leadsIngresados: ingresadosTotal,
      leadsConvertidos: convertidosTotal,
      conversionPct: pct(convertidosTotal, ingresadosTotal),
    },
  };
}
