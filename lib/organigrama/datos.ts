import { db } from "@/lib/db";
import {
  FRECUENCIAS,
  descendientes,
  hijosPorPadre,
  type Actividad,
  type Disposicion,
  type Frecuencia,
  type Nodo,
  type TipoNodo,
} from "@/lib/organigrama/tipos";
import { ORGANIGRAMA_INICIAL, type Semilla } from "@/lib/organigrama/inicial";

/**
 * Organigrama de la empresa (sección "Organigrama", SuperAdmin y Procesos).
 *
 * Cada recuadro es una fila de `organigrama_nodos` que cuelga de su superior
 * (`parent_id`, null = cabeza). Las actividades del cargo van como JSON en la
 * misma fila. La tabla se crea sola; DDL de referencia en sql/organigrama.sql.
 * Arranca vacía: la pantalla ofrece cargar el organigrama de oct-2026
 * (`ORGANIGRAMA_INICIAL`) o empezar en blanco.
 */

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS organigrama_nodos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      parent_id INT NULL,
      orden INT NOT NULL DEFAULT 0,
      tipo VARCHAR(20) NOT NULL DEFAULT 'cargo',
      staff TINYINT(1) NOT NULL DEFAULT 0,
      disposicion VARCHAR(12) NOT NULL DEFAULT 'columna',
      area VARCHAR(80) NOT NULL DEFAULT '',
      cargo VARCHAR(150) NOT NULL,
      nota VARCHAR(150) NOT NULL DEFAULT '',
      personas JSON NOT NULL,
      proposito TEXT NULL,
      actividades JSON NOT NULL,
      updated_by VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (parent_id)
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

const TIPOS: TipoNodo[] = ["direccion", "area", "cargo"];
const tipoDe = (v: unknown): TipoNodo => (TIPOS.includes(v as TipoNodo) ? (v as TipoNodo) : "cargo");
const disposicionDe = (v: unknown): Disposicion => (v === "fila" ? "fila" : "columna");
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

const aNodo = (f: any): Nodo => ({
  id: Number(f.id),
  parentId: f.parent_id == null ? null : Number(f.parent_id),
  orden: Number(f.orden) || 0,
  tipo: tipoDe(f.tipo),
  staff: Boolean(f.staff),
  disposicion: disposicionDe(f.disposicion),
  area: f.area || "",
  cargo: f.cargo || "",
  nota: f.nota || "",
  personas: json<string[]>(f.personas, []),
  proposito: f.proposito || "",
  actividades: json<Actividad[]>(f.actividades, []),
  updatedBy: f.updated_by ?? null,
  updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
});

export async function listarNodos(): Promise<Nodo[]> {
  await ensureTabla();
  const [filas] = await db.execute("SELECT * FROM organigrama_nodos ORDER BY parent_id, orden, id");
  return (filas as any[]).map(aNodo);
}

