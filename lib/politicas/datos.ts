import { db } from "@/lib/db";
import {
  ESTADOS_POLITICA,
  ROLES_LEEN_POLITICAS,
  SEDES_POLITICA,
  TIPOS_POLITICA,
  type EstadoPolitica,
  type TipoPolitica,
  puedeEditarPoliticas,
} from "@/lib/politicas/permisos";

/**
 * Políticas y Acuerdos (sección /politicas): reglas internas, acuerdos o
 * formatos que firma el cliente (ej. la carta de autorización de envío) y
 * circulares. Publican Procesos y el SuperAdmin; los roles administrativos
 * (ROLES_LEEN_POLITICAS) leen las que no son borrador, de su sede o de todas,
 * y marcan "Leído y entendido". El acuse es por versión: al subir la versión
 * todos tienen que volver a leerla. Las tablas se crean solas; los adjuntos
 * van en MySQL (LONGBLOB), como las imágenes de Manuales.
 */

export type Adjunto = { id: number; nombre: string; mime: string; tamano: number };

export type Politica = {
  id: number;
  tipo: TipoPolitica;
  titulo: string;
  categoria: string;
  sede: number;
  version: string;
  estado: EstadoPolitica;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  responsable: string;
  resumen: string;
  contenido: string;
  requiereAcuse: boolean;
  adjuntos: Adjunto[];
  updatedBy: string | null;
  updatedAt: string | null;
  /** Fecha en que quien consulta marcó leída la versión actual, o null. */
  leidaEl: string | null;
};

/** Quién consulta: lo que sale del JWT. */
export type Lector = { email: string; name?: string; role: string; cids?: unknown };

