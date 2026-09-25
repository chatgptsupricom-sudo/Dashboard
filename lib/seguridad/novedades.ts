import { query } from "@/lib/db";
import type { Novedad } from "@/lib/seguridad/egresoFlujo";

/**
 * Novedades de la verificacion de Seguridad en C4 (issue #301), en
 * `seguridad_mercancia_novedades` (sql/egreso_verificacion_c4.sql). Cada fila
 * tiene la forma de `Novedad` (lib/seguridad/egresoFlujo).
 *
 * Por ronda: si Seguridad no despacha, el egreso vuelve a Almacen y la
 * siguiente verificacion es otra ronda. Las de rondas anteriores quedan como
 * historial.
 *
 *  - origen 'escaneo': se registran al pistolear (serial_sobra,
 *    serial_otra_orden, producto_ajeno). No se pueden deducir despues de los
 *    renglones: son los `sobrantes` de `novedadesVerificacion`.
 *  - origen 'cierre': todas las de la ronda, como quedaron al cerrar la
 *    verificacion (ya incluyen las de escaneo).
 *
 * Para calificar (#302), las de la ronda que termino en despacho son las de
 * `novedadesVerificacion(items, { seriales, sobrantes: novedadesDeEscaneo(
 * novedades, ronda) })`, o las guardadas con origen 'cierre' de esa ronda.
 */

export type NovedadGuardada = Novedad & {
  id: number;
  ronda: number;
  origen: "escaneo" | "cierre";
  registrado_por: string | null;
  created_at: string;
};

type TipoEscaneo = "serial_sobra" | "serial_otra_orden" | "producto_ajeno";

const MAX = { producto: 300, serial: 100, orden: 100, detalle: 300, nombre: 200 };

const recortar = (v: unknown, max: number) =>
  v === null || v === undefined || v === "" ? null : String(v).slice(0, max);

let hayRonda = false;

/**
 * Si ya se corrio sql/egreso_verificacion_c4.sql (columnas ronda_verificacion
 * y verificado_en). SHOW COLUMNS y no information_schema: el phpMyAdmin de
 * EasyPanel no deja leerlo. Se cachea solo el "si": cuando se corre la
 * migracion, empieza a usarse sin reiniciar.
 */
export async function hayColumnasVerificacion(): Promise<boolean> {
  if (hayRonda) return true;
  try {
    const r = await query("SHOW COLUMNS FROM seguridad_mercancia LIKE 'ronda_verificacion'");
    hayRonda = (r.rows as any[]).length > 0;
  } catch {
    hayRonda = false;
  }
  return hayRonda;
}

/**
 * SQL de "el egreso volvio de Seguridad al menos una vez" (ronda > 1): tuvo
 * novedades en una ronda anterior aunque la ultima saliera limpia.
 */
export async function sqlFueDevuelto(alias = "m"): Promise<string> {
  return (await hayColumnasVerificacion()) ? `${alias}.ronda_verificacion > 1` : "FALSE";
}

/** Todas las novedades del egreso, de todas las rondas. Sin la tabla: ninguna. */
export async function leerNovedades(mercanciaId: number): Promise<NovedadGuardada[]> {
  try {
    const r = await query(
      `SELECT id, ronda, origen, tipo, item_id, producto, serial, esperado, contado,
              otra_orden, detalle, registrado_por, created_at
         FROM seguridad_mercancia_novedades
        WHERE mercancia_id = ? ORDER BY ronda, id`,
      [mercanciaId],
    );
    return (r.rows as any[]).map((n) => ({
      ...n,
      item_id: n.item_id === null ? null : Number(n.item_id),
      ronda: Number(n.ronda),
      esperado: Number(n.esperado),
      contado: n.contado === null ? null : Number(n.contado),
    }));
  } catch {
    return [];
  }
}

/** Las que se registraron al pistolear en una ronda: los `sobrantes`. */
export function novedadesDeEscaneo(todas: NovedadGuardada[], ronda: number): Novedad[] {
  return todas.filter((n) => n.ronda === ronda && n.origen === "escaneo");
}

/**
 * Registra al pistolear un serial que no esta en el picking, uno de otra
 * orden o un producto que no esta en la orden.
 *
 * El mismo serial dos veces en la misma ronda no es otra novedad: devuelve
 * `repetido`. Un producto que no esta en la orden si puede venir varias veces
 * (son varias cajas): suma 1 a `contado` de la fila que ya existe.
 */
