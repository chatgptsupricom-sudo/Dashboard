import { db, query } from "@/lib/db";
import { PASOS, type PasoNC } from "@/lib/notas-credito/tipos";

/**
 * Tablas del flujo de notas de crédito. Se crean solas (DDL de referencia en
 * sql/notas_credito_flujo.sql):
 *   nc_solicitudes   una fila por nota de crédito, de RMA o directa, con cada
 *                    decisión y el enlace a la NC de Odoo.
 *   nc_eventos       el historial de cada una (quién hizo qué y cuándo).
 *   nc_aprobadores   responsables de cada paso por sede, por correo.
 */

let tablasListas = false;
export async function ensureTablas(): Promise<void> {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS nc_solicitudes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      origen VARCHAR(10) NOT NULL,
      rma_nota_id INT NULL,
      case_id INT NULL,
      item_id INT NULL,
      case_number VARCHAR(50) NULL,
      producto VARCHAR(500) NULL,
      serial VARCHAR(200) NULL,
      estado VARCHAR(20) NOT NULL,
      estado_rma_previo VARCHAR(30) NULL,
      factura_id INT NULL,
      factura_nombre VARCHAR(100) NULL,
      partner_id INT NULL,
      cliente VARCHAR(255) NULL,
      moneda VARCHAR(10) NULL,
      monto DECIMAL(14,2) NULL,
      total_factura DECIMAL(14,2) NULL,
      odoo_product_id INT NULL,
      motivo TEXT NOT NULL,
      creado_por VARCHAR(190) NULL,
      creado_email VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      preaprobado_por VARCHAR(190) NULL,
      preaprobado_at DATETIME NULL,
      aprobado_por VARCHAR(190) NULL,
      aprobado_at DATETIME NULL,
      rechazado_por VARCHAR(190) NULL,
      rechazado_at DATETIME NULL,
      rechazado_paso VARCHAR(20) NULL,
      motivo_rechazo TEXT NULL,
      odoo_move_id INT NULL,
      odoo_move_nombre VARCHAR(100) NULL,
      odoo_estado VARCHAR(20) NULL,
      odoo_total DECIMAL(14,2) NULL,
      odoo_bloqueo DATETIME NULL,
      procesado_por VARCHAR(190) NULL,
      procesado_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_nc_rma_nota (rma_nota_id),
      KEY idx_nc_estado (company_id, estado),
      KEY idx_nc_factura (factura_id),
      KEY idx_nc_move (odoo_move_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS nc_eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      solicitud_id INT NOT NULL,
      accion VARCHAR(40) NOT NULL,
      por VARCHAR(190) NULL,
      email VARCHAR(190) NULL,
      nota TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_nc_eventos (solicitud_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS nc_aprobadores (
      company_id INT NOT NULL,
      paso VARCHAR(20) NOT NULL,
      email VARCHAR(190) NOT NULL,
      updated_by VARCHAR(190) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, paso, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablasListas = true;
}

export const normCorreo = (c: unknown) => String(c ?? "").toLowerCase().trim();
export const esSuperadmin = (rol: unknown) => String(rol ?? "").toLowerCase().trim() === "superadmin";

/**
 * Responsables con los que arranca una sede mientras el SuperAdmin no guarde
 * otros en la pantalla (sus logins de Odoo, que son los del panel).
 */
const INICIALES: Record<number, Record<PasoNC, string[]>> = {
  9: {
    preaprueba: ["rangel.hernandez@supricom.com.ve"],
    aprueba: ["gabriel.camacho@supricom.com"],
    procesa: ["contador.vln@supricom.com.ve"],
  },
};

export type Aprobadores = Record<number, Record<PasoNC, string[]>>;

// Caché de 30 s por proceso; guardarAprobadores la borra al momento.
let cache: { valor: Aprobadores; hasta: number } | null = null;

/** Responsables por sede y paso. Una sede sin filas guardadas usa INICIALES. */
export async function aprobadores(): Promise<Aprobadores> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  await ensureTablas();
  const r = await query(`SELECT company_id, paso, email FROM nc_aprobadores`);
  const guardados: Aprobadores = {};
  for (const f of r.rows as any[]) {
    const sede = Number(f.company_id);
    if (!PASOS.includes(f.paso)) continue;
    guardados[sede] ??= { preaprueba: [], aprueba: [], procesa: [] };
    guardados[sede][f.paso as PasoNC].push(normCorreo(f.email));
  }
  const valor: Aprobadores = {};
  for (const sede of new Set([...Object.keys(INICIALES), ...Object.keys(guardados)].map(Number))) {
    valor[sede] = guardados[sede] ?? {
      preaprueba: [...(INICIALES[sede]?.preaprueba ?? [])],
      aprueba: [...(INICIALES[sede]?.aprueba ?? [])],
      procesa: [...(INICIALES[sede]?.procesa ?? [])],
    };
  }
  cache = { valor, hasta: Date.now() + 30_000 };
  return valor;
}

/**
 * Reemplaza los responsables de una sede. Se guardan los tres pasos juntos:
 * así una sede que ya se guardó nunca vuelve a INICIALES por quedar un paso
 * vacío. Cada paso necesita al menos un correo.
 */
export async function guardarAprobadores(companyId: number, pasos: Record<PasoNC, string[]>, por: string): Promise<void> {
  await ensureTablas();
  const limpios = Object.fromEntries(
    PASOS.map((p) => [p, [...new Set((pasos[p] ?? []).map(normCorreo).filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)))]]),
  ) as Record<PasoNC, string[]>;
  for (const p of PASOS) {
    if (!limpios[p].length) throw new Error(`Falta al menos un correo válido en "${p}".`);
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM nc_aprobadores WHERE company_id = ?`, [companyId]);
    for (const p of PASOS) {
      for (const email of limpios[p]) {
        await conn.execute(
          `INSERT INTO nc_aprobadores (company_id, paso, email, updated_by) VALUES (?, ?, ?, ?)`,
          [companyId, p, email, por],
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
    cache = null;
  }
}

/**
 * Deja guardados en nc_aprobadores los responsables iniciales de la sede si
 * todavía no tiene ninguno: n8n lee los destinatarios de esa tabla (lib/notas-credito/aviso.ts)
 * y no conoce INICIALES.
 */
export async function asegurarAprobadoresGuardados(companyId: number): Promise<void> {
  const iniciales = INICIALES[companyId];
  if (!iniciales) return;
  await ensureTablas();
  const r = await query(`SELECT COUNT(*) AS n FROM nc_aprobadores WHERE company_id = ?`, [companyId]);
  if (Number((r.rows as any[])[0]?.n)) return;
  for (const p of PASOS) {
    for (const email of iniciales[p]) {
      await query(
        `INSERT IGNORE INTO nc_aprobadores (company_id, paso, email, updated_by) VALUES (?, ?, ?, 'iniciales')`,
        [companyId, p, email],
      );
    }
  }
  cache = null;
}

/** Pasos que tiene un correo en cada sede: { 9: ["preaprueba"] }. */
export async function pasosDe(email: unknown): Promise<Record<number, PasoNC[]>> {
  const correo = normCorreo(email);
  const out: Record<number, PasoNC[]> = {};
  if (!correo) return out;
  for (const [sede, pasos] of Object.entries(await aprobadores())) {
    const suyos = PASOS.filter((p) => pasos[p].includes(correo));
    if (suyos.length) out[Number(sede)] = suyos;
  }
  return out;
}

export async function tienePaso(email: unknown, companyId: number, paso: PasoNC): Promise<boolean> {
  return ((await pasosDe(email))[companyId] ?? []).includes(paso);
}

export async function registrarEvento(
  solicitudId: number,
  accion: string,
  autor: { nombre: string; email?: string | null },
  nota?: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO nc_eventos (solicitud_id, accion, por, email, nota) VALUES (?, ?, ?, ?, ?)`,
      [solicitudId, accion, autor.nombre.slice(0, 190), autor.email ? normCorreo(autor.email) : null, nota?.slice(0, 5000) || null],
    );
  } catch (e: any) {
    console.error(`[notas-credito] historial de NC-${solicitudId}:`, e?.message);
  }
}