let tablasListas = false;
async function ensureTablas() {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS politicas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL DEFAULT 'politica',
      titulo VARCHAR(200) NOT NULL,
      categoria VARCHAR(80) NOT NULL DEFAULT '',
      sede INT NOT NULL DEFAULT 0,
      version VARCHAR(20) NOT NULL DEFAULT '1.0',
      estado VARCHAR(20) NOT NULL DEFAULT 'borrador',
      vigencia_desde DATE NULL,
      vigencia_hasta DATE NULL,
      responsable VARCHAR(200) NOT NULL DEFAULT '',
      resumen TEXT NOT NULL,
      contenido MEDIUMTEXT NOT NULL,
      requiere_acuse TINYINT(1) NOT NULL DEFAULT 1,
      updated_by VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS politicas_adjuntos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      politica_id INT NOT NULL,
      nombre VARCHAR(200) NOT NULL,
      mime VARCHAR(120) NOT NULL,
      tamano INT NOT NULL,
      data LONGBLOB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (politica_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS politicas_acuses (
      politica_id INT NOT NULL,
      version VARCHAR(20) NOT NULL,
      email VARCHAR(190) NOT NULL,
      nombre VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (politica_id, version, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablasListas = true;
}

const correo = (v: unknown) => String(v ?? "").toLowerCase().trim();
const fecha = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

/** Sede del lector, o null si no tiene una (ve todas). */
const sedeDe = (l: Lector) => {
  const n = Number(l.cids);
  return Number.isInteger(n) && n in SEDES_POLITICA && n !== 0 ? n : null;
};

/** Los editores ven todo; los lectores, lo publicado de su sede o de todas. */
function filtroLector(l: Lector): { where: string; params: (string | number)[] } {
  if (puedeEditarPoliticas(l.role)) return { where: "1=1", params: [] };
  const sede = sedeDe(l);
  return sede == null
    ? { where: "p.estado <> 'borrador'", params: [] }
    : { where: "p.estado <> 'borrador' AND p.sede IN (0, ?)", params: [sede] };
}

const aPolitica = (f: any, adjuntos: Adjunto[]): Politica => ({
  id: f.id,
  tipo: f.tipo in TIPOS_POLITICA ? f.tipo : "politica",
  titulo: f.titulo,
  categoria: f.categoria || "",
  sede: Number(f.sede) || 0,
  version: f.version || "",
  estado: f.estado in ESTADOS_POLITICA ? f.estado : "borrador",
  vigenciaDesde: fecha(f.vigencia_desde),
  vigenciaHasta: fecha(f.vigencia_hasta),
  responsable: f.responsable || "",
  resumen: f.resumen || "",
  contenido: f.contenido || "",
  requiereAcuse: Boolean(f.requiere_acuse),
  adjuntos,
  updatedBy: f.updated_by ?? null,
  updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
  leidaEl: f.leida_el ? new Date(f.leida_el).toISOString() : null,
});

async function adjuntosDe(ids: number[]): Promise<Map<number, Adjunto[]>> {
  const mapa = new Map<number, Adjunto[]>();
  if (!ids.length) return mapa;
  const [filas] = await db.execute(
    `SELECT id, politica_id, nombre, mime, tamano FROM politicas_adjuntos
     WHERE politica_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
    ids,
  );
  for (const f of filas as any[]) {
    const pid = Number(f.politica_id);
    mapa.set(pid, [...(mapa.get(pid) || []), { id: f.id, nombre: f.nombre, mime: f.mime, tamano: Number(f.tamano) }]);
  }
  return mapa;
}

/**
 * Lo que el lector puede ver, con el texto completo para que el buscador
 * busque también dentro del contenido.
 * shortcut: trae todo el texto en la lista; si pasan de unos cientos, buscar en el servidor.
 */
export async function listarPoliticas(l: Lector, id?: number): Promise<Politica[]> {
  await ensureTablas();
  const { where, params } = filtroLector(l);
  const [filas] = await db.execute(
    `SELECT p.*, a.created_at AS leida_el FROM politicas p
     LEFT JOIN politicas_acuses a ON a.politica_id = p.id AND a.version = p.version AND a.email = ?
     WHERE ${where}${id ? " AND p.id = ?" : ""}
     ORDER BY p.categoria, p.titulo`,
    [correo(l.email), ...params, ...(id ? [id] : [])],
  );
  const lista = filas as any[];
  const adjuntos = await adjuntosDe(lista.map((f) => Number(f.id)));
  return lista.map((f) => aPolitica(f, adjuntos.get(Number(f.id)) || []));
}

export async function obtenerPolitica(l: Lector, id: number): Promise<Politica | null> {
  return (await listarPoliticas(l, id))[0] ?? null;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const fechaValida = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

/** Limpia lo que manda el editor: tipos, largos y valores permitidos. */
export function limpiarPolitica(b: any) {
  const sede = Number(b?.sede);
  return {
    tipo: (b?.tipo in TIPOS_POLITICA ? b.tipo : "politica") as TipoPolitica,
    titulo: texto(b?.titulo, 200),
    categoria: texto(b?.categoria, 80),
    sede: sede in SEDES_POLITICA ? sede : 0,
    version: texto(b?.version, 20) || "1.0",
    estado: (b?.estado in ESTADOS_POLITICA ? b.estado : "borrador") as EstadoPolitica,
    vigenciaDesde: fechaValida(b?.vigenciaDesde),
    vigenciaHasta: fechaValida(b?.vigenciaHasta),
    responsable: texto(b?.responsable, 200),
    resumen: texto(b?.resumen, 3000),
    contenido: texto(b?.contenido, 200000),
    requiereAcuse: b?.requiereAcuse !== false,
  };
}

export async function guardarPolitica(id: number | null, b: any, por: string): Promise<number> {
  await ensureTablas();
  const p = limpiarPolitica(b);
  if (!p.titulo) throw new Error("La política necesita un título.");
  if (p.vigenciaDesde && p.vigenciaHasta && p.vigenciaHasta < p.vigenciaDesde)
    throw new Error("La vigencia termina antes de empezar.");
  const valores = [
    p.tipo, p.titulo, p.categoria, p.sede, p.version, p.estado, p.vigenciaDesde, p.vigenciaHasta,
    p.responsable, p.resumen, p.contenido, p.requiereAcuse ? 1 : 0, por,
  ];
  if (id) {
    await db.execute(
      `UPDATE politicas SET tipo=?, titulo=?, categoria=?, sede=?, version=?, estado=?, vigencia_desde=?,
       vigencia_hasta=?, responsable=?, resumen=?, contenido=?, requiere_acuse=?, updated_by=? WHERE id=?`,
      [...valores, id],
    );
    return id;
  }
  const [r] = await db.execute(
    `INSERT INTO politicas (tipo, titulo, categoria, sede, version, estado, vigencia_desde, vigencia_hasta,
     responsable, resumen, contenido, requiere_acuse, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    valores,
  );
  return (r as any).insertId;
}

export async function borrarPolitica(id: number) {
  await ensureTablas();
  await db.execute("DELETE FROM politicas_adjuntos WHERE politica_id = ?", [id]);
  await db.execute("DELETE FROM politicas_acuses WHERE politica_id = ?", [id]);
  await db.execute("DELETE FROM politicas WHERE id = ?", [id]);
}

/** "Leído y entendido" de la versión actual. Idempotente. */
export async function marcarLeida(l: Lector, p: Politica) {
  await ensureTablas();
  await db.execute(
    "INSERT IGNORE INTO politicas_acuses (politica_id, version, email, nombre) VALUES (?,?,?,?)",
    [p.id, p.version, correo(l.email), texto(l.name, 200)],
  );
}

/**
 * Quién leyó la versión actual y quién falta: los usuarios de los roles
 * lectores de la sede de la política (o de todas si es de todas las sedes;
 * los usuarios sin sede cuentan siempre).
 */
export async function acusesDe(p: Politica) {
  await ensureTablas();
  const [leyeron] = await db.execute(
    "SELECT email, nombre, created_at FROM politicas_acuses WHERE politica_id = ? AND version = ? ORDER BY created_at",
    [p.id, p.version],
  );
  const roles = ROLES_LEEN_POLITICAS;
  const [usuarios] = await db.execute(
    `SELECT uc.email, uc.name, r.name AS rol, uc.cids FROM users_config uc JOIN roles r ON r.id = uc.role_id
     WHERE LOWER(TRIM(r.name)) IN (${roles.map(() => "?").join(",")})
     ${p.sede ? "AND (uc.cids = ? OR uc.cids IS NULL OR uc.cids = '')" : ""}
     ORDER BY r.name, uc.name`,
    [...roles, ...(p.sede ? [p.sede] : [])],
  );
  const ya = new Set((leyeron as any[]).map((f) => correo(f.email)));
  return {
    leyeron: (leyeron as any[]).map((f) => ({
      email: correo(f.email),
      nombre: String(f.nombre || ""),
      fecha: new Date(f.created_at).toISOString(),
    })),
    pendientes: (usuarios as any[])
      .filter((u) => u.email && !ya.has(correo(u.email)))
      .map((u) => ({ email: correo(u.email), nombre: String(u.name || ""), rol: String(u.rol || "") })),
  };
}

// Adjuntos: el tipo sale de la extensión, no de lo que diga el navegador.
export const EXTENSIONES_ADJUNTO: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
export const MAX_ADJUNTO = 10 * 1024 * 1024;

export async function guardarAdjunto(politicaId: number, nombre: string, mime: string, data: Buffer): Promise<number> {
  await ensureTablas();
  const [r] = await db.execute(
    "INSERT INTO politicas_adjuntos (politica_id, nombre, mime, tamano, data) VALUES (?,?,?,?,?)",
    [politicaId, texto(nombre, 200), mime, data.length, data],
  );
  return (r as any).insertId;
}

export async function obtenerAdjunto(id: number) {
  await ensureTablas();
  const [filas] = await db.execute("SELECT politica_id, nombre, mime, data FROM politicas_adjuntos WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  return f ? { politicaId: Number(f.politica_id), nombre: String(f.nombre), mime: String(f.mime), data: f.data as Buffer } : null;
}

export async function borrarAdjunto(id: number) {
  await ensureTablas();
  await db.execute("DELETE FROM politicas_adjuntos WHERE id = ?", [id]);
}
