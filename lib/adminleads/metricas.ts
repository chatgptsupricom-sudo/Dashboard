// Panel de Métricas de Leads (Dashboard Leads): lo usan la pantalla
// (GET /api/adminleads/stats) y su Excel (GET /api/adminleads/export), así los
// dos cuentan igual.
//
// Criterio de fechas, alineado con el informe mensual (criteriosLeads en
// app/api/adminleads/informe-mensual/route.ts): un lead pertenece al período
// por su fecha de ENTRADA y un cierre por su FECHA_VENTA (que es la fecha de
// cierre, también en los perdidos). Con una sola fecha se toma ese día.
//
// Motivos de cierre: VENTA/GANADO = venta; YA_ES_CLIENTE = se informa aparte,
// no suma a ventas ni a monto ni es abandono; PERDIDO (el de hoy) y ABANDONO
// (el de antes) = perdido. Los cierres de "Pagina Web" se ven pero no suman
// al conteo de ventas ni al monto (canalSumaVentas); la Efectividad sí los cuenta.
//
// Los leads de los Excel de antes del panel no entran, salvo los que se
// cierran desde su tablero en Monitoreo Leads (`cerrado_en_panel`): esos suman
// en Cierres, Monto y "Ya es cliente" por su fecha de cierre (ver
// lib/adminleads/leadsExcel.ts). Lo demás de los Excel está en la pestaña
// Histórico (Excel).
//
// Sede = la del vendedor del lead. Venezuela (Valencia + Caracas) y Panamá no
// se mezclan: "Todas" es Venezuela, e incluye los leads sin vendedor o con un
// vendedor sin sede (como el listado de leads). AdminLeads de Panamá queda en
// Panamá; el de Valencia o Caracas no puede pedir Panamá.

import { asegurarTablas } from "@/lib/adminleads/recompra";
import { canalNormalizadoSql, canalSumaVentasSql, SIN_CANAL } from "@/lib/canales";
import { query } from "@/lib/db";

