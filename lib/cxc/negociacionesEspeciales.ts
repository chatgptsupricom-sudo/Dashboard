import { query } from "@/lib/db";
import { hoyCaracas } from "@/lib/compras/datosOdoo";

/**
 * Negociaciones especiales de cobro (tabla `cxc_negociaciones_especiales`, se
 * crea sola): clientes con un acuerdo de pago fuera de lo normal (plazo
 * extendido, refinanciamiento, pago por cuotas, compra grande con plazo
 * pactado aparte…) que CxC marca a mano con su motivo. Sus facturas sesgan el
 * DSO general, así que el DSO (lib/cxc/dso.ts) las deja fuera del número
 * general y las muestra aparte con su propio DSO.
 *
 * Una marca es por cliente (partner comercial) y sede (`company_id`; 0 = las
 * tres) y cuenta en un período si está vigente **al corte**: `desde` ≤ corte ≤
 * `hasta` (null = sin fin) y no se quitó hasta ese día. Quitarla no la borra:
 * queda `quitado_dia` (día de Caracas), así un mes cerrado se sigue
 * calculando igual que se vio. Marcan y quitan CxC, Administración (de su
 * sede) y el SuperAdmin; una marca de las tres sedes solo quien ve las tres.
 *
 * Si la MySQL no responde el DSO sigue sin marcas (mejor el KPI sin el ajuste
 * que el dashboard caído).
 */

const TABLA = "cxc_negociaciones_especiales";

