/**
 * Genera el reporte trimestral completo, arma el .xlsx y guarda el "cierre"
 * en `reporte_trimestral_snapshots` (con el archivo embebido en base64).
 *
 * Lo usan: el cron trimestral, la ruta de descarga (cuando no hay archivo
 * guardado todavía) y el POST manual de "guardar cierre".
 */

import { query } from "@/lib/db";
import {
  calcularEpp,
  COMPANY_ID_PANAMA,
  construirReporteCompleto,
  type CuentaEppCalculada,
  type ReporteTrimestral,
} from "@/lib/reportes-comerciales/reporteTrimestral";
import { generarExcelTrimestral, nombreArchivoTrimestral } from "@/lib/reportes-comerciales/excel";
import { ensureTablasReportesComerciales } from "@/lib/reportes-comerciales/tablas";

export interface ResultadoCierre {
  reporte: ReporteTrimestral;
  epp: CuentaEppCalculada[];
  archivoNombre: string;
  buffer: Buffer;
}

export async function generarYGuardarTrimestre(opts: {
  trimestre: string;
  marca: string;
  generadoPor?: string;
}): Promise<ResultadoCierre> {
  await ensureTablasReportesComerciales();

  const { reporte, detalle } = await construirReporteCompleto({
    trimestre: opts.trimestre,
    marca: opts.marca,
  });
  const anio = parseInt(reporte.periodo.trimestre.slice(0, 4), 10);

  const { rows: filasEpp } = await query(
    `SELECT id, cliente_nombre, odoo_partner_id, meta_anual
       FROM epp_clientes
      WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
      ORDER BY meta_anual DESC`,
    [COMPANY_ID_PANAMA, anio, reporte.periodo.marca],
  );
  const epp = calcularEpp(reporte.rankingClientes, filasEpp as any);

  const buffer = await generarExcelTrimestral({ reporte, detalle, epp });
  const archivoNombre = nombreArchivoTrimestral(reporte);

  await query(
    `INSERT INTO reporte_trimestral_snapshots
       (company_id, marca, trimestre, total_venta, total_unidades, num_facturas, num_clientes,
        payload_json, archivo_nombre, archivo_b64, generado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_venta = VALUES(total_venta),
       total_unidades = VALUES(total_unidades),
       num_facturas = VALUES(num_facturas),
       num_clientes = VALUES(num_clientes),
       payload_json = VALUES(payload_json),
       archivo_nombre = VALUES(archivo_nombre),
       archivo_b64 = VALUES(archivo_b64),
       generado_por = VALUES(generado_por)`,
    [
      COMPANY_ID_PANAMA,
      reporte.periodo.marca,
      reporte.periodo.trimestre,
      reporte.totales.venta,
      Math.round(reporte.totales.unidades),
      reporte.totales.facturas,
      reporte.totales.clientes,
      JSON.stringify({ ...reporte, epp }),
      archivoNombre,
      buffer.toString("base64"),
      opts.generadoPor || "",
    ],
  );

  return { reporte, epp, archivoNombre, buffer };
}

/** Lee el archivo guardado de un trimestre; null si no existe. */
export async function leerArchivoTrimestre(
  trimestre: string,
  marca: string,
): Promise<{ nombre: string; buffer: Buffer } | null> {
  await ensureTablasReportesComerciales();
  const { rows } = await query(
    `SELECT archivo_nombre, archivo_b64
       FROM reporte_trimestral_snapshots
      WHERE company_id = ? AND marca = ? AND trimestre = ?
      LIMIT 1`,
    [COMPANY_ID_PANAMA, marca.toUpperCase(), trimestre],
  );
  const row = (rows as any[])[0];
  if (!row?.archivo_b64) return null;
  return {
    nombre: row.archivo_nombre || `reporte_${trimestre}.xlsx`,
    buffer: Buffer.from(row.archivo_b64, "base64"),
  };
}
