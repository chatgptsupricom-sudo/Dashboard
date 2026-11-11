import { db } from "@/lib/db";
import { enlaceValido, rolLector, tipoManual, type TipoManual } from "@/lib/manuales/permisos";

/**
 * Manuales de procedimiento (sección "Manuales" del panel).
 *
 * Cada manual sigue el formato de procedimiento: código, versión, objetivo,
 * alcance, responsables, definiciones, pasos (con capturas) y control de
 * cambios. El rol Procesos los escribe y ve todos; cada rol lee los
 * publicados que tienen su rol en `roles` (menú "Manual" / "Tutorial").
 *
 * `tipo`: "manual" = el procedimiento (qué hace el rol y con qué reglas);
 * "tutorial" = recorrido por las pantallas del panel del rol, un paso por
 * pantalla con su `enlace`. El contenido base de cada rol está en
 * lib/manuales/semillas/ y Procesos lo carga desde la pantalla (borrador).
 * Las tablas y columnas se crean solas; las imágenes van en MySQL (LONGBLOB),
 * como product_images y los adjuntos de RMA.
 */

export type Paso = {
  titulo: string;
  responsable: string;
  descripcion: string;
  imagenes: number[];
  nota: string;
  /** Pantalla del panel a la que lleva el paso, sin idioma ("/vendedores/leads"). Opcional. */
  enlace?: string;
};

export type Contenido = {
  objetivo: string;
  alcance: string;
  responsables: { rol: string; responsabilidad: string }[];
  definiciones: { termino: string; definicion: string }[];
  pasos: Paso[];
  documentos: string;
  cambios: { version: string; fecha: string; descripcion: string }[];
};

export type Manual = {
  id: number;
  codigo: string;
  titulo: string;
  area: string;
  version: string;
  tipo: TipoManual;
  roles: string[];
  publicado: boolean;
  contenido: Contenido;
  updatedBy: string | null;
  updatedAt: string | null;
};


export const CONTENIDO_VACIO: Contenido = {
  objetivo: "",
  alcance: "",
  responsables: [],
  definiciones: [],
  pasos: [],
  documentos: "",
  cambios: [],
};

let tablasListas = false;
async function ensureTablas() {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS manuales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(40) NOT NULL DEFAULT '',
      titulo VARCHAR(200) NOT NULL,
      area VARCHAR(80) NOT NULL DEFAULT '',
      version VARCHAR(20) NOT NULL DEFAULT '1.0',
      roles JSON NOT NULL,
      publicado TINYINT(1) NOT NULL DEFAULT 0,
      contenido JSON NOT NULL,
      updated_by VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS manuales_imagenes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      manual_id INT NOT NULL,
      mime VARCHAR(50) NOT NULL,
      data LONGBLOB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (manual_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [cols] = await db.execute("SHOW COLUMNS FROM manuales LIKE 'tipo'");
  if (!(cols as any[]).length)
    await db.execute("ALTER TABLE manuales ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'manual' AFTER version");
  tablasListas = true;
}

const json = <T>(v: unknown, def: T): T => {
  if (v == null) return def;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return def;
    }
  }
  return v as T;
};

const aManual = (f: any): Manual => ({
  id: f.id,
  codigo: f.codigo || "",
  titulo: f.titulo,
  area: f.area || "",
  version: f.version || "",
  tipo: tipoManual(f.tipo),
  roles: json<string[]>(f.roles, []),
  publicado: Boolean(f.publicado),
  contenido: { ...CONTENIDO_VACIO, ...json<Partial<Contenido>>(f.contenido, {}) },
  updatedBy: f.updated_by ?? null,
  updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
});

export type ResumenManual = Omit<Manual, "contenido">;

export async function listarManuales(): Promise<ResumenManual[]> {
  await ensureTablas();
  const [filas] = await db.execute(
    "SELECT id, codigo, titulo, area, version, tipo, roles, publicado, updated_by, updated_at FROM manuales ORDER BY area, codigo, titulo",
  );
  return (filas as any[]).map((f) => {
    const { contenido: _, ...m } = aManual(f);
    return m;
  });
}

