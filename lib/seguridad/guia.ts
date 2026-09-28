import { query } from "@/lib/db";

/**
 * Número de guía del acta de RMA (antes "N.º ND", el correlativo que el
 * almacén llevaba a mano en la planilla de papel).
 *
 * Ahora lo pone el sistema: cada ingreso toma el siguiente número de su
 * sucursal, y su despacho lleva el MISMO número, como en la planilla
 * "Recepción y Despacho de RMA", que es una sola hoja. Un despacho sin
 * ingreso vinculado toma el siguiente, igual que un ingreso.
 *
 * La secuencia sigue desde los números que ya había en la base (los que se
 * escribieron a mano), mirando ingresos y despachos para que un despacho
 * suelto no repita el número de un ingreso. Los escritos como "ND-9045"
 * cuentan como 9045.
 */
export async function siguienteGuia(cids: number | null): Promise<string> {
  const numero = `CAST(REGEXP_REPLACE(nd_numero, '^[Nn][Dd][^0-9]*', '') AS UNSIGNED)`;
  const filtro = `REGEXP_REPLACE(nd_numero, '^[Nn][Dd][^0-9]*', '') REGEXP '^[0-9]+$' AND cids <=> ?`;
  const r = await query(
    `SELECT COALESCE(MAX(n), 0) AS ultimo FROM (
       SELECT ${numero} AS n FROM seguridad_ingresos WHERE ${filtro}
       UNION ALL
       SELECT ${numero} AS n FROM seguridad_despachos WHERE ${filtro}
     ) t`,
    [cids, cids],
  );
  return String(Number((r.rows as any[])[0]?.ultimo || 0) + 1);
}

/** El número de guía de un ingreso, para que su despacho lleve el mismo. */
export async function guiaDeIngreso(ingresoId: number): Promise<string | null> {
  const r = await query(`SELECT nd_numero FROM seguridad_ingresos WHERE id = ?`, [ingresoId]);
  const v = (r.rows as any[])[0]?.nd_numero;
  return v ? String(v) : null;
}