let lista = false;
async function asegurarTabla() {
  if (lista) return;
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLA} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL DEFAULT 0,
      partner_id INT NOT NULL,
      cliente VARCHAR(255) NOT NULL,
      motivo TEXT NOT NULL,
      desde DATE NOT NULL,
      hasta DATE NULL,
      creado_por VARCHAR(255) NOT NULL,
      creado_el DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      quitado_por VARCHAR(255) NULL,
      quitado_el DATETIME NULL,
      quitado_dia DATE NULL,
      motivo_quitar TEXT NULL,
      INDEX idx_partner (partner_id),
      INDEX idx_company (company_id)
    )`,
  );
  lista = true;
}

/**
 * Sube con cada marca o quita: la ruta del Dashboard de CxC la mete en la
 * llave de su caché, así la tarjeta no queda con el DSO de antes.
 */
let version = 0;
export const versionEspeciales = () => version;

export interface NegociacionEspecial {
  id: number;
  companyId: number;
  partnerId: number;
  cliente: string;
  motivo: string;
  desde: string;
  hasta: string | null;
  creadoPor: string;
  creadoEl: string;
  quitadoPor: string | null;
  quitadoDia: string | null;
  motivoQuitar: string | null;
}

const sedes = (ids: number[]) => [0, ...ids];
const marcas = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** Llave de una marca: `${companyId}:${partnerId}` (companyId 0 = todas las sedes). */
export const llaveEspecial = (companyId: number, partnerId: number) => `${companyId}:${partnerId}`;

/** ¿El documento de esa sede y cliente es de una negociación especial? */
export function esEspecial(llaves: Set<string>, companyId: number, partnerId: number): boolean {
  return llaves.has(llaveEspecial(companyId, partnerId)) || llaves.has(llaveEspecial(0, partnerId));
}

/** Clientes especiales de cada sede (una marca 0 cuenta en todas). */
export function especialesPorSede(llaves: Set<string>, companyIds: number[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const llave of llaves) {
    const [cid, pid] = llave.split(":").map(Number);
    for (const sede of cid === 0 ? companyIds : [cid]) {
      if (!companyIds.includes(sede)) continue;
      if (!out.has(sede)) out.set(sede, []);
      if (!out.get(sede)!.includes(pid)) out.get(sede)!.push(pid);
    }
  }
  return out;
}

/** Marcas vigentes al corte (YYYY-MM-DD, hora de Caracas). */
export async function especialesVigentes(companyIds: number[], corte: string): Promise<Set<string>> {
  if (!companyIds.length) return new Set();
  try {
    await asegurarTabla();
    const { rows } = await query(
      `SELECT company_id, partner_id FROM ${TABLA}
        WHERE company_id IN (${marcas(companyIds.length + 1)})
          AND desde <= ? AND (hasta IS NULL OR hasta >= ?)
          AND (quitado_dia IS NULL OR quitado_dia > ?)`,
      [...sedes(companyIds), corte, corte, corte],
    );
    return new Set((rows as any[]).map((r) => llaveEspecial(Number(r.company_id), Number(r.partner_id))));
  } catch (e: any) {
    console.error(`${TABLA} no disponible, el DSO sigue sin negociaciones especiales:`, e?.message);
    return new Set();
  }
}

const fechaHora = (v: any) => (v ? new Date(v).toISOString() : null);

export async function listarEspeciales(companyIds: number[]): Promise<NegociacionEspecial[]> {
  await asegurarTabla();
  const { rows } = await query(
    `SELECT id, company_id, partner_id, cliente, motivo, DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta,
            creado_por, creado_el, quitado_por, DATE_FORMAT(quitado_dia, '%Y-%m-%d') AS quitado_dia, motivo_quitar
       FROM ${TABLA} WHERE company_id IN (${marcas(companyIds.length + 1)})
      ORDER BY quitado_dia IS NOT NULL, creado_el DESC, id DESC`,
    sedes(companyIds),
  );
  return (rows as any[]).map((r) => ({
    id: r.id,
    companyId: Number(r.company_id),
    partnerId: Number(r.partner_id),
    cliente: r.cliente,
    motivo: r.motivo,
    desde: r.desde,
    hasta: r.hasta || null,
    creadoPor: r.creado_por,
    creadoEl: fechaHora(r.creado_el)!,
    quitadoPor: r.quitado_por,
    quitadoDia: r.quitado_dia || null,
    motivoQuitar: r.motivo_quitar,
  }));
}

export async function marcarEspecial(m: {
  companyId: number; partnerId: number; cliente: string; motivo: string; desde: string; hasta: string | null; usuario: string;
}): Promise<{ id: number } | { error: string }> {
  await asegurarTabla();
  // Choca con otra marca sin quitar del mismo cliente cuya vigencia se cruza;
  // una marca de las tres sedes choca con cualquier sede.
  const { rows } = await query(
    `SELECT id FROM ${TABLA}
      WHERE partner_id = ? AND quitado_dia IS NULL
        ${m.companyId === 0 ? "" : "AND company_id IN (0, ?)"}
        AND (hasta IS NULL OR hasta >= ?) AND (? IS NULL OR desde <= ?)`,
    [m.partnerId, ...(m.companyId === 0 ? [] : [m.companyId]), m.desde, m.hasta, m.hasta],
  );
  if ((rows as any[]).length) return { error: "Ese cliente ya tiene una negociación especial en esas fechas y esa sede" };
  const r: any = await query(
    `INSERT INTO ${TABLA} (company_id, partner_id, cliente, motivo, desde, hasta, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [m.companyId, m.partnerId, m.cliente.slice(0, 255), m.motivo, m.desde, m.hasta, m.usuario.slice(0, 255)],
  );
  version++;
  return { id: Number(r?.rows?.insertId ?? 0) };
}

/**
 * Quita una marca de las sedes permitidas (las de las tres sedes, solo si
 * `veLasTres`). false = no existe, ya estaba quitada o no le corresponde.
 */
export async function quitarEspecial(id: number, companyIds: number[], veLasTres: boolean, usuario: string, motivo: string): Promise<boolean> {
  await asegurarTabla();
  const permitidas = veLasTres ? sedes(companyIds) : companyIds;
  const r: any = await query(
    `UPDATE ${TABLA} SET quitado_el = NOW(), quitado_dia = ?, quitado_por = ?, motivo_quitar = ?
      WHERE id = ? AND quitado_dia IS NULL AND company_id IN (${marcas(permitidas.length)})`,
    [hoyCaracas(), usuario.slice(0, 255), motivo, id, ...permitidas],
  );
  const ok = Number(r?.rows?.affectedRows ?? 0) > 0;
  if (ok) version++;
  return ok;
}
