import { getConnection, query } from "@/lib/db";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { productosDeLaOc } from "@/lib/recepcion/odoo";
import { cuotaDeSedes, type CuotaSede } from "@/lib/cuota/sede";
import {
  almacenSede,
  catalogo,
  costos,
  disponible,
  hoyCaracas,
  sumarDias,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";
import {
  CARACAS,
  PCT_SIN_CUOTA,
  VALENCIA,
  agruparRenglones,
  cantidadParaCaracas,
  claveProducto,
  conAutomatico,
  conCantidadManual,
  diferenciasConPacking,
  errorCantidadManual,
  lineaAutomatica,
  normalizarParametros,
  pctCuotaCaracas,
  puedeRepartirse,
  resumirReparto,
  type BaseCantidad,
  type LineaReparto,
  type ParametrosReparto,
  type ResumenReparto,
} from "@/lib/recepcion/repartoSedes";

/**
 * Guardado y auditoría del reparto de un packing list entre Valencia y
 * Caracas (el cálculo puro está en `repartoSedes.ts`).
 *
 * Tablas (se crean solas; referencia `sql/recepcion_reparto_sedes.sql`):
 *  - `recepcion_reparto_sedes`: una fila por packing list: si se reparte, los
 *    parámetros, la cuota usada y `version` (cada cambio la sube: dos
 *    personas no se pisan, la segunda recibe 409).
 *  - `recepcion_reparto_lineas`: una por producto (por `clave` = código, no
 *    por renglón: editar el packing list borra y vuelve a crear los
 *    renglones), con lo que va a cada sede, lo que daba el automático y los
 *    datos con que se calculó.
 *  - `recepcion_reparto_eventos`: el historial. Todo cambio deja su evento
 *    en la MISMA transacción que el cambio (si no se puede anotar, no se
 *    cambia): quién, cuándo, qué había antes y qué quedó.
 *
 * Nunca toca `recepcion_packing_items`, el conteo, la Factura Especial ni
 * Odoo: la recepción y la carga a Odoo no cambian por el reparto.
 */

export interface Quien {
  nombre: string;
  email: string | null;
}

export class ErrorReparto extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type AccionEvento =
  | "activado"
  | "desactivado"
  | "calculado"
  | "recalculado"
  | "manual"
  | "automatico"
  | "porcentaje"
  | "error_calculo";

export interface CabeceraReparto {
  recepcionId: number;
  activo: boolean;
  parametros: ParametrosReparto;
  cuotaValencia: number | null;
  cuotaCaracas: number | null;
  cuotaFuenteValencia: string | null;
  cuotaFuenteCaracas: string | null;
  cuotaMes: string | null;
  /** % de cuota de Caracas usado (0..1). */
  pctCuotaCaracas: number | null;
  baseCantidad: BaseCantidad | null;
  calculadoAt: string | null;
  calculadoPor: string | null;
  error: string | null;
  version: number;
  updatedAt: string | null;
  updatedPor: string | null;
}

export type LineaGuardada = LineaReparto & { manualPor: string | null; manualAt: string | null };

export interface EventoReparto {
  id: number;
  accion: AccionEvento;
  detalle: any;
  usuario: string;
  email: string | null;
  createdAt: string;
}

export interface Reparto {
  cabecera: CabeceraReparto | null;
  lineas: LineaGuardada[];
  resumen: ResumenReparto;
  eventos: EventoReparto[];
  /** Productos cuya cantidad cambió en el packing list desde el cálculo. */
  diferencias: { clave: string; enReparto: number; enPacking: number }[];
  /** Cantidad que se usaría hoy para recalcular (esperada antes de cerrar, contada después). */
  baseActual: BaseCantidad;
  /** Renglones de la Factura Especial de Caracas, que no entran al reparto. */
  renglonesFacturaEspecial: number;
}

// ---------------------------------------------------------------------------
// Tablas

let tablasListas: Promise<void> | null = null;

export function asegurarTablasReparto(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS recepcion_reparto_sedes (
        recepcion_id INT NOT NULL PRIMARY KEY,
        activo TINYINT(1) NOT NULL DEFAULT 0,
        peso_rotacion DECIMAL(5,4) NOT NULL DEFAULT 0.5,
        ventana_dias INT NOT NULL DEFAULT 90,
        cuota_valencia DECIMAL(15,2) DEFAULT NULL,
        cuota_caracas DECIMAL(15,2) DEFAULT NULL,
        cuota_fuente_valencia VARCHAR(30) DEFAULT NULL,
        cuota_fuente_caracas VARCHAR(30) DEFAULT NULL,
        cuota_mes VARCHAR(7) DEFAULT NULL,
        pct_cuota_caracas DECIMAL(9,6) DEFAULT NULL,
        base_cantidad VARCHAR(12) DEFAULT NULL,
        calculado_at TIMESTAMP NULL DEFAULT NULL,
        calculado_por VARCHAR(200) DEFAULT NULL,
        error TEXT DEFAULT NULL,
        version INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        updated_por VARCHAR(200) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await query(`CREATE TABLE IF NOT EXISTS recepcion_reparto_lineas (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        recepcion_id INT NOT NULL,
        clave VARCHAR(320) NOT NULL,
        codigo VARCHAR(100) DEFAULT NULL,
        producto VARCHAR(300) DEFAULT NULL,
        odoo_product_id INT DEFAULT NULL,
        cantidad DECIMAL(14,3) NOT NULL,
        cajas INT DEFAULT NULL,
        por_caja INT DEFAULT NULL,
        cantidad_valencia DECIMAL(14,3) NOT NULL,
        cantidad_caracas DECIMAL(14,3) NOT NULL,
        auto_caracas DECIMAL(14,3) NOT NULL,
        origen VARCHAR(10) NOT NULL DEFAULT 'auto',
        base VARCHAR(10) NOT NULL DEFAULT 'cuota',
        pct_cuota_caracas DECIMAL(9,6) NOT NULL,
        pct_rotacion_caracas DECIMAL(9,6) DEFAULT NULL,
        pct_objetivo_caracas DECIMAL(9,6) NOT NULL,
        ventas_valencia DECIMAL(14,3) NOT NULL DEFAULT 0,
        ventas_caracas DECIMAL(14,3) NOT NULL DEFAULT 0,
        stock_valencia DECIMAL(14,3) DEFAULT NULL,
        stock_caracas DECIMAL(14,3) DEFAULT NULL,
        costo DECIMAL(14,4) DEFAULT NULL,
        motivo_manual VARCHAR(500) DEFAULT NULL,
        manual_por VARCHAR(200) DEFAULT NULL,
        manual_at TIMESTAMP NULL DEFAULT NULL,
        UNIQUE KEY uq_reparto_linea (recepcion_id, clave),
        KEY idx_reparto_recepcion (recepcion_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await query(`CREATE TABLE IF NOT EXISTS recepcion_reparto_eventos (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        recepcion_id INT NOT NULL,
        accion VARCHAR(30) NOT NULL,
        detalle MEDIUMTEXT,
        usuario VARCHAR(200) NOT NULL,
        email VARCHAR(200) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_reparto_eventos (recepcion_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

// ---------------------------------------------------------------------------
// Lectura

const n = (v: unknown) => (v == null ? null : Number(v));
const fecha = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

function aCabecera(f: any): CabeceraReparto {
  return {
    recepcionId: Number(f.recepcion_id),
    activo: !!Number(f.activo),
    parametros: normalizarParametros({ pesoRotacion: Number(f.peso_rotacion), ventanaDias: Number(f.ventana_dias) }),
    cuotaValencia: n(f.cuota_valencia),
    cuotaCaracas: n(f.cuota_caracas),
    cuotaFuenteValencia: f.cuota_fuente_valencia ?? null,
    cuotaFuenteCaracas: f.cuota_fuente_caracas ?? null,
    cuotaMes: f.cuota_mes ?? null,
    pctCuotaCaracas: n(f.pct_cuota_caracas),
    baseCantidad: (f.base_cantidad as BaseCantidad) ?? null,
    calculadoAt: fecha(f.calculado_at),
    calculadoPor: f.calculado_por ?? null,
    error: f.error ?? null,
    version: Number(f.version) || 0,
    updatedAt: fecha(f.updated_at),
    updatedPor: f.updated_por ?? null,
  };
}

function aLinea(f: any): LineaGuardada {
  return {
    clave: String(f.clave),
    codigo: f.codigo ?? null,
    producto: String(f.producto ?? ""),
    odooProductId: n(f.odoo_product_id),
    cantidad: Number(f.cantidad),
    cajas: n(f.cajas),
    porCaja: n(f.por_caja),
    cantidadValencia: Number(f.cantidad_valencia),
    cantidadCaracas: Number(f.cantidad_caracas),
    autoCaracas: Number(f.auto_caracas),
    origen: f.origen === "manual" ? "manual" : "auto",
    base: f.base === "rotacion" ? "rotacion" : "cuota",
    pctCuotaCaracas: Number(f.pct_cuota_caracas),
    pctRotacionCaracas: n(f.pct_rotacion_caracas),
    pctObjetivoCaracas: Number(f.pct_objetivo_caracas),
    ventasValencia: Number(f.ventas_valencia),
    ventasCaracas: Number(f.ventas_caracas),
    stockValencia: n(f.stock_valencia),
    stockCaracas: n(f.stock_caracas),
    costo: n(f.costo),
    motivoManual: f.motivo_manual ?? null,
    manualPor: f.manual_por ?? null,
    manualAt: fecha(f.manual_at),
  };
}

async function leerCabecera(recepcionId: number): Promise<CabeceraReparto | null> {
  const r = await query("SELECT * FROM recepcion_reparto_sedes WHERE recepcion_id = ?", [recepcionId]);
  const f = (r.rows as any[])[0];
  return f ? aCabecera(f) : null;
}

async function leerLineas(recepcionId: number): Promise<LineaGuardada[]> {
  const r = await query("SELECT * FROM recepcion_reparto_lineas WHERE recepcion_id = ? ORDER BY id", [recepcionId]);
  return (r.rows as any[]).map(aLinea);
}

async function leerRecepcionBase(recepcionId: number) {
  await asegurarColumnasOdoo();
  const r = await query(
    "SELECT id, cids, origen, etapa, descartado_at, odoo_purchase_order_id FROM recepcion_packing WHERE id = ?",
    [recepcionId],
  );
  const rec = (r.rows as any[])[0];
  if (!rec) throw new ErrorReparto("Packing list no encontrado", 404);
  const items = await query(
    `SELECT id, codigo, producto, cantidad_esperada, cantidad_recibida, cajas_esperadas, factura_aparte, odoo_product_id
       FROM recepcion_packing_items WHERE recepcion_id = ? ORDER BY id`,
    [recepcionId],
  );
  const base: BaseCantidad = rec.etapa === "cerrado" ? "recibida" : "esperada";
  return { rec, items: items.rows as any[], base };
}

export async function leerReparto(recepcionId: number): Promise<Reparto> {
  await asegurarTablasReparto();
  const [{ items, base }, cabecera, lineas, ev] = await Promise.all([
    leerRecepcionBase(recepcionId),
    leerCabecera(recepcionId),
    leerLineas(recepcionId),
    query(
      "SELECT id, accion, detalle, usuario, email, created_at FROM recepcion_reparto_eventos WHERE recepcion_id = ? ORDER BY id DESC LIMIT 300",
      [recepcionId],
    ),
  ]);
  const eventos: EventoReparto[] = (ev.rows as any[]).map((f) => {
    let detalle: any = null;
    try {
      detalle = f.detalle ? JSON.parse(f.detalle) : null;
    } catch {
      detalle = f.detalle;
    }
    return { id: Number(f.id), accion: f.accion, detalle, usuario: f.usuario, email: f.email ?? null, createdAt: fecha(f.created_at)! };
  });
  const productos = agruparRenglones(items, base);
  return {
    cabecera,
    lineas,
    resumen: resumirReparto(lineas),
    eventos,
    diferencias: lineas.length ? diferenciasConPacking(lineas, productos) : [],
    baseActual: base,
    renglonesFacturaEspecial: items.filter((i) => i.factura_aparte).length,
  };
}

/** Resumen por packing list para la lista (solo los que se reparten). */
export async function resumenesReparto(
  ids: number[],
): Promise<Map<number, { pctUnidadesCaracas: number | null; pctValorCaracas: number | null; unidadesCaracas: number; unidades: number }>> {
  const out = new Map<number, { pctUnidadesCaracas: number | null; pctValorCaracas: number | null; unidadesCaracas: number; unidades: number }>();
  const lista = [...new Set(ids.map(Number).filter((x) => x > 0))];
  if (!lista.length) return out;
  await asegurarTablasReparto();
  const r = await query(
    `SELECT s.recepcion_id,
            COALESCE(SUM(l.cantidad), 0) AS unidades,
            COALESCE(SUM(l.cantidad_caracas), 0) AS caracas,
            COALESCE(SUM(CASE WHEN l.costo > 0 THEN l.cantidad * l.costo END), 0) AS valor,
            COALESCE(SUM(CASE WHEN l.costo > 0 THEN l.cantidad_caracas * l.costo END), 0) AS valor_caracas
       FROM recepcion_reparto_sedes s
       LEFT JOIN recepcion_reparto_lineas l ON l.recepcion_id = s.recepcion_id
      WHERE s.activo = 1 AND s.recepcion_id IN (${lista.map(() => "?").join(",")})
      GROUP BY s.recepcion_id`,
    lista,
  );
  for (const f of r.rows as any[]) {
    const unidades = Number(f.unidades) || 0;
    const valor = Number(f.valor) || 0;
    out.set(Number(f.recepcion_id), {
      unidades,
      unidadesCaracas: Number(f.caracas) || 0,
      pctUnidadesCaracas: unidades > 0 ? Number(f.caracas) / unidades : null,
      pctValorCaracas: valor > 0 ? Number(f.valor_caracas) / valor : null,
    });
  }
  return out;
}

/**
 * Fracción de cada producto (por `clave`) que va a Caracas, de los packing
 * list con reparto activo. Para Llegadas y Por llegar: se aplica a cada
 * renglón (esperado o contado) en proporción.
 */
export async function fraccionesCaracas(ids: number[]): Promise<Map<number, Map<string, number>>> {
  const out = new Map<number, Map<string, number>>();
  const lista = [...new Set(ids.map(Number).filter((x) => x > 0))];
  if (!lista.length) return out;
  await asegurarTablasReparto();
  const r = await query(
    `SELECT l.recepcion_id, l.clave, l.cantidad, l.cantidad_caracas
       FROM recepcion_reparto_lineas l
       JOIN recepcion_reparto_sedes s ON s.recepcion_id = l.recepcion_id AND s.activo = 1
      WHERE l.recepcion_id IN (${lista.map(() => "?").join(",")})`,
    lista,
  );
  for (const f of r.rows as any[]) {
    const id = Number(f.recepcion_id);
    const q = Number(f.cantidad) || 0;
    if (!out.has(id)) out.set(id, new Map());
    out.get(id)!.set(String(f.clave), q > 0 ? Math.min(1, Math.max(0, Number(f.cantidad_caracas) / q)) : 0);
  }
  return out;
}

export { claveProducto };

// ---------------------------------------------------------------------------
// Escritura (todo en una transacción con su evento)

interface Escritura {
  cabecera: Record<string, unknown>;
  /** Si viene, reemplaza todas las líneas. */
  lineas?: LineaGuardada[];
  /** Versión que vio quien hace el cambio; null = no se compara (cálculo del sistema). */
  versionEsperada: number | null;
  /**
   * Solo escribe si el reparto sigue prendido (o todavía no existe): un
   * recálculo lee Odoo varios segundos y en ese rato alguien pudo apagarlo.
   */
  soloSiActivo?: boolean;
  evento: { accion: AccionEvento; detalle: unknown };
}

const COLUMNAS_CABECERA = new Set([
  "activo",
  "peso_rotacion",
  "ventana_dias",
  "cuota_valencia",
  "cuota_caracas",
  "cuota_fuente_valencia",
  "cuota_fuente_caracas",
  "cuota_mes",
  "pct_cuota_caracas",
  "base_cantidad",
  "calculado_at",
  "calculado_por",
  "error",
]);

async function escribir(recepcionId: number, quien: Quien, e: Escritura): Promise<number> {
  for (const k of Object.keys(e.cabecera)) if (!COLUMNAS_CABECERA.has(k)) throw new Error(`Columna no permitida: ${k}`);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [filas]: any = await conn.execute(
      "SELECT version, activo FROM recepcion_reparto_sedes WHERE recepcion_id = ? FOR UPDATE",
      [recepcionId],
    );
    const actual = filas[0] ? Number(filas[0].version) || 0 : null;
    if (e.soloSiActivo && filas[0] && !Number(filas[0].activo)) {
      throw new ErrorReparto("El reparto se apagó mientras se calculaba: no se guardó el cálculo.", 409);
    }
    if (e.versionEsperada != null && (actual ?? 0) !== e.versionEsperada) {
      throw new ErrorReparto("Alguien más cambió el reparto mientras lo veías. Se recargó: revisa y vuelve a intentar.", 409);
    }
    const cols = Object.keys(e.cabecera);
    const vals: any[] = cols.map((k) => e.cabecera[k] ?? null);
    if (actual == null) {
      await conn.execute(
        `INSERT INTO recepcion_reparto_sedes (recepcion_id, ${cols.join(", ")}${cols.length ? ", " : ""}version, updated_at, updated_por)
         VALUES (?, ${cols.map(() => "?").join(", ")}${cols.length ? ", " : ""}1, NOW(), ?)`,
        [recepcionId, ...vals, quien.nombre],
      );
    } else {
      await conn.execute(
        `UPDATE recepcion_reparto_sedes SET ${cols.map((c) => `${c} = ?`).join(", ")}${cols.length ? ", " : ""}
                version = version + 1, updated_at = NOW(), updated_por = ?
          WHERE recepcion_id = ?`,
        [...vals, quien.nombre, recepcionId],
      );
    }
    if (e.lineas) {
      await conn.execute("DELETE FROM recepcion_reparto_lineas WHERE recepcion_id = ?", [recepcionId]);
      const COLS = [
        "recepcion_id", "clave", "codigo", "producto", "odoo_product_id", "cantidad", "cajas", "por_caja",
        "cantidad_valencia", "cantidad_caracas", "auto_caracas", "origen", "base",
        "pct_cuota_caracas", "pct_rotacion_caracas", "pct_objetivo_caracas",
        "ventas_valencia", "ventas_caracas", "stock_valencia", "stock_caracas", "costo",
        "motivo_manual", "manual_por", "manual_at",
      ];
      const fila = `(${COLS.map(() => "?").join(",")})`;
      for (let i = 0; i < e.lineas.length; i += 200) {
        const lote = e.lineas.slice(i, i + 200);
        const params: any[] = [];
        for (const l of lote) {
          const manual = l.origen === "manual";
          params.push(
            recepcionId,
            l.clave,
            l.codigo ? String(l.codigo).slice(0, 100) : null,
            String(l.producto || "").slice(0, 300),
            l.odooProductId ?? null,
            l.cantidad,
            l.cajas ?? null,
            l.porCaja ?? null,
            l.cantidadValencia,
            l.cantidadCaracas,
            l.autoCaracas,
            l.origen,
            l.base,
            l.pctCuotaCaracas,
            l.pctRotacionCaracas ?? null,
            l.pctObjetivoCaracas,
            l.ventasValencia,
            l.ventasCaracas,
            l.stockValencia ?? null,
            l.stockCaracas ?? null,
            l.costo ?? null,
            manual && l.motivoManual ? String(l.motivoManual).slice(0, 500) : null,
            manual && l.manualPor ? String(l.manualPor).slice(0, 200) : null,
            manual && l.manualAt ? new Date(l.manualAt) : null,
          );
        }
        await conn.execute(
          `INSERT INTO recepcion_reparto_lineas (${COLS.join(", ")}) VALUES ${lote.map(() => fila).join(", ")}`,
          params,
        );
      }
    }
    await conn.execute(
      "INSERT INTO recepcion_reparto_eventos (recepcion_id, accion, detalle, usuario, email) VALUES (?, ?, ?, ?, ?)",
      [recepcionId, e.evento.accion, JSON.stringify(e.evento.detalle ?? null), quien.nombre.slice(0, 200), quien.email ? quien.email.slice(0, 200) : null],
    );
    const [v]: any = await conn.execute("SELECT version FROM recepcion_reparto_sedes WHERE recepcion_id = ?", [recepcionId]);
    await conn.commit();
    return Number(v[0]?.version) || 0;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

/** Evento suelto (un cálculo que falló): no cambia nada más que el error de la cabecera. */
async function anotarError(recepcionId: number, quien: Quien, mensaje: string, detalle: unknown) {
  try {
    await escribir(recepcionId, quien, {
      cabecera: { error: mensaje.slice(0, 2000) },
      versionEsperada: null,
      evento: { accion: "error_calculo", detalle },
    });
  } catch (e: any) {
    console.error("reparto: no se pudo anotar el error:", e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Validaciones comunes

async function recepcionEditable(recepcionId: number) {
  const base = await leerRecepcionBase(recepcionId);
  if (!puedeRepartirse(base.rec.cids, base.rec.origen)) {
    throw new ErrorReparto("Solo se reparte un packing list que llega a Valencia o a Caracas", 400);
  }
  if (base.rec.descartado_at) throw new ErrorReparto("El packing list está descartado", 409);
  return base;
}

const compacta = (l: LineaReparto) => ({
  clave: l.clave,
  codigo: l.codigo,
  producto: l.producto,
  cantidad: l.cantidad,
  cajas: l.cajas,
  ventasValencia: l.ventasValencia,
  ventasCaracas: l.ventasCaracas,
  stockValencia: l.stockValencia,
  stockCaracas: l.stockCaracas,
  costo: l.costo,
  pctCuotaCaracas: l.pctCuotaCaracas,
  pctRotacionCaracas: l.pctRotacionCaracas,
  pctObjetivoCaracas: l.pctObjetivoCaracas,
  autoCaracas: l.autoCaracas,
  caracas: l.cantidadCaracas,
  valencia: l.cantidadValencia,
  origen: l.origen,
});

const resumenCorto = (r: ResumenReparto) => ({
  unidades: r.unidades,
  valencia: r.unidadesValencia,
  caracas: r.unidadesCaracas,
  pctUnidadesCaracas: r.pctUnidadesCaracas,
  pctValorCaracas: r.pctValorCaracas,
  manuales: r.manuales,
});

function motivoLimpio(motivo: unknown, obligatorio: boolean): string | null {
  const m = String(motivo ?? "").trim().slice(0, 500);
  if (obligatorio && m.length < 3) throw new ErrorReparto("Escribe el motivo del cambio (queda en el historial)", 400);
  return m || null;
}

// ---------------------------------------------------------------------------
// Cálculo automático

/** Producto de Odoo por código (exacto sin espacios, o sin signos contra la OC). */
async function resolverProductos(items: any[], poId: number | null): Promise<Map<string, number>> {
  const norm = (c: unknown) => String(c ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const suelto = (c: string) => norm(c).replace(/^[A-Z]+:/, "").replace(/[^A-Z0-9]/g, "");
  const porClave = new Map<string, number>();
  for (const i of items) {
    if (i.factura_aparte) continue;
    const pid = Number(i.odoo_product_id) || 0;
    const clave = claveProducto(i.codigo, i.producto);
    if (pid && !porClave.has(clave)) porClave.set(clave, pid);
  }
  const faltan = items.filter((i) => !i.factura_aparte && i.codigo && !porClave.has(claveProducto(i.codigo, i.producto)));
  if (!faltan.length) return porClave;

  let oc = new Map<string, number>();
  if (poId) {
    try {
      oc = await productosDeLaOc(poId);
    } catch (e: any) {
      console.warn("reparto: no se leyeron los productos de la OC:", e?.message || e);
    }
  }
  const ocSuelta = new Map<string, number | null>();
  for (const [c, pid] of oc) {
    const k = suelto(c);
    if (k) ocSuelta.set(k, ocSuelta.has(k) && ocSuelta.get(k) !== pid ? null : pid);
  }
  const cat = await catalogo();
  const porCodigo = new Map<string, number | null>();
  for (const p of cat.values()) {
    if (p.codigo.startsWith("PROD-")) continue;
    const c = norm(p.codigo);
    porCodigo.set(c, porCodigo.has(c) && porCodigo.get(c) !== p.id ? null : p.id);
  }
  for (const i of faltan) {
    const c = norm(i.codigo);
    const pid = oc.get(c) || porCodigo.get(c) || ocSuelta.get(suelto(c)) || 0;
    if (pid) porClave.set(claveProducto(i.codigo, i.producto), pid);
  }
  return porClave;
}

export interface OpcionesCalculo {
  parametros?: Partial<ParametrosReparto>;
  /** Vuelve todo al automático, también lo que se cambió a mano. */
  reiniciarManuales?: boolean;
  versionEsperada?: number | null;
  /** Por qué se recalculó (ej. "se editó el packing list"). */
  motivo?: string | null;
  accion?: "calculado" | "recalculado" | "activado";
  /** Lo llama `cambiarActivo` al prender el reparto; si no, un reparto apagado no se recalcula. */
  activar?: boolean;
}

export async function calcularReparto(recepcionId: number, quien: Quien, opts: OpcionesCalculo = {}): Promise<number> {
  await asegurarTablasReparto();
  const { rec, items, base } = await recepcionEditable(recepcionId);
  const anterior = await leerCabecera(recepcionId);
  if (anterior && !anterior.activo && !opts.activar) {
    throw new ErrorReparto("El reparto está apagado: actívalo antes de recalcularlo", 409);
  }
  const params = normalizarParametros({ ...(anterior?.parametros ?? {}), ...(opts.parametros ?? {}) });
  const productos = agruparRenglones(items, base);
  if (!productos.length) throw new ErrorReparto("El packing list no tiene productos para repartir (la Factura Especial de Caracas no se reparte)", 400);

  const hasta = hoyCaracas();
  const desde = sumarDias(hasta, -(params.ventanaDias - 1));
  const mes = hasta.slice(0, 7);
  const sedeLlegada = Number(rec.cids);

  let datos: {
    cuotas: Map<number, CuotaSede>;
    ventasV: Map<number, number>;
    ventasC: Map<number, number>;
    pids: Map<string, number>;
    stockV: Map<number, number> | null;
    stockC: Map<number, number> | null;
    costo: Map<number, number> | null;
  };
  try {
    const [cuotas, ventasV, ventasC, pids, extras] = await Promise.all([
      cuotaDeSedes([VALENCIA, CARACAS], mes),
      unidadesVendidas(VALENCIA, desde, hasta),
      unidadesVendidas(CARACAS, desde, hasta),
      resolverProductos(items, Number(rec.odoo_purchase_order_id) || null),
      Promise.allSettled([almacenSede(VALENCIA), almacenSede(CARACAS), costos(sedeLlegada)]),
    ]);
    const stock = (r: PromiseSettledResult<any>) => {
      if (r.status !== "fulfilled") return null;
      const m = new Map<number, number>();
      for (const [id, s] of r.value.stock as Map<number, any>) m.set(id, disponible(s));
      return m;
    };
    datos = {
      cuotas,
      ventasV,
      ventasC,
      pids,
      stockV: stock(extras[0]),
      stockC: stock(extras[1]),
      costo: extras[2].status === "fulfilled" ? (extras[2].value as Map<number, number>) : null,
    };
  } catch (e: any) {
    const msg = `No se pudo leer la cuota o la rotación: ${e?.message || e}`;
    await anotarError(recepcionId, quien, msg, { motivo: opts.motivo ?? null, parametros: params });
    throw new ErrorReparto(msg, 502);
  }

  const cuotaV = datos.cuotas.get(VALENCIA);
  const cuotaC = datos.cuotas.get(CARACAS);
  const pctCuotaReal = pctCuotaCaracas(cuotaV?.monto ?? 0, cuotaC?.monto ?? 0);
  const pctCuota = pctCuotaReal ?? PCT_SIN_CUOTA;

  const previas = new Map((await leerLineas(recepcionId)).map((l) => [l.clave, l]));
  const conservados: string[] = [];
  const descartados: { clave: string; caracasAntes: number; cantidadAntes: number; cantidadAhora: number }[] = [];
  const lineas: LineaGuardada[] = productos.map((p) => {
    const pid = p.odooProductId || datos.pids.get(p.clave) || null;
    const auto = lineaAutomatica(
      { ...p, odooProductId: pid },
      {
        ventasValencia: pid ? (datos.ventasV.get(pid) ?? 0) : 0,
        ventasCaracas: pid ? (datos.ventasC.get(pid) ?? 0) : 0,
        stockValencia: pid && datos.stockV ? (datos.stockV.get(pid) ?? 0) : null,
        stockCaracas: pid && datos.stockC ? (datos.stockC.get(pid) ?? 0) : null,
        costo: pid && datos.costo ? (datos.costo.get(pid) || null) : null,
      },
      pctCuota,
      params,
    );
    // Si al renglón le pusieron código después del cálculo (cruce con Odoo),
    // la línea de antes está con la clave del nombre.
    const previa = previas.get(p.clave) ?? previas.get(claveProducto(null, p.producto));
    if (previa?.origen === "manual" && !opts.reiniciarManuales) {
      if (Math.abs(previa.cantidad - p.cantidad) < 1e-6) {
        conservados.push(p.clave);
        return { ...conCantidadManual(auto, previa.cantidadCaracas, previa.motivoManual ?? null), manualPor: previa.manualPor, manualAt: previa.manualAt };
      }
      descartados.push({ clave: p.clave, caracasAntes: previa.cantidadCaracas, cantidadAntes: previa.cantidad, cantidadAhora: p.cantidad });
    } else if (previa?.origen === "manual") {
      descartados.push({ clave: p.clave, caracasAntes: previa.cantidadCaracas, cantidadAntes: previa.cantidad, cantidadAhora: p.cantidad });
    }
    return { ...auto, manualPor: null, manualAt: null };
  });

  const resumenAntes = previas.size ? resumenCorto(resumirReparto([...previas.values()])) : null;
  const resumen = resumirReparto(lineas);
  return escribir(recepcionId, quien, {
    cabecera: {
      activo: 1,
      peso_rotacion: params.pesoRotacion,
      ventana_dias: params.ventanaDias,
      cuota_valencia: cuotaV?.monto ?? null,
      cuota_caracas: cuotaC?.monto ?? null,
      cuota_fuente_valencia: cuotaV?.fuente ?? null,
      cuota_fuente_caracas: cuotaC?.fuente ?? null,
      cuota_mes: mes,
      pct_cuota_caracas: pctCuota,
      base_cantidad: base,
      calculado_at: new Date(),
      calculado_por: quien.nombre.slice(0, 200),
      error: null,
    },
    lineas,
    versionEsperada: opts.versionEsperada ?? null,
    soloSiActivo: !opts.activar,
    evento: {
      accion: opts.accion ?? (previas.size ? "recalculado" : "calculado"),
      detalle: {
        motivo: opts.motivo ?? null,
        parametros: params,
        ventana: { desde, hasta },
        base,
        cuota: {
          mes,
          valencia: cuotaV ?? null,
          caracas: cuotaC ?? null,
          pctCaracas: pctCuota,
          sinCuota: pctCuotaReal == null,
        },
        reiniciarManuales: !!opts.reiniciarManuales,
        manualesConservados: conservados,
        manualesDescartados: descartados,
        resumenAntes,
        resumen: resumenCorto(resumen),
        lineas: lineas.map(compacta),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Activar / desactivar

export async function cambiarActivo(
  recepcionId: number,
  activo: boolean,
  quien: Quien,
  opts: { versionEsperada?: number | null; motivo?: unknown; parametros?: Partial<ParametrosReparto> } = {},
): Promise<number> {
  await asegurarTablasReparto();
  // Apagarlo se puede siempre (también si el packing list dejó de llegar a
  // Valencia o Caracas); prenderlo, solo si se puede repartir.
  if (activo) await recepcionEditable(recepcionId);
  else await leerRecepcionBase(recepcionId);
  const cab = await leerCabecera(recepcionId);
  const motivo = motivoLimpio(opts.motivo, false);
  if (activo) {
    if (cab?.activo) return cab.version;
    // Primera vez, o se vuelve a prender: se calcula con lo de hoy (las
    // líneas de antes pueden ser de renglones que ya cambiaron). Lo manual
    // cuya cantidad no cambió se conserva.
    const hayLineas = (await leerLineas(recepcionId)).length > 0;
    return calcularReparto(recepcionId, quien, {
      parametros: opts.parametros,
      versionEsperada: opts.versionEsperada ?? null,
      motivo: motivo ?? "Se activó el reparto",
      accion: hayLineas ? "activado" : "calculado",
      activar: true,
    });
  }
  if (!cab || !cab.activo) return cab?.version ?? 0;
  return escribir(recepcionId, quien, {
    cabecera: { activo: 0 },
    versionEsperada: opts.versionEsperada ?? null,
    evento: { accion: "desactivado", detalle: { motivo } },
  });
}

// ---------------------------------------------------------------------------
// Manual

async function lineasParaCambiar(recepcionId: number, versionEsperada: number | null) {
  await asegurarTablasReparto();
  await recepcionEditable(recepcionId);
  const cab = await leerCabecera(recepcionId);
  if (!cab || !cab.activo) throw new ErrorReparto("Activa el reparto antes de cambiarlo", 409);
  if (versionEsperada != null && cab.version !== versionEsperada) {
    throw new ErrorReparto("Alguien más cambió el reparto mientras lo veías. Se recargó: revisa y vuelve a intentar.", 409);
  }
  const lineas = await leerLineas(recepcionId);
  if (!lineas.length) throw new ErrorReparto("El reparto todavía no está calculado", 409);
  return { cab, lineas };
}

/** Cambia a mano lo que va a Caracas de uno o más productos (el resto queda en Valencia). */
export async function guardarManual(
  recepcionId: number,
  cambios: { clave: string; cantidadCaracas: unknown }[],
  motivo: unknown,
  quien: Quien,
  versionEsperada: number | null,
): Promise<number> {
  if (!Array.isArray(cambios) || !cambios.length) throw new ErrorReparto("No hay cambios", 400);
  const m = motivoLimpio(motivo, true);
  const { lineas } = await lineasParaCambiar(recepcionId, versionEsperada);
  const porClave = new Map(lineas.map((l) => [l.clave, l]));
  const ahora = new Date().toISOString();
  const detalle: any[] = [];
  for (const c of cambios) {
    const l = porClave.get(String(c?.clave));
    if (!l) throw new ErrorReparto(`El producto ${c?.clave} no está en el reparto`, 400);
    const err = errorCantidadManual(c.cantidadCaracas, l.cantidad);
    if (err) throw new ErrorReparto(`${l.codigo || l.producto}: ${err}`, 400);
    const nueva = Number(c.cantidadCaracas);
    if (Math.abs(nueva - l.cantidadCaracas) < 1e-9 && l.origen === "manual") continue;
    detalle.push({ clave: l.clave, codigo: l.codigo, producto: l.producto, cantidad: l.cantidad, caracasAntes: l.cantidadCaracas, caracasDespues: nueva, auto: l.autoCaracas, origenAntes: l.origen });
    porClave.set(l.clave, { ...conCantidadManual(l, nueva, m), manualPor: quien.nombre, manualAt: ahora });
  }
  if (!detalle.length) throw new ErrorReparto("No cambió nada", 400);
  const nuevas = lineas.map((l) => porClave.get(l.clave)!);
  return escribir(recepcionId, quien, {
    cabecera: {},
    lineas: nuevas,
    versionEsperada,
    evento: {
      accion: "manual",
      detalle: { motivo: m, cambios: detalle, resumenAntes: resumenCorto(resumirReparto(lineas)), resumen: resumenCorto(resumirReparto(nuevas)) },
    },
  });
}

/** Aplica un % fijo para Caracas a todos los productos (queda como manual). */
export async function aplicarPorcentaje(
  recepcionId: number,
  pctCaracas: unknown,
  motivo: unknown,
  quien: Quien,
  versionEsperada: number | null,
): Promise<number> {
  const pct = Number(pctCaracas);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ErrorReparto("El porcentaje tiene que estar entre 0 y 100", 400);
  const m = motivoLimpio(motivo, true);
  const { lineas } = await lineasParaCambiar(recepcionId, versionEsperada);
  const ahora = new Date().toISOString();
  const nuevas: LineaGuardada[] = lineas.map((l) => {
    const { caracas } = cantidadParaCaracas(l.cantidad, l.cajas, pct / 100);
    return { ...conCantidadManual(l, caracas, m), manualPor: quien.nombre, manualAt: ahora };
  });
  return escribir(recepcionId, quien, {
    cabecera: {},
    lineas: nuevas,
    versionEsperada,
    evento: {
      accion: "porcentaje",
      detalle: {
        motivo: m,
        pctCaracas: pct,
        cambios: lineas
          .map((l, i) => ({ clave: l.clave, codigo: l.codigo, producto: l.producto, cantidad: l.cantidad, caracasAntes: l.cantidadCaracas, caracasDespues: nuevas[i].cantidadCaracas, auto: l.autoCaracas, origenAntes: l.origen }))
          .filter((c) => Math.abs(c.caracasAntes - c.caracasDespues) > 1e-9),
        resumenAntes: resumenCorto(resumirReparto(lineas)),
        resumen: resumenCorto(resumirReparto(nuevas)),
      },
    },
  });
}

/** Devuelve al automático los productos dados (o todos con `claves` = null). */
export async function volverAutomatico(
  recepcionId: number,
  claves: string[] | null,
  motivo: unknown,
  quien: Quien,
  versionEsperada: number | null,
): Promise<number> {
  const m = motivoLimpio(motivo, false);
  const { lineas } = await lineasParaCambiar(recepcionId, versionEsperada);
  const elegir = claves ? new Set(claves.map(String)) : null;
  const detalle: any[] = [];
  const nuevas: LineaGuardada[] = lineas.map((l) => {
    if (l.origen !== "manual" || (elegir && !elegir.has(l.clave))) return l;
    detalle.push({ clave: l.clave, codigo: l.codigo, producto: l.producto, cantidad: l.cantidad, caracasAntes: l.cantidadCaracas, caracasDespues: l.autoCaracas, motivoManualAntes: l.motivoManual ?? null, manualPorAntes: l.manualPor });
    return { ...conAutomatico(l), manualPor: null, manualAt: null };
  });
  if (!detalle.length) throw new ErrorReparto("No hay productos cambiados a mano para devolver al automático", 400);
  return escribir(recepcionId, quien, {
    cabecera: {},
    lineas: nuevas,
    versionEsperada,
    evento: {
      accion: "automatico",
      detalle: { motivo: m, cambios: detalle, resumenAntes: resumenCorto(resumirReparto(lineas)), resumen: resumenCorto(resumirReparto(nuevas)) },
    },
  });
}

/**
 * Después de editar el packing list (los renglones se borran y se vuelven a
 * crear): si se reparte, se recalcula solo; lo manual se conserva si su
 * cantidad no cambió. Nunca lanza: si falla queda el error anotado.
 */
export async function recalcularSiReparte(recepcionId: number, quien: Quien, motivo: string): Promise<void> {
  try {
    await asegurarTablasReparto();
    const cab = await leerCabecera(recepcionId);
    if (!cab?.activo) return;
    await calcularReparto(recepcionId, quien, { motivo, accion: "recalculado" });
  } catch (e: any) {
    console.error(`reparto: no se recalculó el packing list ${recepcionId}:`, e?.message || e);
    // La falta de cuota o rotación ya la anotó calcularReparto; lo demás
    // (ej. se quitaron todos los productos) se anota aquí para que se vea.
    if (!(e instanceof ErrorReparto && e.status === 502)) {
      await anotarError(recepcionId, quien, `No se recalculó el reparto (${motivo}): ${e?.message || e}`, { motivo });
    }
  }
}