/** Códigos ya usados (para saber qué contenido base falta cargar). */
export async function codigosUsados(): Promise<Set<string>> {
  await ensureTablas();
  const [filas] = await db.execute("SELECT codigo FROM manuales WHERE codigo <> ''");
  return new Set((filas as any[]).map((f) => String(f.codigo).trim().toUpperCase()));
}

export async function obtenerManual(id: number): Promise<Manual | null> {
  await ensureTablas();
  const [filas] = await db.execute("SELECT * FROM manuales WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  return f ? aManual(f) : null;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const ids = (v: unknown) =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20) : [];
const lista = <T>(v: unknown, max: number, map: (x: any) => T) =>
  Array.isArray(v) ? v.slice(0, max).map((x) => map(x ?? {})) : [];

/** Limpia lo que manda el editor: tipos, largos y cantidades máximas. */
export function limpiarManual(b: any) {
  const c = b?.contenido ?? {};
  return {
    codigo: texto(b?.codigo, 40),
    titulo: texto(b?.titulo, 200),
    area: texto(b?.area, 80),
    version: texto(b?.version, 20) || "1.0",
    tipo: tipoManual(b?.tipo),
    roles: [...new Set(lista(b?.roles, 50, (r) => rolLector(r)).filter((r) => r && r !== "procesos"))],
    publicado: Boolean(b?.publicado),
    contenido: {
      objetivo: texto(c.objetivo, 5000),
      alcance: texto(c.alcance, 5000),
      responsables: lista(c.responsables, 30, (r) => ({
        rol: texto(r.rol, 120),
        responsabilidad: texto(r.responsabilidad, 2000),
      })),
      definiciones: lista(c.definiciones, 60, (d) => ({
        termino: texto(d.termino, 120),
        definicion: texto(d.definicion, 2000),
      })),
      pasos: lista(c.pasos, 120, (p) => ({
        titulo: texto(p.titulo, 200),
        responsable: texto(p.responsable, 120),
        descripcion: texto(p.descripcion, 10000),
        imagenes: ids(p.imagenes),
        nota: texto(p.nota, 2000),
        enlace: enlaceValido(p.enlace),
      })),
      documentos: texto(c.documentos, 5000),
      cambios: lista(c.cambios, 60, (x) => ({
        version: texto(x.version, 20),
        fecha: texto(x.fecha, 10),
        descripcion: texto(x.descripcion, 2000),
      })),
    } satisfies Contenido,
  };
}

export async function guardarManual(id: number | null, b: any, por: string): Promise<number> {
  await ensureTablas();
  const m = limpiarManual(b);
  if (!m.titulo) throw new Error("El manual necesita un título.");
  const valores = [m.codigo, m.titulo, m.area, m.version, m.tipo, JSON.stringify(m.roles), m.publicado ? 1 : 0, JSON.stringify(m.contenido), por];
  if (id) {
    await db.execute(
      "UPDATE manuales SET codigo=?, titulo=?, area=?, version=?, tipo=?, roles=?, publicado=?, contenido=?, updated_by=? WHERE id=?",
      [...valores, id],
    );
    return id;
  }
  const [r] = await db.execute(
    "INSERT INTO manuales (codigo, titulo, area, version, tipo, roles, publicado, contenido, updated_by) VALUES (?,?,?,?,?,?,?,?,?)",
    valores,
  );
  return (r as any).insertId;
}

export async function borrarManual(id: number) {
  await ensureTablas();
  await db.execute("DELETE FROM manuales_imagenes WHERE manual_id = ?", [id]);
  await db.execute("DELETE FROM manuales WHERE id = ?", [id]);
}

export const MIMES_IMAGEN = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_IMAGEN = 4 * 1024 * 1024;

export async function guardarImagen(manualId: number, mime: string, data: Buffer): Promise<number> {
  await ensureTablas();
  const [r] = await db.execute("INSERT INTO manuales_imagenes (manual_id, mime, data) VALUES (?,?,?)", [
    manualId,
    mime,
    data,
  ]);
  return (r as any).insertId;
}

export async function obtenerImagen(id: number) {
  await ensureTablas();
  const [filas] = await db.execute("SELECT manual_id, mime, data FROM manuales_imagenes WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  return f ? { manualId: Number(f.manual_id), mime: String(f.mime), data: f.data as Buffer } : null;
}