async function obtenerNodo(id: number): Promise<Nodo | null> {
  await ensureTabla();
  const [filas] = await db.execute("SELECT * FROM organigrama_nodos WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  return f ? aNodo(f) : null;
}

const limpiarPersonas = (v: unknown) =>
  Array.isArray(v) ? v.map((p) => texto(p, 120)).filter(Boolean).slice(0, 60) : [];

const limpiarActividades = (v: unknown): Actividad[] =>
  Array.isArray(v)
    ? v.slice(0, 200).flatMap((a: any, i) => {
        const t = texto(a?.texto, 2000);
        if (!t) return [];
        const f = FRECUENCIAS.includes(a?.frecuencia) ? (a.frecuencia as Frecuencia) : "";
        const id = texto(a?.id, 40).replace(/[^\w-]/g, "") || `a${Date.now().toString(36)}${i}`;
        return [{ id, texto: t, frecuencia: f, detalle: texto(a?.detalle, 4000) }];
      })
    : [];

/** Reescribe el `orden` de una lista de hermanos (0, 10, 20…) en el orden dado. */
async function reordenar(ids: number[]) {
  for (let i = 0; i < ids.length; i++)
    await db.execute("UPDATE organigrama_nodos SET orden = ? WHERE id = ?", [i * 10, ids[i]]);
}

async function hermanos(parentId: number | null): Promise<Nodo[]> {
  const nodos = await listarNodos();
  return hijosPorPadre(nodos).get(parentId) || [];
}

export async function crearNodo(b: any, por: string): Promise<number> {
  await ensureTabla();
  const parentId = b?.parentId == null ? null : Number(b.parentId);
  if (parentId != null && !(await obtenerNodo(parentId))) throw new Error("El superior no existe.");
  const cargo = texto(b?.cargo, 150) || "Nuevo cargo";
  const lista = await hermanos(parentId);
  const orden = lista.length ? Math.max(...lista.map((n) => n.orden)) + 10 : 0;
  const [r] = await db.execute(
    `INSERT INTO organigrama_nodos
       (parent_id, orden, tipo, staff, disposicion, area, cargo, nota, personas, proposito, actividades, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      parentId,
      orden,
      tipoDe(b?.tipo),
      b?.staff ? 1 : 0,
      disposicionDe(b?.disposicion),
      texto(b?.area, 80),
      cargo,
      texto(b?.nota, 150),
      JSON.stringify(limpiarPersonas(b?.personas)),
      texto(b?.proposito, 5000),
      JSON.stringify(limpiarActividades(b?.actividades)),
      por,
    ],
  );
  const id = (r as any).insertId as number;

  // "Agregar superior": el nuevo cargo ocupa el lugar de `encimaDe` y este
  // pasa a colgar de él.
  const encimaDe = b?.encimaDe == null ? null : Number(b.encimaDe);
  if (encimaDe) {
    const debajo = await obtenerNodo(encimaDe);
    if (debajo && debajo.parentId === parentId) {
      await db.execute("UPDATE organigrama_nodos SET orden = ? WHERE id = ?", [debajo.orden, id]);
      await db.execute("UPDATE organigrama_nodos SET parent_id = ?, orden = 0, staff = 0 WHERE id = ?", [id, encimaDe]);
    }
  }
  return id;
}

/** Cambia solo los campos que vengan en `b`. */
export async function actualizarNodo(id: number, b: any, por: string): Promise<void> {
  await ensureTabla();
  const nodo = await obtenerNodo(id);
  if (!nodo) throw new Error("Cargo no encontrado.");
  const sets: string[] = [];
  const vals: any[] = [];
  const poner = (col: string, v: any) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };

  if ("cargo" in b) {
    const cargo = texto(b.cargo, 150);
    if (!cargo) throw new Error("El cargo necesita un nombre.");
    poner("cargo", cargo);
  }
  if ("area" in b) poner("area", texto(b.area, 80));
  if ("nota" in b) poner("nota", texto(b.nota, 150));
  if ("tipo" in b) poner("tipo", tipoDe(b.tipo));
  if ("staff" in b) poner("staff", b.staff ? 1 : 0);
  if ("disposicion" in b) poner("disposicion", disposicionDe(b.disposicion));
  if ("personas" in b) poner("personas", JSON.stringify(limpiarPersonas(b.personas)));
  if ("proposito" in b) poner("proposito", texto(b.proposito, 5000));
  if ("actividades" in b) poner("actividades", JSON.stringify(limpiarActividades(b.actividades)));

  // Cambio de superior: no puede quedar debajo de sí mismo ni de un subordinado.
  let nuevoPadre: number | null | undefined;
  if ("parentId" in b) {
    nuevoPadre = b.parentId == null || b.parentId === "" ? null : Number(b.parentId);
    if (nuevoPadre !== nodo.parentId) {
      if (nuevoPadre != null) {
        const nodos = await listarNodos();
        if (!nodos.some((n) => n.id === nuevoPadre)) throw new Error("El superior no existe.");
        if (descendientes(nodos, id).has(nuevoPadre))
          throw new Error("Un cargo no puede reportar a sí mismo ni a uno de sus subordinados.");
      }
      const lista = await hermanos(nuevoPadre);
      poner("parent_id", nuevoPadre);
      poner("orden", lista.length ? Math.max(...lista.map((n) => n.orden)) + 10 : 0);
    }
  }

  if (!sets.length && !b?.mover) return;
  if (sets.length) {
    poner("updated_by", por);
    await db.execute(`UPDATE organigrama_nodos SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  }

  // Mover entre hermanos: -1 = antes (izquierda/arriba), 1 = después.
  const mover = Number(b?.mover);
  if (mover === -1 || mover === 1) {
    const actual = await obtenerNodo(id);
    const lista = await hermanos(actual!.parentId);
    const i = lista.findIndex((n) => n.id === id);
    const j = i + mover;
    if (i >= 0 && j >= 0 && j < lista.length) {
      [lista[i], lista[j]] = [lista[j], lista[i]];
      await reordenar(lista.map((n) => n.id));
    }
  }
}

/** Borra el cargo; sus subordinados suben a su superior, en el lugar que él ocupaba. */
export async function borrarNodo(id: number): Promise<void> {
  await ensureTabla();
  const nodo = await obtenerNodo(id);
  if (!nodo) return;
  const nodos = await listarNodos();
  const mapa = hijosPorPadre(nodos);
  const hijos = mapa.get(id) || [];
  const lista = mapa.get(nodo.parentId) || [];
  const i = lista.findIndex((n) => n.id === id);
  const nuevos = [...lista.slice(0, i), ...hijos, ...lista.slice(i + 1)].map((n) => n.id);
  if (hijos.length)
    await db.execute(
      `UPDATE organigrama_nodos SET parent_id = ? WHERE id IN (${hijos.map(() => "?").join(",")})`,
      [nodo.parentId, ...hijos.map((h) => h.id)],
    );
  await db.execute("DELETE FROM organigrama_nodos WHERE id = ?", [id]);
  await reordenar(nuevos);
}

/** Carga `ORGANIGRAMA_INICIAL`. Solo con la tabla vacía, para no duplicar nada. */
export async function cargarOrganigramaInicial(por: string): Promise<boolean> {
  await ensureTabla();
  const [filas] = await db.execute("SELECT COUNT(*) AS n FROM organigrama_nodos");
  if (Number((filas as any[])[0]?.n) > 0) return false;
  const insertar = async (s: Semilla, parentId: number | null, orden: number) => {
    const id = await crearNodo({ ...s, parentId }, por);
    await db.execute("UPDATE organigrama_nodos SET orden = ? WHERE id = ?", [orden, id]);
    for (const [i, h] of (s.hijos || []).entries()) await insertar(h, id, i * 10);
  };
  await insertar(ORGANIGRAMA_INICIAL, null, 0);
  return true;
}
