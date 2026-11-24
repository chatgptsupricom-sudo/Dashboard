import { createHash } from "crypto";
import { db } from "@/lib/db";
import { norm } from "@/lib/inteligencia-negocio/precios/leerLista";

/**
 * Lo que guarda la Inteligencia de Precios en la MySQL del panel (se crea solo):
 *
 * - `precios_cargas`: cada lista cargada (mayorista, fecha de corte, archivo,
 *   resumen de lo que se leyó y descartó, estado de la clasificación).
 * - `precios_mercado`: el catálogo ordenado, una fila por producto de cada
 *   carga, con las columnas del Excel de ejemplo. `pendiente = 1` = todavía
 *   sin clasificar (no sale en el tablero).
 * - `precios_clasificacion`: memoria de clasificaciones por descripción: un
 *   producto que ya se clasificó (en otra lista, otro corte u otro mayorista
 *   con la misma descripción) no vuelve a la IA. `origen = 'manual'` = lo
 *   corrigió una persona.
 * - `precios_macro`: el reporte mensual de oportunidades (vista 3), un JSON.
 */

let tablasListas: Promise<void> | null = null;
export function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS precios_cargas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mayorista VARCHAR(80) NOT NULL,
          fecha_corte DATE NOT NULL,
          fecha_lista DATE NULL,
          archivo VARCHAR(255) NOT NULL DEFAULT '',
          archivo_sha CHAR(64) NOT NULL DEFAULT '',
          ordenada TINYINT(1) NOT NULL DEFAULT 0,
          filas INT NOT NULL DEFAULT 0,
          estado VARCHAR(12) NOT NULL DEFAULT 'lista',
          resumen LONGTEXT NULL,
          creado_por VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_corte (fecha_corte, mayorista)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS precios_mercado (
          id INT AUTO_INCREMENT PRIMARY KEY,
          carga_id INT NOT NULL,
          codigo VARCHAR(120) NOT NULL DEFAULT '',
          marca VARCHAR(120) NOT NULL DEFAULT '',
          marca_lista TINYINT(1) NOT NULL DEFAULT 0,
          categoria VARCHAR(80) NOT NULL DEFAULT '',
          subcategoria VARCHAR(255) NOT NULL DEFAULT '',
          confianza DECIMAL(4,2) NOT NULL DEFAULT 0,
          observaciones VARCHAR(500) NOT NULL DEFAULT '',
          mayorista VARCHAR(80) NOT NULL,
          fecha DATE NOT NULL,
          pvp DECIMAL(14,2) NOT NULL,
          descripcion TEXT NULL,
          linea VARCHAR(120) NOT NULL DEFAULT '',
          clave CHAR(40) NOT NULL DEFAULT '',
          origen VARCHAR(10) NOT NULL DEFAULT '',
          pendiente TINYINT(1) NOT NULL DEFAULT 0,
          KEY idx_carga (carga_id),
          KEY idx_fecha (fecha),
          KEY idx_pendiente (pendiente)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS precios_clasificacion (
          clave CHAR(40) NOT NULL PRIMARY KEY,
          descripcion VARCHAR(500) NOT NULL DEFAULT '',
          marca VARCHAR(120) NOT NULL DEFAULT '',
          categoria VARCHAR(80) NOT NULL,
          subcategoria VARCHAR(255) NOT NULL,
          confianza DECIMAL(4,2) NOT NULL DEFAULT 0,
          observaciones VARCHAR(500) NOT NULL DEFAULT '',
          origen VARCHAR(10) NOT NULL DEFAULT 'ia',
          updated_by VARCHAR(190) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS precios_macro (
          id INT NOT NULL PRIMARY KEY,
          datos LONGTEXT NOT NULL,
          updated_by VARCHAR(190) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

export const nivelDeConfianza = (c: number) => (c >= 0.95 ? "Alto" : c >= 0.7 ? "Medio" : "Bajo");

/** Descripción sin el "[Código: 209237]" que el Excel de ejemplo agrega a algunas. */
export const descripcionBase = (d: string) =>
  String(d || "")
    .replace(/\s*\[(c[oó]digo|modelo)\s*:[^\]]*\]\s*$/i, "")
    .trim();

/** Llave de la memoria de clasificaciones: la descripción normalizada. */
export function claveDe(descripcion: string): string {
  const t = norm(descripcionBase(descripcion)).replace(/[^A-Z0-9."]+/g, " ").trim();
  return createHash("sha1").update(t).digest("hex");
}

const corta = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// ---------------------------------------------------------------------------
// Memoria de clasificaciones
// ---------------------------------------------------------------------------

export interface Clasificacion {
  marca: string;
  categoria: string;
  subcategoria: string;
  confianza: number;
  observaciones: string;
  origen: string;
}

export async function leerMemoria(claves: string[]): Promise<Map<string, Clasificacion>> {
  await ensureTablas();
  const mapa = new Map<string, Clasificacion>();
  const unicas = [...new Set(claves)];
  for (let i = 0; i < unicas.length; i += 1000) {
    const lote = unicas.slice(i, i + 1000);
    const [filas] = await db.query(
      "SELECT clave, marca, categoria, subcategoria, confianza, observaciones, origen FROM precios_clasificacion WHERE clave IN (?)",
      [lote],
    );
    for (const f of filas as any[]) {
      mapa.set(f.clave, {
        marca: f.marca,
        categoria: f.categoria,
        subcategoria: f.subcategoria,
        confianza: Number(f.confianza) || 0,
        observaciones: f.observaciones || "",
        origen: f.origen,
      });
    }
  }
  return mapa;
}

/** Guarda en la memoria (nunca pisa lo corregido a mano, salvo que lo nuevo también sea manual). */
export async function guardarMemoria(items: (Clasificacion & { clave: string; descripcion: string })[], usuario?: string) {
  await ensureTablas();
  for (let i = 0; i < items.length; i += 500) {
    const lote = items.slice(i, i + 500);
    if (!lote.length) continue;
    await db.query(
      `INSERT INTO precios_clasificacion (clave, descripcion, marca, categoria, subcategoria, confianza, observaciones, origen, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         marca = IF(origen = 'manual' AND VALUES(origen) <> 'manual', marca, VALUES(marca)),
         categoria = IF(origen = 'manual' AND VALUES(origen) <> 'manual', categoria, VALUES(categoria)),
         subcategoria = IF(origen = 'manual' AND VALUES(origen) <> 'manual', subcategoria, VALUES(subcategoria)),
         confianza = IF(origen = 'manual' AND VALUES(origen) <> 'manual', confianza, VALUES(confianza)),
         observaciones = IF(origen = 'manual' AND VALUES(origen) <> 'manual', observaciones, VALUES(observaciones)),
         updated_by = IF(origen = 'manual' AND VALUES(origen) <> 'manual', updated_by, VALUES(updated_by)),
         origen = IF(origen = 'manual' AND VALUES(origen) <> 'manual', origen, VALUES(origen))`,
      [
        lote.map((c) => [
          c.clave,
          corta(descripcionBase(c.descripcion), 500),
          corta(c.marca, 120),
          corta(c.categoria, 80),
          corta(c.subcategoria, 255),
          Math.min(1, Math.max(0, Math.round(c.confianza * 100) / 100)),
          corta(c.observaciones, 500),
          c.origen,
          usuario || null,
        ]),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Cargas y catálogo
// ---------------------------------------------------------------------------

export interface FilaMercado {
  codigo: string;
  marca: string;
  categoria: string;
  subcategoria: string;
  confianza: number;
  observaciones: string;
  mayorista: string;
  fecha: string;
  pvp: number;
  descripcion: string;
  linea?: string;
  /** La marca vino en la lista: la clasificación no la cambia. */
  marcaDeLista?: boolean;
  clave: string;
  origen: string;
  pendiente: boolean;
}

export interface Carga {
  id: number;
  mayorista: string;
  fecha_corte: string;
  fecha_lista: string | null;
  archivo: string;
  ordenada: boolean;
  filas: number;
  estado: "clasificando" | "lista" | "error";
  resumen: any;
  creado_por: string | null;
  created_at: string;
  pendientes?: number;
}

const fechaISO = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear(),
      m = v.getMonth() + 1,
      d = v.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
};

function filaCarga(f: any): Carga {
  let resumen: any = null;
  try {
    resumen = f.resumen ? JSON.parse(f.resumen) : null;
  } catch {
    resumen = null;
  }
  return {
    id: Number(f.id),
    mayorista: f.mayorista,
    fecha_corte: fechaISO(f.fecha_corte)!,
    fecha_lista: fechaISO(f.fecha_lista),
    archivo: f.archivo,
    ordenada: !!f.ordenada,
    filas: Number(f.filas) || 0,
    estado: f.estado,
    resumen,
    creado_por: f.creado_por,
    created_at: f.created_at instanceof Date ? f.created_at.toISOString() : String(f.created_at),
    pendientes: f.pendientes == null ? undefined : Number(f.pendientes),
  };
}

export async function listarCargas(): Promise<Carga[]> {
  await ensureTablas();
  const [filas] = await db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM precios_mercado m WHERE m.carga_id = c.id AND m.pendiente = 1) AS pendientes
     FROM precios_cargas c ORDER BY c.fecha_corte DESC, c.mayorista, c.id DESC`,
  );
  return (filas as any[]).map(filaCarga);
}

export async function leerCarga(id: number): Promise<Carga | null> {
  await ensureTablas();
  const [filas] = await db.query(
    `SELECT c.*, (SELECT COUNT(*) FROM precios_mercado m WHERE m.carga_id = c.id AND m.pendiente = 1) AS pendientes
     FROM precios_cargas c WHERE c.id = ?`,
    [id],
  );
  const f = (filas as any[])[0];
  return f ? filaCarga(f) : null;
}

/**
 * Crea una carga con sus filas. Si ya había una carga del mismo archivo
 * (misma huella) para el mismo mayorista y corte, la reemplaza: volver a
 * subir una lista no la duplica.
 */
export async function crearCarga(
  datos: {
    mayorista: string;
    fecha_corte: string;
    fecha_lista: string | null;
    archivo: string;
    archivo_sha: string;
    ordenada: boolean;
    estado: Carga["estado"];
    resumen: any;
    creado_por: string | null;
  },
  filas: FilaMercado[],
): Promise<{ id: number; reemplazo: boolean }> {
  await ensureTablas();
  const con = await db.getConnection();
  try {
    await con.beginTransaction();
    const [previas] = await con.query(
      "SELECT id FROM precios_cargas WHERE archivo_sha = ? AND mayorista = ? AND fecha_corte = ?",
      [datos.archivo_sha, datos.mayorista, datos.fecha_corte],
    );
    const ids = (previas as any[]).map((p) => p.id);
    if (ids.length) {
      await con.query("DELETE FROM precios_mercado WHERE carga_id IN (?)", [ids]);
      await con.query("DELETE FROM precios_cargas WHERE id IN (?)", [ids]);
    }
    const [r] = await con.query(
      `INSERT INTO precios_cargas (mayorista, fecha_corte, fecha_lista, archivo, archivo_sha, ordenada, filas, estado, resumen, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.mayorista,
        datos.fecha_corte,
        datos.fecha_lista,
        corta(datos.archivo, 255),
        datos.archivo_sha,
        datos.ordenada ? 1 : 0,
        filas.length,
        datos.estado,
        JSON.stringify(datos.resumen ?? {}),
        datos.creado_por,
      ],
    );
    const id = (r as any).insertId as number;
    for (let i = 0; i < filas.length; i += 1000) {
      const lote = filas.slice(i, i + 1000);
      await con.query(
        `INSERT INTO precios_mercado (carga_id, codigo, marca, marca_lista, categoria, subcategoria, confianza, observaciones, mayorista, fecha, pvp, descripcion, linea, clave, origen, pendiente)
         VALUES ?`,
        [
          lote.map((f) => [
            id,
            corta(f.codigo, 120),
            corta(f.marca, 120),
            f.marcaDeLista ? 1 : 0,
            corta(f.categoria, 80),
            corta(f.subcategoria, 255),
            Math.min(1, Math.max(0, Math.round((f.confianza || 0) * 100) / 100)),
            corta(f.observaciones, 500),
            corta(f.mayorista, 80),
            f.fecha,
            f.pvp,
            String(f.descripcion || "").slice(0, 2000),
            corta(f.linea, 120),
            f.clave,
            f.origen,
            f.pendiente ? 1 : 0,
          ]),
        ],
      );
    }
    await con.commit();
    return { id, reemplazo: ids.length > 0 };
  } catch (e) {
    await con.rollback();
    throw e;
  } finally {
    con.release();
  }
}

export async function borrarCarga(id: number): Promise<boolean> {
  await ensureTablas();
  await db.query("DELETE FROM precios_mercado WHERE carga_id = ?", [id]);
  const [r] = await db.query("DELETE FROM precios_cargas WHERE id = ?", [id]);
  return (r as any).affectedRows > 0;
}

export async function actualizarCarga(id: number, cambios: { estado?: Carga["estado"]; resumen?: any }) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (cambios.estado) {
    sets.push("estado = ?");
    vals.push(cambios.estado);
  }
  if (cambios.resumen !== undefined) {
    sets.push("resumen = ?");
    vals.push(JSON.stringify(cambios.resumen));
  }
  if (!sets.length) return;
  await db.query(`UPDATE precios_cargas SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
}

export interface Pendiente {
  id: number;
  codigo: string;
  marca: string;
  descripcion: string;
  linea: string;
  clave: string;
}

export async function pendientesDeCarga(cargaId: number): Promise<Pendiente[]> {
  const [filas] = await db.query(
    "SELECT id, codigo, marca, descripcion, linea, clave FROM precios_mercado WHERE carga_id = ? AND pendiente = 1 ORDER BY linea, descripcion",
    [cargaId],
  );
  return (filas as any[]).map((f) => ({
    id: Number(f.id),
    codigo: f.codigo,
    marca: f.marca,
    descripcion: f.descripcion || "",
    linea: f.linea || "",
    clave: f.clave,
  }));
}

/** Pone la clasificación en las filas (de cualquier carga) que esperan esa misma descripción. */
export async function aplicarClasificacion(items: (Clasificacion & { clave: string })[]) {
  for (const c of items) {
    await db.query(
      `UPDATE precios_mercado
         SET marca = IF(marca_lista = 1 AND marca <> '', marca, ?), categoria = ?, subcategoria = ?, confianza = ?, observaciones = ?, origen = ?, pendiente = 0
       WHERE clave = ? AND pendiente = 1`,
      [
        corta(c.marca, 120),
        corta(c.categoria, 80),
        corta(c.subcategoria, 255),
        Math.min(1, Math.max(0, Math.round(c.confianza * 100) / 100)),
        corta(c.observaciones, 500),
        c.origen,
        c.clave,
      ],
    );
  }
}

/** Todo el catálogo clasificado (lo que ve el tablero), o el de una carga / un corte. */
export async function leerMercado(filtro: { cargaId?: number; fecha?: string; incluirPendientes?: boolean } = {}): Promise<
  (FilaMercado & { carga_id: number })[]
> {
  await ensureTablas();
  const where: string[] = [];
  const vals: any[] = [];
  if (!filtro.incluirPendientes) where.push("pendiente = 0");
  if (filtro.cargaId) {
    where.push("carga_id = ?");
    vals.push(filtro.cargaId);
  }
  if (filtro.fecha) {
    where.push("fecha = ?");
    vals.push(filtro.fecha);
  }
  const [filas] = await db.query(
    `SELECT carga_id, codigo, marca, categoria, subcategoria, confianza, observaciones, mayorista, fecha, pvp, descripcion, linea, clave, origen, pendiente
     FROM precios_mercado ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id`,
    vals,
  );
  return (filas as any[]).map((f) => ({
    carga_id: Number(f.carga_id),
    codigo: f.codigo,
    marca: f.marca,
    categoria: f.categoria,
    subcategoria: f.subcategoria,
    confianza: Number(f.confianza) || 0,
    observaciones: f.observaciones || "",
    mayorista: f.mayorista,
    fecha: fechaISO(f.fecha)!,
    pvp: Number(f.pvp),
    descripcion: f.descripcion || "",
    linea: f.linea || "",
    clave: f.clave,
    origen: f.origen,
    pendiente: !!f.pendiente,
  }));
}

export async function marcasYMayoristas(): Promise<{ marcas: string[]; mayoristas: string[] }> {
  await ensureTablas();
  const [m] = await db.query("SELECT DISTINCT marca FROM precios_mercado WHERE marca <> ''");
  const [c] = await db.query("SELECT DISTINCT mayorista FROM precios_cargas");
  return { marcas: (m as any[]).map((x) => x.marca), mayoristas: (c as any[]).map((x) => x.mayorista) };
}

// ---------------------------------------------------------------------------
// Reporte mensual (vista 3)
// ---------------------------------------------------------------------------

export async function leerMacro(): Promise<any | null> {
  await ensureTablas();
  const [filas] = await db.query("SELECT datos FROM precios_macro WHERE id = 1");
  const f = (filas as any[])[0];
  if (!f) return null;
  try {
    return JSON.parse(f.datos);
  } catch {
    return null;
  }
}

export async function guardarMacro(datos: any, usuario?: string) {
  await ensureTablas();
  await db.query(
    "INSERT INTO precios_macro (id, datos, updated_by) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE datos = VALUES(datos), updated_by = VALUES(updated_by)",
    [JSON.stringify(datos), usuario || null],
  );
}
