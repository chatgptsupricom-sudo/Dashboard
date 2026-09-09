import { query } from "@/lib/db";

/**
 * Rutas de despacho interno y agencias de envío para la entrega de un RMA
 * reparado (issue #120). Viven en MySQL, no como constantes en código,
 * porque operaciones necesita poder agregar/editar ciudades y agencias sin
 * depender de un deploy.
 *
 * Mismo patrón de auto-migración que `ensurePortalColumns` en
 * app/api/servicio-tecnico/ticket/route.ts: las tablas y el seed inicial se
 * crean solas la primera vez que algo de este módulo las necesita, no hace
 * falta correr un script a mano. `sql/rma_rutas_envio.sql` documenta el
 * mismo schema por si alguien quiere aplicarlo manualmente.
 */

let schemaListo: Promise<void> | null = null;

export function ensureRutasEnvioSchema(): Promise<void> {
  if (!schemaListo) {
    schemaListo = crearSchema().catch((e) => {
      console.error("[rma/rutasEnvio] ensureRutasEnvioSchema:", e?.message);
      schemaListo = null; // reintentar en la proxima llamada
      throw e;
    });
  }
  return schemaListo;
}

async function crearSchema(): Promise<void> {
  await query(
    `ALTER TABLE rma_cases ADD COLUMN client_email VARCHAR(200) DEFAULT NULL`,
  ).catch((e: any) => {
    if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) throw e;
  });

  await query(`
    CREATE TABLE IF NOT EXISTS rma_rutas_despacho (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rma_rutas_ciudades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ruta_id INT NOT NULL,
      ciudad VARCHAR(100) NOT NULL,
      estado VARCHAR(100) DEFAULT NULL,
      -- Variantes de escritura para el mismo lugar, separadas por "|"
      -- (ej. "Pto Cabello|Pto. Cabello"). El match ya ignora
      -- mayúsculas/acentos por su cuenta -- esto es solo para abreviaturas
      -- o nombres alternos genuinamente distintos.
      alias VARCHAR(300) DEFAULT NULL,
      INDEX idx_ruta (ruta_id),
      FOREIGN KEY (ruta_id) REFERENCES rma_rutas_despacho(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rma_agencias_envio (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await sembrarSiVacio();
}

// Datos que dio operaciones (8/sep/2026): 4 rutas con sus ciudades, y las
// agencias con las que se trabaja hoy. Solo se insertan la primera vez --
// si alguien ya edito estas tablas a mano, no las pisamos.
async function sembrarSiVacio(): Promise<void> {
  const { rows: rutasExistentes } = await query(`SELECT COUNT(*) AS n FROM rma_rutas_despacho`);
  if (Number((rutasExistentes as any[])[0]?.n || 0) === 0) {
    const RUTAS: { nombre: string; ciudades: { ciudad: string; estado: string; alias?: string }[] }[] = [
      {
        nombre: "Barquisimeto / Cabudare",
        ciudades: [
          { ciudad: "Puerto Cabello", estado: "Carabobo", alias: "Pto Cabello|Pto. Cabello" },
          { ciudad: "San Felipe", estado: "Yaracuy" },
          { ciudad: "Barquisimeto", estado: "Lara" },
          { ciudad: "Cabudare", estado: "Lara" },
        ],
      },
      {
        nombre: "Caracas",
        ciudades: [
          { ciudad: "Caracas", estado: "Distrito Capital" },
          { ciudad: "Los Altos Mirandinos", estado: "Miranda", alias: "Altos Mirandinos" },
          { ciudad: "Charallave", estado: "Miranda" },
          { ciudad: "Guatire", estado: "Miranda" },
        ],
      },
      {
        nombre: "Aragua",
        ciudades: [
          { ciudad: "Maracay", estado: "Aragua" },
          { ciudad: "Turmero", estado: "Aragua" },
          { ciudad: "La Victoria", estado: "Aragua" },
          { ciudad: "San Mateo", estado: "Aragua" },
          { ciudad: "Cagua", estado: "Aragua" },
        ],
      },
      {
        nombre: "Valencia",
        ciudades: [
          { ciudad: "Valencia", estado: "Carabobo" },
          { ciudad: "Los Guayos", estado: "Carabobo" },
          { ciudad: "San Diego", estado: "Carabobo" },
          { ciudad: "Naguanagua", estado: "Carabobo" },
          { ciudad: "Guacara", estado: "Carabobo" },
          { ciudad: "Güigüe", estado: "Carabobo" },
        ],
      },
    ];

    for (const ruta of RUTAS) {
      const { rows } = await query(
        `INSERT INTO rma_rutas_despacho (nombre) VALUES (?)`,
        [ruta.nombre],
      );
      const rutaId = (rows as any).insertId;
      for (const c of ruta.ciudades) {
        await query(
          `INSERT INTO rma_rutas_ciudades (ruta_id, ciudad, estado, alias) VALUES (?, ?, ?, ?)`,
          [rutaId, c.ciudad, c.estado, c.alias || null],
        );
      }
    }
  }

  const { rows: agenciasExistentes } = await query(`SELECT COUNT(*) AS n FROM rma_agencias_envio`);
  if (Number((agenciasExistentes as any[])[0]?.n || 0) === 0) {
    for (const nombre of ["MRW", "Zoom", "Tealca", "Domesa"]) {
      await query(`INSERT INTO rma_agencias_envio (nombre) VALUES (?)`, [nombre]);
    }
  }
}

/** minúsculas, sin acentos, sin espacios de sobra -- para comparar tolerando variantes de escritura. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type Ruta = { id: number; nombre: string };
export type Agencia = { id: number; nombre: string };

/**
 * Busca la ruta que cubre una ciudad dada, tolerando mayúsculas/acentos y
 * las variantes registradas en `alias`. Ciudad vacía o sin match -> null
 * (la opción "Enviar por ruta" no se ofrece en ese caso, ver issue #123).
 */
export async function matchCiudadARuta(ciudadInput: string): Promise<Ruta | null> {
  const buscado = normalizar(ciudadInput || "");
  if (!buscado) return null;

  await ensureRutasEnvioSchema();

  const { rows } = await query(`
    SELECT rd.id, rd.nombre, rc.ciudad, rc.alias
    FROM rma_rutas_ciudades rc
    JOIN rma_rutas_despacho rd ON rd.id = rc.ruta_id
    WHERE rd.activo = 1
  `);

  for (const r of rows as any[]) {
    const candidatos = [r.ciudad, ...(r.alias ? String(r.alias).split("|") : [])];
    if (candidatos.some((c) => normalizar(c) === buscado)) {
      return { id: r.id, nombre: r.nombre };
    }
  }
  return null;
}

export async function listarRutas(): Promise<Ruta[]> {
  await ensureRutasEnvioSchema();
  const { rows } = await query(`SELECT id, nombre FROM rma_rutas_despacho WHERE activo = 1 ORDER BY nombre`);
  return rows as Ruta[];
}

export async function listarAgenciasActivas(): Promise<Agencia[]> {
  await ensureRutasEnvioSchema();
  const { rows } = await query(`SELECT id, nombre FROM rma_agencias_envio WHERE activo = 1 ORDER BY nombre`);
  return rows as Agencia[];
}