export async function registrarNovedadEscaneo(
  mercanciaId: number,
  ronda: number,
  n: {
    tipo: TipoEscaneo;
    item_id: number | null;
    producto: string;
    serial: string;
    otra_orden?: string | null;
  },
  quien: string,
): Promise<{ repetido: boolean; contado: number }> {
  const acumula = n.tipo === "producto_ajeno";
  const existe = await query(
    `SELECT id, contado FROM seguridad_mercancia_novedades
      WHERE mercancia_id = ? AND ronda = ? AND origen = 'escaneo' AND tipo = ? AND serial = ?
      LIMIT 1`,
    [mercanciaId, ronda, n.tipo, n.serial],
  );
  const fila = (existe.rows as any[])[0];
  if (fila && !acumula) return { repetido: true, contado: Number(fila.contado || 1) };
  if (fila) {
    await query("UPDATE seguridad_mercancia_novedades SET contado = contado + 1 WHERE id = ?", [fila.id]);
    return { repetido: false, contado: Number(fila.contado || 0) + 1 };
  }
  // Nueva. Si otra persona pistoleo el mismo codigo entre el SELECT de arriba
  // y aca, la clave unica (sql/egreso_novedades_unica.sql) la frena: no queda
  // duplicada, y si acumula, se suma a la que ya existe. Sin esa clave se
  // inserta como antes (la carrera queda posible).
  //
  // Dos sentencias distintas a proposito: mysql2 abre la conexion con
  // FOUND_ROWS, y con eso un ON DUPLICATE KEY UPDATE que no cambia nada
  // devuelve affectedRows 1, igual que una fila nueva. Con INSERT IGNORE un
  // duplicado da 0; con `contado + 1` un duplicado siempre cambia y da 2.
  const res = await query(
    `INSERT ${acumula ? "" : "IGNORE "}INTO seguridad_mercancia_novedades
      (mercancia_id, ronda, origen, tipo, item_id, producto, serial, esperado, contado,
       otra_orden, registrado_por)
     VALUES (?, ?, 'escaneo', ?, ?, ?, ?, 0, 1, ?, ?)
     ${acumula ? "ON DUPLICATE KEY UPDATE contado = contado + 1" : ""}`,
    [
      mercanciaId,
      ronda,
      n.tipo,
      n.item_id,
      recortar(n.producto, MAX.producto) || "",
      recortar(n.serial, MAX.serial),
      recortar(n.otra_orden, MAX.orden),
      recortar(quien, MAX.nombre),
    ],
  );
  const afectadas = Number((res.rows as any)?.affectedRows || 0);
  if (afectadas === 1) return { repetido: false, contado: 1 };
  if (!acumula) return { repetido: true, contado: 1 };
  const ahora = await query(
    `SELECT contado FROM seguridad_mercancia_novedades
      WHERE mercancia_id = ? AND ronda = ? AND origen = 'escaneo' AND tipo = ? AND serial = ?
      LIMIT 1`,
    [mercanciaId, ronda, n.tipo, recortar(n.serial, MAX.serial)],
  );
  return { repetido: false, contado: Number((ahora.rows as any[])[0]?.contado || 1) };
}

/** Guarda las novedades con que se cerro una ronda (ya calculadas). */
export async function guardarNovedadesCierre(
  mercanciaId: number,
  ronda: number,
  novedades: Novedad[],
  quien: string,
): Promise<void> {
  if (novedades.length === 0) return;
  const valores: unknown[] = [];
  const marcadores = novedades
    .map((n) => {
      valores.push(
        mercanciaId,
        ronda,
        n.tipo,
        n.item_id,
        recortar(n.producto, MAX.producto) || "",
        recortar(n.serial, MAX.serial),
        n.esperado,
        n.contado,
        recortar(n.otra_orden, MAX.orden),
        recortar(n.detalle, MAX.detalle),
        recortar(quien, MAX.nombre),
      );
      return "(?, ?, 'cierre', ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    })
    .join(", ");
  // IGNORE: con la clave unica, una fila repetida (el mismo serial dos
  // veces en la lista) se salta en vez de hacer fallar todo el cierre.
  await query(
    `INSERT IGNORE INTO seguridad_mercancia_novedades
      (mercancia_id, ronda, origen, tipo, item_id, producto, serial, esperado, contado,
       otra_orden, detalle, registrado_por)
     VALUES ${marcadores}`,
    valores,
  );
}

/**
 * Orden a la que pertenece un serial esperado de OTRO egreso, o null. Usa el
 * indice por `serial` de seguridad_mercancia_seriales.
 */
export async function serialDeOtroEgreso(serial: string, mercanciaId: number): Promise<string | null> {
  const r = await query(
    `SELECT m.odoo_picking_name, m.id
       FROM seguridad_mercancia_seriales s
       JOIN seguridad_mercancia m ON m.id = s.mercancia_id
      WHERE s.serial = ? AND s.mercancia_id <> ?
      ORDER BY s.id DESC LIMIT 1`,
    [serial, mercanciaId],
  );
  const fila = (r.rows as any[])[0];
  return fila ? String(fila.odoo_picking_name || `#${fila.id}`) : null;
}
