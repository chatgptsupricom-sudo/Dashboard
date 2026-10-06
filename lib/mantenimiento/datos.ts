import { db } from "@/lib/db";
import type { Equipo, Estado, Orden, Prioridad, Tarea, TipoEquipo, TipoOrden } from "@/lib/mantenimiento/tipos";

/**
 * Datos del mantenimiento de unidades (lib/mantenimiento/tipos).
 *
 * Dos tablas que se crean solas: `mantenimiento_equipos` (camiones y
 * montacargas de la sede) y `mantenimiento_ordenes` (cada trabajo, con sus
 * tareas en JSON). El DDL de referencia está en sql/mantenimiento_unidades.sql.
 *
 * Los camiones salen del catálogo de Unidades (`seguridad_catalogo_unidades`,
 * las placas que ya usa el despacho): al listar, toda placa que todavía no
 * esté aquí se agrega como camión. Los montacargas no tienen placa y se dan de
 * alta en esta sección.
 */

let tablasListas = false;
export async function asegurarTablas() {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mantenimiento_equipos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cids INT NULL,
      tipo ENUM('camion','montacargas') NOT NULL DEFAULT 'camion',
      codigo VARCHAR(50) NOT NULL,
      descripcion VARCHAR(200) NULL,
      medidor INT NULL,
      proximo_servicio DATE NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(200) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_mant_equipos_cids (cids, activo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mantenimiento_ordenes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      equipo_id INT NOT NULL,
      cids INT NULL,
      tipo ENUM('preventivo','correctivo') NOT NULL,
      prioridad ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
      titulo VARCHAR(200) NOT NULL,
      detalle TEXT NULL,
      estado ENUM('reportado','en_taller','listo','cerrado') NOT NULL DEFAULT 'reportado',
      medidor INT NULL,
      tareas_json TEXT NULL,
      responsable VARCHAR(200) NULL,
      costo DECIMAL(12,2) NULL,
      notas_cierre TEXT NULL,
      reportado_por VARCHAR(200) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      iniciado_por VARCHAR(200) NULL,
      iniciado_at DATETIME NULL,
      terminado_por VARCHAR(200) NULL,
      terminado_at DATETIME NULL,
      cerrado_por VARCHAR(200) NULL,
      cerrado_at DATETIME NULL,
      KEY idx_mant_ordenes_equipo (equipo_id, estado),
      KEY idx_mant_ordenes_cids (cids, estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablasListas = true;
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

/** Columna DATE → "YYYY-MM-DD", sin pasar por la zona horaria del servidor. */
const soloFecha = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};

function leerTareas(json: unknown): Tarea[] {
  try {
    const lista = JSON.parse(String(json || "[]"));
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((t) => t && typeof t.texto === "string" && t.texto.trim())
      .map((t) => ({ texto: String(t.texto), hecha: t.hecha === true, por: t.por || null, at: t.at || null }));
  } catch {
    return [];
  }
}

function aOrden(f: any): Orden {
  return {
    id: Number(f.id),
    equipo_id: Number(f.equipo_id),
    tipo: f.tipo as TipoOrden,
    prioridad: f.prioridad as Prioridad,
    titulo: f.titulo,
    detalle: f.detalle || null,
    estado: f.estado as Estado,
    medidor: f.medidor === null || f.medidor === undefined ? null : Number(f.medidor),
    tareas: leerTareas(f.tareas_json),
    responsable: f.responsable || null,
    costo: f.costo === null || f.costo === undefined ? null : Number(f.costo),
    notas_cierre: f.notas_cierre || null,
    reportado_por: f.reportado_por || null,
    created_at: iso(f.created_at) || "",
    iniciado_por: f.iniciado_por || null,
    iniciado_at: iso(f.iniciado_at),
    terminado_por: f.terminado_por || null,
    terminado_at: iso(f.terminado_at),
    cerrado_por: f.cerrado_por || null,
    cerrado_at: iso(f.cerrado_at),
    ...(f.equipo_codigo ? { equipo_codigo: f.equipo_codigo, equipo_tipo: f.equipo_tipo as TipoEquipo } : {}),
  };
}

const deSede = (cids: number | null, alias = "") =>
  cids !== null ? { sql: `${alias}cids = ?`, valores: [cids] as unknown[] } : { sql: "1 = 1", valores: [] as unknown[] };

/**
 * Las placas del catálogo de Unidades que todavía no están como equipo pasan
 * a ser camiones. Si el catálogo no existe (una base sin el módulo), no hay
 * nada que traer.
 */
async function traerCamionesDelCatalogo(cids: number | null) {
  const sede = deSede(cids, "u.");
  try {
    await db.execute(
      `INSERT INTO mantenimiento_equipos (cids, tipo, codigo, descripcion, created_by)
       SELECT u.cids, 'camion', u.placa, u.descripcion, 'Catálogo de Unidades'
         FROM seguridad_catalogo_unidades u
        WHERE ${sede.sql}
          AND NOT EXISTS (
            SELECT 1 FROM mantenimiento_equipos e
             WHERE CONVERT(e.codigo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                 = CONVERT(u.placa USING utf8mb4) COLLATE utf8mb4_unicode_ci
               AND e.cids <=> u.cids
          )`,
      sede.valores as any[],
    );
  } catch (e: any) {
    // Sin el catálogo (o si no se puede leer) la sección sigue con los equipos
    // que ya tiene: no traer camiones nuevos no es motivo para no abrir.
    if (e?.code !== "ER_NO_SUCH_TABLE") {
      console.error("[mantenimiento] no se pudieron traer los camiones del catálogo de Unidades:", e?.message || e);
    }
  }
}

/** Equipos de la sede con su orden abierta, y las últimas órdenes cerradas. */
export async function listar(cids: number | null): Promise<{ equipos: Equipo[]; historial: Orden[] }> {
  await asegurarTablas();
  await traerCamionesDelCatalogo(cids);

  const sede = deSede(cids);
  const [equipos] = await db.execute(
    `SELECT id, tipo, codigo, descripcion, medidor, proximo_servicio
       FROM mantenimiento_equipos
      WHERE activo = 1 AND ${sede.sql}
      ORDER BY tipo ASC, codigo ASC`,
    sede.valores as any[],
  );
  const [abiertas] = await db.execute(
    `SELECT * FROM mantenimiento_ordenes WHERE estado <> 'cerrado' AND ${sede.sql} ORDER BY id ASC`,
    sede.valores as any[],
  );
  const sedeO = deSede(cids, "o.");
  const [cerradas] = await db.execute(
    `SELECT o.*, e.codigo AS equipo_codigo, e.tipo AS equipo_tipo
       FROM mantenimiento_ordenes o
       JOIN mantenimiento_equipos e ON e.id = o.equipo_id
      WHERE o.estado = 'cerrado' AND ${sedeO.sql}
      ORDER BY o.cerrado_at DESC, o.id DESC
      LIMIT 60`,
    sedeO.valores as any[],
  );

  const porEquipo = new Map<number, Orden>();
  for (const f of abiertas as any[]) porEquipo.set(Number(f.equipo_id), aOrden(f));

  return {
    equipos: (equipos as any[]).map((f) => ({
      id: Number(f.id),
      tipo: f.tipo as TipoEquipo,
      codigo: f.codigo,
      descripcion: f.descripcion || null,
      medidor: f.medidor === null || f.medidor === undefined ? null : Number(f.medidor),
      proximo_servicio: soloFecha(f.proximo_servicio),
      orden: porEquipo.get(Number(f.id)) || null,
    })),
    historial: (cerradas as any[]).map(aOrden),
  };
}

export async function crearEquipo(d: {
  cids: number;
  tipo: TipoEquipo;
  codigo: string;
  descripcion: string | null;
  medidor: number | null;
  quien: string;
}): Promise<"ok" | "repetido"> {
  await asegurarTablas();
  const [ya] = await db.execute(
    "SELECT id FROM mantenimiento_equipos WHERE codigo = ? AND cids = ? AND activo = 1 LIMIT 1",
    [d.codigo, d.cids],
  );
  if ((ya as any[]).length > 0) return "repetido";
  await db.execute(
    `INSERT INTO mantenimiento_equipos (cids, tipo, codigo, descripcion, medidor, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [d.cids, d.tipo, d.codigo, d.descripcion, d.medidor, d.quien],
  );
  return "ok";
}

/** El equipo, si es de la sede. */
export async function equipoDeSede(id: number, cids: number): Promise<{ id: number; tipo: TipoEquipo } | null> {
  await asegurarTablas();
  const [filas] = await db.execute(
    "SELECT id, tipo FROM mantenimiento_equipos WHERE id = ? AND cids = ? AND activo = 1 LIMIT 1",
    [id, cids],
  );
  const f = (filas as any[])[0];
  return f ? { id: Number(f.id), tipo: f.tipo as TipoEquipo } : null;
}

export async function crearOrden(d: {
  cids: number;
  equipoId: number;
  tipo: TipoOrden;
  prioridad: Prioridad;
  titulo: string;
  detalle: string | null;
  medidor: number | null;
  tareas: Tarea[];
  quien: string;
}): Promise<"ok" | "ya_tiene"> {
  // Una orden abierta por equipo: se revisa y se inserta en una sola sentencia,
  // para que dos personas reportando a la vez no dejen dos.
  const [res] = await db.execute(
    `INSERT INTO mantenimiento_ordenes
       (equipo_id, cids, tipo, prioridad, titulo, detalle, medidor, tareas_json, reportado_por)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM mantenimiento_ordenes WHERE equipo_id = ? AND estado <> 'cerrado'
      )`,
    [d.equipoId, d.cids, d.tipo, d.prioridad, d.titulo, d.detalle, d.medidor, JSON.stringify(d.tareas), d.quien, d.equipoId],
  );
  return Number((res as any)?.affectedRows || 0) === 1 ? "ok" : "ya_tiene";
}

/** La orden, si es de la sede. */
export async function ordenDeSede(id: number, cids: number): Promise<Orden | null> {
  await asegurarTablas();
  const [filas] = await db.execute("SELECT * FROM mantenimiento_ordenes WHERE id = ? AND cids = ? LIMIT 1", [id, cids]);
  const f = (filas as any[])[0];
  return f ? aOrden(f) : null;
}

/**
 * Cambia la orden solo si sigue en el estado esperado: si otra persona ya la
 * movió, devuelve false y la pantalla se refresca con lo que hay.
 */
export async function actualizarOrden(id: number, desde: Estado, set: string, valores: unknown[]): Promise<boolean> {
  const [res] = await db.execute(`UPDATE mantenimiento_ordenes SET ${set} WHERE id = ? AND estado = ?`, [
    ...valores,
    id,
    desde,
  ] as any[]);
  return Number((res as any)?.affectedRows || 0) === 1;
}

/** Al cerrar: el equipo queda con el medidor del trabajo y la fecha del próximo servicio. */
export async function actualizarEquipoAlCerrar(equipoId: number, medidor: number | null, proximo: string | null) {
  await db.execute(
    `UPDATE mantenimiento_equipos
        SET medidor = COALESCE(?, medidor), proximo_servicio = ?
      WHERE id = ?`,
    [medidor, proximo, equipoId],
  );
}
