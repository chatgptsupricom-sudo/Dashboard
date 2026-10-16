import { db, query } from "@/lib/db";
import { flujoCompleto, PASOS, type PasoNC, type UsuarioPanel } from "@/lib/notas-credito/tipos";

/**
 * Tablas del flujo de notas de crédito. Se crean solas (DDL de referencia en
 * sql/notas_credito_flujo.sql):
 *   nc_solicitudes   una fila por nota de crédito, de RMA o directa, con cada
 *                    decisión y el enlace a la NC de Odoo.
 *   nc_solicitud_lineas  los productos de la factura de una NC directa
 *                    (cantidad, precio con impuestos y seriales).
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
    CREATE TABLE IF NOT EXISTS nc_solicitud_lineas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      solicitud_id INT NOT NULL,
      linea_factura_id INT NOT NULL,
      product_id INT NULL,
      producto VARCHAR(500) NOT NULL,
      codigo VARCHAR(100) NULL,
      marca VARCHAR(150) NULL,
      cantidad DECIMAL(14,4) NOT NULL,
      precio_unidad DECIMAL(14,4) NOT NULL,
      total DECIMAL(14,2) NOT NULL,
      seriales TEXT NULL,
      KEY idx_nc_lineas_sol (solicitud_id),
      KEY idx_nc_lineas_factura (linea_factura_id)
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
    rma: [],
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
    guardados[sede] ??= { rma: [], preaprueba: [], aprueba: [], procesa: [] };
    guardados[sede][f.paso as PasoNC].push(normCorreo(f.email));
  }
  const valor: Aprobadores = {};
  for (const sede of new Set([...Object.keys(INICIALES), ...Object.keys(guardados)].map(Number))) {
    valor[sede] = guardados[sede] ?? {
      rma: [...(INICIALES[sede]?.rma ?? [])],
      preaprueba: [...(INICIALES[sede]?.preaprueba ?? [])],
      aprueba: [...(INICIALES[sede]?.aprueba ?? [])],
      procesa: [...(INICIALES[sede]?.procesa ?? [])],
    };
  }
  cache = { valor, hasta: Date.now() + 30_000 };
  return valor;
}

/** Si la sede tiene el flujo activo: cada paso con al menos un responsable. */
export async function sedeConFlujo(companyId: number | null | undefined): Promise<boolean> {
  return flujoCompleto((await aprobadores())[Number(companyId)]);
}

/** Usuarios del panel con correo, para elegir responsables (los activos primero). */
export async function usuariosPanel(): Promise<UsuarioPanel[]> {
  const r = await query(
    `SELECT LOWER(TRIM(uc.email)) AS email, uc.name, COALESCE(r.display_name, r.name) AS rol, uc.cids,
            COALESCE(uc.is_active, 1) AS activo
       FROM users_config uc
       LEFT JOIN roles r ON r.id = uc.role_id
      WHERE uc.email LIKE '%_@_%'
      ORDER BY activo DESC, uc.name`,
  );
  const vistos = new Set<string>();
  const out: UsuarioPanel[] = [];
  for (const f of r.rows as any[]) {
    if (vistos.has(f.email)) continue;
    vistos.add(f.email);
    out.push({ email: f.email, nombre: f.name || f.email, rol: f.rol || "", cids: f.cids == null ? null : Number(f.cids), activo: Number(f.activo) === 1 });
  }
  return out;
}

export class ErrorAprobadores extends Error {}

/**
 * Reemplaza los responsables de una sede. Solo se aceptan correos de
 * users_config (se eligen de la lista del panel). Un paso puede quedar vacío
 * (la sede queda sin flujo y RMA le pide al Super Admin), salvo que la sede
 * tenga notas de crédito en curso: esas se quedarían sin quién las decida.
 * Una sede con INICIALES no puede quedar del todo vacía: sin filas volvería a
 * usar los iniciales.
 */
export async function guardarAprobadores(companyId: number, pasos: Record<PasoNC, string[]>, por: string): Promise<void> {
  await ensureTablas();
  const limpios = Object.fromEntries(PASOS.map((p) => [p, [...new Set((pasos[p] ?? []).map(normCorreo).filter(Boolean))]])) as Record<
    PasoNC,
    string[]
  >;
  const pedidos = [...new Set(PASOS.flatMap((p) => limpios[p]))];
  if (pedidos.length) {
    const r = await query(
      `SELECT DISTINCT LOWER(TRIM(email)) AS email FROM users_config WHERE LOWER(TRIM(email)) IN (${pedidos.map(() => "?").join(",")})`,
      pedidos,
    );
    const existen = new Set((r.rows as any[]).map((f) => f.email));
    const faltan = pedidos.filter((c) => !existen.has(c));
    if (faltan.length) throw new ErrorAprobadores(`No son usuarios del panel: ${faltan.join(", ")}.`);
  } else if (INICIALES[companyId]) {
    throw new ErrorAprobadores("Esta sede no puede quedar sin ningún responsable.");
  }
  if (!flujoCompleto(limpios)) {
    const abiertas = await query(
      `SELECT COUNT(*) AS n FROM nc_solicitudes WHERE company_id = ? AND estado IN ('por_preaprobar','por_aprobar','aprobada')`,
      [companyId],
    );
    if (Number((abiertas.rows as any[])[0]?.n)) {
      throw new ErrorAprobadores("La sede tiene notas de crédito en curso: cada paso necesita al menos una persona.");
    }
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
