import { db } from "@/lib/db";
import {
  ejemploReclutamiento,
  META_VACIA,
  type Conexion,
  type Flujograma,
  type Meta,
  type Paso,
  type TipoPaso,
} from "@/lib/flujogramas/tipos";

/**
 * Flujogramas de procesos (sección /flujogramas). Cada flujograma es una fila:
 * encabezado (proceso, subproceso, código, versión, elaborado/revisado/
 * aprobado) y el dibujo completo en JSON (pasos con su posición y
 * conexiones). Se guarda entero de una vez. La tabla se crea sola.
 */

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS flujogramas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proceso VARCHAR(200) NOT NULL DEFAULT '',
      subproceso VARCHAR(200) NOT NULL DEFAULT '',
      meta JSON NOT NULL,
      pasos JSON NOT NULL,
      conexiones JSON NOT NULL,
      updated_by VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
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

const aFlujograma = (f: any): Flujograma => ({
  id: f.id,
  proceso: f.proceso || "",
  subproceso: f.subproceso || "",
  meta: { ...META_VACIA, ...json<Partial<Meta>>(f.meta, {}) },
  pasos: json<Paso[]>(f.pasos, []),
  conexiones: json<Conexion[]>(f.conexiones, []),
  updatedBy: f.updated_by ?? null,
  updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
});

export async function listarFlujogramas() {
  await ensureTabla();
  const [filas] = await db.execute(
    "SELECT id, proceso, subproceso, meta, JSON_LENGTH(pasos) AS n_pasos, updated_by, updated_at FROM flujogramas ORDER BY proceso, subproceso",
  );
  return (filas as any[]).map((f) => {
    const { pasos: _, conexiones: __, ...resto } = aFlujograma(f);
    return { ...resto, nPasos: Number(f.n_pasos) || 0 };
  });
}

export async function obtenerFlujograma(id: number): Promise<Flujograma | null> {
  await ensureTabla();
  const [filas] = await db.execute("SELECT * FROM flujogramas WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  return f ? aFlujograma(f) : null;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const coord = (v: unknown) => Math.max(0, Math.min(20_000, Math.round(Number(v) || 0)));
const TIPOS: TipoPaso[] = ["terminal", "actividad", "decision"];
const idValido = (v: unknown) => texto(v, 40).replace(/[^\w-]/g, "");

/** Limpia lo que manda la pantalla: tipos, largos, cantidades y conexiones a pasos que existen. */
export function limpiar(b: any) {
  const pasos: Paso[] = (Array.isArray(b?.pasos) ? b.pasos : []).slice(0, 300).flatMap((p: any) => {
    const id = idValido(p?.id);
    if (!id) return [];
    const tipo = TIPOS.includes(p?.tipo) ? p.tipo : "actividad";
    return [{ id, tipo, texto: texto(p?.texto, 500), x: coord(p?.x), y: coord(p?.y) }];
  });
  const ids = new Set(pasos.map((p) => p.id));
  const conexiones: Conexion[] = (Array.isArray(b?.conexiones) ? b.conexiones : []).slice(0, 600).flatMap((c: any) => {
    const desde = idValido(c?.desde);
    const hasta = idValido(c?.hasta);
    if (!ids.has(desde) || !ids.has(hasta) || desde === hasta) return [];
    return [{ id: idValido(c?.id) || `${desde}-${hasta}`, desde, hasta, etiqueta: texto(c?.etiqueta, 30) }];
  });
  const m = b?.meta ?? {};
  const meta = Object.fromEntries(Object.keys(META_VACIA).map((k) => [k, texto(m[k], 120)])) as Meta;
  return { proceso: texto(b?.proceso, 200), subproceso: texto(b?.subproceso, 200), meta, pasos, conexiones };
}

export async function guardarFlujograma(id: number | null, b: any, por: string): Promise<number> {
  await ensureTabla();
  const f = limpiar(b);
  if (!f.proceso && !f.subproceso) throw new Error("Ponle nombre al proceso o al subproceso.");
  const valores = [f.proceso, f.subproceso, JSON.stringify(f.meta), JSON.stringify(f.pasos), JSON.stringify(f.conexiones), por];
  if (id) {
    await db.execute(
      "UPDATE flujogramas SET proceso=?, subproceso=?, meta=?, pasos=?, conexiones=?, updated_by=? WHERE id=?",
      [...valores, id],
    );
    return id;
  }
  const [r] = await db.execute(
    "INSERT INTO flujogramas (proceso, subproceso, meta, pasos, conexiones, updated_by) VALUES (?,?,?,?,?,?)",
    valores,
  );
  return (r as any).insertId;
}

/** Nuevo flujograma: vacío (solo Inicio y Fin) o el ejemplo de RRHH. */
export async function crearFlujograma(b: any, por: string): Promise<number> {
  if (b?.ejemplo) return guardarFlujograma(null, ejemploReclutamiento(), por);
  return guardarFlujograma(
    null,
    {
      proceso: b?.proceso || "Nuevo proceso",
      subproceso: b?.subproceso || "",
      pasos: [
        { id: "inicio", tipo: "terminal", texto: "INICIO", x: 40, y: 20 },
        { id: "fin", tipo: "terminal", texto: "FIN", x: 40, y: 200 },
      ],
      conexiones: [{ id: "k0", desde: "inicio", hasta: "fin", etiqueta: "" }],
    },
    por,
  );
}

export async function borrarFlujograma(id: number) {
  await ensureTabla();
  await db.execute("DELETE FROM flujogramas WHERE id = ?", [id]);
}
