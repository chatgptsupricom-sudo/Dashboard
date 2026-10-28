import { db, query } from "@/lib/db";
import { ACTIVIDADES, type Actividad, type EstadoTrabajo, type Origen } from "@/lib/inteligencia-negocio/clasificacion/tipos";

/**
 * Lo que la Clasificación guarda en la MySQL del panel (se crea solo):
 *
 * - `bi_clasificacion_productos`: categoría, nombre corto, confianza y
 *   observaciones de cada producto de Odoo (`product_id`).
 * - `bi_clasificacion_clientes`: Instagram del cliente (Odoo no lo tiene),
 *   actividad comercial, lo que vende en redes y confianza (`partner_id`,
 *   el partner comercial).
 *
 * `origen = 'manual'` = lo corrigió una persona: la IA no lo vuelve a tocar.
 */

let tablasListas: Promise<void> | null = null;
function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS bi_clasificacion_productos (
          product_id INT NOT NULL PRIMARY KEY,
          nombre_odoo VARCHAR(300) NOT NULL DEFAULT '',
          categoria VARCHAR(80) NOT NULL,
          subcategoria VARCHAR(200) NOT NULL,
          confianza DECIMAL(4,2) NOT NULL DEFAULT 0,
          observaciones TEXT NULL,
          origen VARCHAR(10) NOT NULL DEFAULT 'ia',
          updated_by VARCHAR(190) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS bi_clasificacion_clientes (
          partner_id INT NOT NULL PRIMARY KEY,
          instagram VARCHAR(60) NOT NULL DEFAULT '',
          actividad VARCHAR(80) NULL,
          detalle TEXT NULL,
          vende_en_redes TEXT NULL,
          confianza DECIMAL(4,2) NULL,
          origen VARCHAR(10) NULL,
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

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const confianza = (v: unknown) => Math.min(1, Math.max(0, Math.round((Number(v) || 0) * 100) / 100));

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export interface FilaClasificacionProducto {
  categoria: string;
  subcategoria: string;
  confianza: number;
  observaciones: string;
  origen: Origen;
}

export async function leerClasificacionProductos(): Promise<Map<number, FilaClasificacionProducto>> {
  await ensureTablas();
  const [filas] = await db.execute(
    "SELECT product_id, categoria, subcategoria, confianza, observaciones, origen FROM bi_clasificacion_productos",
  );
  const mapa = new Map<number, FilaClasificacionProducto>();
  for (const f of filas as any[]) {
    mapa.set(Number(f.product_id), {
      categoria: f.categoria,
      subcategoria: f.subcategoria,
      confianza: Number(f.confianza) || 0,
      observaciones: f.observaciones || "",
      origen: f.origen === "manual" ? "manual" : "ia",
    });
  }
  return mapa;
}

/** Lo que devuelve la IA. Nunca pisa una corrección manual. */
export async function guardarProductosIA(
  filas: { id: number; nombre: string; categoria: string; subcategoria: string; confianza: number; observaciones: string }[],
): Promise<void> {
  if (filas.length === 0) return;
  await ensureTablas();
  await db.execute(
    `INSERT INTO bi_clasificacion_productos (product_id, nombre_odoo, categoria, subcategoria, confianza, observaciones, origen, updated_by)
     VALUES ${filas.map(() => "(?, ?, ?, ?, ?, ?, 'ia', 'IA')").join(", ")}
     ON DUPLICATE KEY UPDATE
       nombre_odoo = IF(origen = 'manual', nombre_odoo, VALUES(nombre_odoo)),
       categoria = IF(origen = 'manual', categoria, VALUES(categoria)),
       subcategoria = IF(origen = 'manual', subcategoria, VALUES(subcategoria)),
       confianza = IF(origen = 'manual', confianza, VALUES(confianza)),
       observaciones = IF(origen = 'manual', observaciones, VALUES(observaciones)),
       updated_by = IF(origen = 'manual', updated_by, VALUES(updated_by))`,
    filas.flatMap((f) => [
      f.id,
      texto(f.nombre, 300),
      texto(f.categoria, 80).toUpperCase(),
      texto(f.subcategoria, 200),
      confianza(f.confianza),
      texto(f.observaciones, 2000),
    ]),
  );
}

/** Corrección de una persona: queda con confianza 100 % y la IA ya no la cambia. */
export async function corregirProducto(
  id: number,
  datos: { categoria?: unknown; subcategoria?: unknown; observaciones?: unknown },
  usuario: string,
): Promise<void> {
  const categoria = texto(datos.categoria, 80).toUpperCase();
  const subcategoria = texto(datos.subcategoria, 200);
  if (!categoria || !subcategoria) throw new ErrorDatos("Categoría y nombre corto son obligatorios");
  await ensureTablas();
  await query(
    `INSERT INTO bi_clasificacion_productos (product_id, categoria, subcategoria, confianza, observaciones, origen, updated_by)
     VALUES (?, ?, ?, 1, ?, 'manual', ?)
     ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), subcategoria = VALUES(subcategoria), confianza = 1,
       observaciones = VALUES(observaciones), origen = 'manual', updated_by = VALUES(updated_by)`,
    [id, categoria, subcategoria, texto(datos.observaciones, 2000), texto(usuario, 190)],
  );
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface FilaClasificacionCliente {
  instagram: string;
  actividad: Actividad | null;
  detalle: string;
  vendeEnRedes: string;
  confianza: number | null;
  origen: Origen | null;
}

const actividadValida = (v: unknown): Actividad | null =>
  (ACTIVIDADES as readonly string[]).includes(String(v)) ? (String(v) as Actividad) : null;

export async function leerClasificacionClientes(): Promise<Map<number, FilaClasificacionCliente>> {
  await ensureTablas();
  const [filas] = await db.execute(
    "SELECT partner_id, instagram, actividad, detalle, vende_en_redes, confianza, origen FROM bi_clasificacion_clientes",
  );
  const mapa = new Map<number, FilaClasificacionCliente>();
  for (const f of filas as any[]) {
    mapa.set(Number(f.partner_id), {
      instagram: f.instagram || "",
      actividad: actividadValida(f.actividad),
      detalle: f.detalle || "",
      vendeEnRedes: f.vende_en_redes || "",
      confianza: f.confianza === null ? null : Number(f.confianza),
      origen: f.origen === "manual" ? "manual" : f.origen === "ia" ? "ia" : null,
    });
  }
  return mapa;
}

export async function guardarClienteIA(
  id: number,
  datos: { actividad: string; detalle: string; vendeEnRedes: string; confianza: number },
): Promise<void> {
  const actividad = actividadValida(datos.actividad) ?? "Otro";
  await ensureTablas();
  await db.execute(
    `INSERT INTO bi_clasificacion_clientes (partner_id, actividad, detalle, vende_en_redes, confianza, origen, updated_by)
     VALUES (?, ?, ?, ?, ?, 'ia', 'IA')
     ON DUPLICATE KEY UPDATE
       actividad = IF(origen = 'manual', actividad, VALUES(actividad)),
       detalle = IF(origen = 'manual', detalle, VALUES(detalle)),
       vende_en_redes = VALUES(vende_en_redes),
       confianza = IF(origen = 'manual', confianza, VALUES(confianza)),
       origen = IF(origen = 'manual', 'manual', 'ia'),
       updated_by = IF(origen = 'manual', updated_by, 'IA')`,
    [id, actividad, texto(datos.detalle, 2000), texto(datos.vendeEnRedes, 2000), confianza(datos.confianza)],
  );
}

/**
 * Cambios de una persona. El Instagram se guarda solo (no cambia la
 * clasificación); poner la actividad la deja como manual (confianza 100 %),
 * y `actividad: ""` la devuelve a la IA.
 */
export async function editarCliente(
  id: number,
  datos: { instagram?: string; actividad?: unknown; detalle?: unknown },
  usuario: string,
): Promise<void> {
  await ensureTablas();
  const quien = texto(usuario, 190);
  if (datos.instagram !== undefined) {
    await query(
      `INSERT INTO bi_clasificacion_clientes (partner_id, instagram, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE instagram = VALUES(instagram), updated_by = VALUES(updated_by)`,
      [id, datos.instagram, quien],
    );
  }
  if (datos.actividad !== undefined) {
    if (datos.actividad === "") {
      await query(
        "UPDATE bi_clasificacion_clientes SET actividad = NULL, detalle = NULL, confianza = NULL, origen = NULL, updated_by = ? WHERE partner_id = ?",
        [quien, id],
      );
      return;
    }
    const actividad = actividadValida(datos.actividad);
    if (!actividad) throw new ErrorDatos("Actividad inválida");
    await query(
      `INSERT INTO bi_clasificacion_clientes (partner_id, actividad, detalle, confianza, origen, updated_by)
       VALUES (?, ?, ?, 1, 'manual', ?)
       ON DUPLICATE KEY UPDATE actividad = VALUES(actividad), detalle = VALUES(detalle), confianza = 1,
         origen = 'manual', updated_by = VALUES(updated_by)`,
      [id, actividad, texto(datos.detalle, 2000), quien],
    );
  }
}

export class ErrorDatos extends Error {}

// ---------------------------------------------------------------------------
// Trabajos en segundo plano
// ---------------------------------------------------------------------------

/**
 * Una clasificación con IA de cientos de productos o clientes tarda minutos:
 * corre en el proceso del servidor y la pantalla consulta el avance. Uno a
 * la vez por tipo.
 */
export function crearTrabajo() {
  const estado: EstadoTrabajo = { corriendo: false, total: 0, hechos: 0, errores: 0, inicio: null, fin: null, mensaje: "" };
  return {
    estado: () => ({ ...estado }),
    /** Procesa `items` en lotes, `paralelo` lotes a la vez. false = ya había uno corriendo. */
    iniciar<T>(items: T[], tamLote: number, paralelo: number, procesar: (lote: T[]) => Promise<void>): boolean {
      if (estado.corriendo) return false;
      Object.assign(estado, {
        corriendo: true,
        total: items.length,
        hechos: 0,
        errores: 0,
        inicio: new Date().toISOString(),
        fin: null,
        mensaje: "",
      });
      const lotes: T[][] = [];
      for (let i = 0; i < items.length; i += tamLote) lotes.push(items.slice(i, i + tamLote));
      let siguiente = 0;
      const trabajador = async () => {
        while (siguiente < lotes.length) {
          const lote = lotes[siguiente++];
          try {
            await procesar(lote);
          } catch (e: any) {
            estado.errores += lote.length;
            estado.mensaje = e?.message || "Error de la IA";
            console.error("[bi-clasificacion]", estado.mensaje);
          }
          estado.hechos += lote.length;
        }
      };
      void Promise.all(Array.from({ length: Math.min(paralelo, lotes.length) }, trabajador)).finally(() => {
        estado.corriendo = false;
        estado.fin = new Date().toISOString();
      });
      return true;
    },
  };
}