const PANAMA = 7;
const SEDES_VALIDAS = [7, 9, 10];
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function calcularMetricas(payload: any, sp: URLSearchParams) {
  const userCids = Number(payload?.cids) || null;
  const deVenezuela = userCids === 9 || userCids === 10;

  let sede: number | null = SEDES_VALIDAS.includes(Number(sp.get("sede"))) ? Number(sp.get("sede")) : null;
  if (userCids === PANAMA) sede = PANAMA;
  else if (deVenezuela && sede === PANAMA) sede = null;

  const sellerId = /^\d+$/.test(sp.get("seller_id") || "") ? Number(sp.get("seller_id")) : null;
  const canal = sp.get("canal") || null;
  let fechaInicio = ES_FECHA.test(sp.get("fecha_inicio") || "") ? sp.get("fecha_inicio")! : null;
  let fechaFin = ES_FECHA.test(sp.get("fecha_fin") || "") ? sp.get("fecha_fin")! : null;
  fechaInicio ??= fechaFin;
  fechaFin ??= fechaInicio;
  const conFechas = Boolean(fechaInicio && fechaFin);
  // Las fechas pasaron por ES_FECHA: se incrustan sin riesgo y sin contar "?".
  const entre = (col: string) => `${col} BETWEEN '${fechaInicio} 00:00:00' AND '${fechaFin} 23:59:59'`;

  // Filtros de sede, vendedor y canal (sin fechas), con el alias `l` de leads.
  const filtros: string[] = [];
  const params: any[] = [];
  if (sede) {
    filtros.push("l.seller_id IN (SELECT id FROM sellers WHERE cids = ?)");
    params.push(sede);
  } else {
    filtros.push(`(l.seller_id IS NULL OR l.seller_id NOT IN (SELECT id FROM sellers WHERE cids = ${PANAMA}))`);
  }
  if (sellerId) {
    filtros.push("l.seller_id = ?");
    params.push(sellerId);
  }
  if (canal) {
    // Contra el canal ya normalizado: "Whatsaap" cae en "Whatsapp" y el literal "null" en "Sin canal".
    filtros.push(`${canalNormalizadoSql("l.canal_origen")} = ?`);
    params.push(canal);
  }
  const conFiltros = (...mas: string[]) => [...filtros, ...mas].join(" AND ");

  const ES_VENTA = "l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO')";
  const ES_YA_CLIENTE = "l.status = 'CERRADO' AND l.motivo_cierre = 'YA_ES_CLIENTE'";
  const ES_PERDIDO = "l.status = 'CERRADO' AND l.motivo_cierre IN ('PERDIDO', 'ABANDONO')";
  const SUMA = canalSumaVentasSql("l.canal_origen");
  // Efectividad = conversión de cohorte: de los leads que ENTRARON en el
  // período, cuántos terminaron en venta, sin importar cuándo se cerró.
  const entrada = conFechas ? entre("COALESCE(l.fecha_ingreso, l.created_at)") : "1=1";
  const cerradoEnPeriodo = (motivo: string) => (conFechas ? `${motivo} AND l.fecha_venta IS NOT NULL AND ${entre("l.fecha_venta")}` : motivo);
  const ventaEnPeriodo = cerradoEnPeriodo(ES_VENTA);
  const yaClienteEnPeriodo = cerradoEnPeriodo(ES_YA_CLIENTE);
  const ventaQueSuma = `${ventaEnPeriodo} AND ${SUMA}`;
  const ventaQueNoSuma = `${ventaEnPeriodo} AND NOT ${SUMA}`;
  const delPeriodo = conFechas ? `((${entrada}) OR (${ventaEnPeriodo}) OR (${yaClienteEnPeriodo}))` : "1=1";

  // 1. KPIs
  const statsResult: any = await query(
    `SELECT
       SUM(CASE WHEN ${entrada} THEN 1 ELSE 0 END) AS total_leads,
       IFNULL(SUM(CASE WHEN ${ventaQueSuma} THEN l.monto_cerrado_usd ELSE 0 END), 0) AS monto_total,
       SUM(CASE WHEN ${entrada} AND ${ES_VENTA} THEN 1 ELSE 0 END) AS ventas_del_mes,
       (SUM(CASE WHEN ${entrada} AND ${ES_VENTA} THEN 1 ELSE 0 END) /
        NULLIF(SUM(CASE WHEN ${entrada} THEN 1 ELSE 0 END), 0)) * 100 AS tasa_efectividad,
       SUM(CASE WHEN ${ventaQueSuma} THEN 1 ELSE 0 END) AS total_ventas,
       IFNULL(AVG(l.tiempo_primer_contacto_minutos), 0) AS avg_tiempo_contacto,
       IFNULL(AVG(CASE WHEN ${ventaEnPeriodo} AND l.fecha_venta IS NOT NULL
                       THEN TIMESTAMPDIFF(MINUTE, COALESCE(l.fecha_ingreso, l.created_at), l.fecha_venta) END), 0) AS avg_tiempo_cierre,
       (SUM(CASE WHEN l.reactivacion = 1 THEN 1 ELSE 0 END) /
        NULLIF(SUM(CASE WHEN l.reactivacion = 1 OR (${ES_PERDIDO}) THEN 1 ELSE 0 END), 0)) * 100 AS tasa_reactivacion,
       SUM(CASE WHEN ${ventaQueNoSuma} THEN 1 ELSE 0 END) AS ventas_pagina_web,
       IFNULL(SUM(CASE WHEN ${ventaQueNoSuma} THEN l.monto_cerrado_usd ELSE 0 END), 0) AS monto_pagina_web,
       SUM(CASE WHEN ${yaClienteEnPeriodo} THEN 1 ELSE 0 END) AS ventas_ya_cliente,
       IFNULL(SUM(CASE WHEN ${yaClienteEnPeriodo} THEN l.monto_cerrado_usd ELSE 0 END), 0) AS monto_ya_cliente
     FROM leads l
     WHERE ${conFiltros(delPeriodo)}`,
    params,
  );

  // 1b. Cierres de leads de Excel hechos desde su tablero: mismos filtros, con la
  // sede del vendedor asignado o, si no tiene, la del Excel.
  await asegurarTablas();
  const sedeExcel = "COALESCE(sx.cids, h.company_id)";
  const excelResult: any = await query(
    `SELECT
       SUM(CASE WHEN h.panel_motivo IN ('VENTA', 'GANADO') AND ${canalSumaVentasSql("h.red_social")} THEN 1 ELSE 0 END) AS ventas,
       IFNULL(SUM(CASE WHEN h.panel_motivo IN ('VENTA', 'GANADO') AND ${canalSumaVentasSql("h.red_social")} THEN h.panel_monto ELSE 0 END), 0) AS monto,
       SUM(CASE WHEN h.panel_motivo = 'YA_ES_CLIENTE' THEN 1 ELSE 0 END) AS ya_cliente,
       IFNULL(SUM(CASE WHEN h.panel_motivo = 'YA_ES_CLIENTE' THEN h.panel_monto ELSE 0 END), 0) AS monto_ya_cliente
     FROM leads_historicos h
     LEFT JOIN sellers sx ON sx.id = h.seller_id
     WHERE h.cerrado_en_panel = 1 AND h.panel_status = 'CERRADO' AND h.lead_id IS NULL
       ${conFechas ? `AND ${entre("h.panel_fecha_cierre")}` : ""}
       ${sede ? `AND ${sedeExcel} = ?` : `AND ${sedeExcel} <> ${PANAMA}`}
       ${sellerId ? "AND h.seller_id = ?" : ""}
       ${canal ? `AND ${canalNormalizadoSql("h.red_social")} = ?` : ""}`,
    [...(sede ? [sede] : []), ...(sellerId ? [sellerId] : []), ...(canal ? [canal] : [])],
  );
  const excel = excelResult.rows?.[0] || {};
  const stats = statsResult.rows?.[0] || {};
  const sumar = (a: any, b: any) => Number(a || 0) + Number(b || 0);
  Object.assign(stats, {
    total_ventas: sumar(stats.total_ventas, excel.ventas),
    monto_total: sumar(stats.monto_total, excel.monto),
    ventas_ya_cliente: sumar(stats.ventas_ya_cliente, excel.ya_cliente),
    monto_ya_cliente: sumar(stats.monto_ya_cliente, excel.monto_ya_cliente),
    ventas_excel: Number(excel.ventas || 0),
    monto_excel: Number(excel.monto || 0),
  });

  // 2. Distribución por etapas
  const stageResult: any = await query(
    `SELECT
       l.status,
       COUNT(*) AS count,
       SUM(CASE WHEN l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) AS venta,
       SUM(CASE WHEN ${ES_YA_CLIENTE} THEN 1 ELSE 0 END) AS ya_cliente,
       SUM(CASE WHEN l.status = 'CERRADO' AND (l.motivo_cierre IS NULL OR l.motivo_cierre NOT IN ('VENTA', 'GANADO', 'YA_ES_CLIENTE')) THEN 1 ELSE 0 END) AS abandono,
       COALESCE(ls.order_index, 9999) AS order_index
     FROM leads l
     LEFT JOIN lead_statuses ls ON l.status COLLATE utf8mb4_unicode_ci = ls.name COLLATE utf8mb4_unicode_ci
     WHERE ${conFiltros(delPeriodo)}
     GROUP BY l.status, ls.order_index
     ORDER BY order_index ASC`,
    params,
  );

  // 3. Rendimiento por vendedores: los filtros van en el JOIN para que salgan
  // también los vendedores activos sin leads en el período.
  const canalesResult: any = await query(`SELECT DISTINCT ${canalNormalizadoSql("canal_origen")} AS canal FROM leads`);
  const canales: string[] = (canalesResult.rows || [])
    .map((r: any) => r.canal)
    .filter((c: string) => c && c !== SIN_CANAL)
    .sort((a: string, b: string) => a.localeCompare(b));
  const vendorResult: any = await query(
    `SELECT
       s.id, s.name,
       SUM(CASE WHEN ${entrada} THEN 1 ELSE 0 END) AS leads,
       SUM(CASE WHEN ${entrada} AND l.status != 'CERRADO' THEN 1 ELSE 0 END) AS activos,
       SUM(CASE WHEN ${ventaQueSuma} THEN 1 ELSE 0 END) AS ganados,
       SUM(CASE WHEN ${entrada} AND ${ES_PERDIDO} THEN 1 ELSE 0 END) AS perdidos,
       IFNULL(SUM(CASE WHEN ${ventaQueSuma} THEN l.monto_cerrado_usd ELSE 0 END), 0) AS recaudo,
       IFNULL((SUM(CASE WHEN ${entrada} AND ${ES_VENTA} THEN 1 ELSE 0 END) /
               NULLIF(SUM(CASE WHEN ${entrada} THEN 1 ELSE 0 END), 0)) * 100, 0) AS tasa_conversion
     FROM sellers s
     LEFT JOIN leads l ON s.id = l.seller_id
       ${sellerId ? "AND l.seller_id = ?" : ""}
       ${canal ? `AND ${canalNormalizadoSql("l.canal_origen")} = ?` : ""}
       AND (${conFechas ? `(${entrada}) OR (${ventaEnPeriodo})` : "1=1"})
     WHERE (s.activo = 1 OR l.id IS NOT NULL)
       ${sede ? "AND s.cids = ?" : `AND (s.cids IS NULL OR s.cids != ${PANAMA})`}
     GROUP BY s.id`,
    [...(sellerId ? [sellerId] : []), ...(canal ? [canal] : []), ...(sede ? [sede] : [])],
  );

  // 4. Top 5 vendedores por cierres: mismos filtros y ventas que la tarjeta de Cierres.
  const topVendorsResult: any = await query(
    `SELECT s.name, COUNT(l.id) AS total_ventas
       FROM leads l
       JOIN sellers s ON s.id = l.seller_id
      WHERE ${conFiltros(ventaQueSuma, "s.activo = 1")}
      GROUP BY s.id, s.name
      ORDER BY total_ventas DESC
      LIMIT 5`,
    params,
  );

  // 5. Ranking de estados por volumen de leads
  const ubicacionRankingResult: any = await query(
    `SELECT l.ubicacion_estado, COUNT(*) AS total
       FROM leads l
      WHERE ${conFiltros(delPeriodo, "l.ubicacion_estado IS NOT NULL", "l.ubicacion_estado != ''")}
      GROUP BY l.ubicacion_estado
      ORDER BY total DESC
      LIMIT 10`,
    params,
  );

  // 6. Top productos sin stock (perdidos por "Sin inventario"), por fecha de cierre.
  const topProductosSinStockResult: any = await query(
    `SELECT l.producto_perdido AS producto, COUNT(*) AS total
       FROM leads l
      WHERE ${conFiltros(
        cerradoEnPeriodo("l.status = 'CERRADO' AND l.motivo_cierre = 'PERDIDO'"),
        "l.motivo_perdido = 'Sin inventario'",
        "l.producto_perdido IS NOT NULL",
        "l.producto_perdido != ''",
        "l.producto_perdido != 'OTRO'",
      )}
      GROUP BY l.producto_perdido
      ORDER BY total DESC
      LIMIT 10`,
    params,
  );

  return {
    sede,
    fechaInicio,
    fechaFin,
    // Panamá se ofrece en el selector solo a quien no está atado a una sede (SuperAdmin y compañía).
    puedePanama: userCids == null,
    stats,
    canales,
    stageData: stageResult.rows || [],
    vendorData: vendorResult.rows || [],
    topVendors: topVendorsResult.rows || [],
    ubicacionRanking: ubicacionRankingResult.rows || [],
    topProductosSinStock: topProductosSinStockResult.rows || [],
  };
}
