import { query } from "@/lib/db";
import { hayTablaProductos } from "@/lib/rma/items";
import { hayColumnaExterno } from "@/lib/rma/procedencia";
import { calcularPlazo, type Etapa, type Nivel, type Plazo } from "@/lib/rma/plazos";

/**
 * Casos de RMA que siguen sin salir, con sus plazos (lib/rma/plazos.ts). Es lo
 * que alimenta la sección Por llegar, las alertas del Dashboard y los
 * semáforos de las listas y del detalle.
 */

export type CasoConPlazo = {
  id: number;
  case_number: string;
  client_name: string;
  client_phone: string | null;
  producto: string;
  productos: number;
  brand: string | null;
  serial: string | null;
  invoice_number: string | null;
  status: string;
  origen: string | null;
  company_id: number | null;
  externo: boolean;
  created_at: string;
  ingreso_id: number | null;
  plazo: Plazo;
};

export type ResumenPlazos = Record<Etapa, number> & {
  avisos: number;
  vencidos: number;
  diagnosticoVencido: number;
  tallerVencido: number;
  porLlegarVencido: number;
};

/**
 * Un caso resuelto (reparado, NC, no procesado) que no tiene salida registrada
 * hace más de esto no se cuenta: casi siempre se entregó antes de que
 * existiera el registro de despacho, y no tiene sentido alertarlo para
 * siempre. El plazo de 7 días hábiles queda muy por debajo.
 */
const DIAS_RESUELTO_SIN_SALIDA = 30;

let hayIngresos = false;
async function hayTablaIngresos(): Promise<boolean> {
  if (hayIngresos) return true;
  try {
    hayIngresos = ((await query("SHOW TABLES LIKE 'seguridad_ingresos'")).rows as any[]).length > 0;
  } catch {
    hayIngresos = false;
  }
  return hayIngresos;
}

export async function casosConPlazo(filtro: { companyId?: number | null; id?: number | null } = {}): Promise<CasoConPlazo[]> {
  const [conIngresos, conProductos, conExterno] = await Promise.all([
    hayTablaIngresos(),
    hayTablaProductos(),
    hayColumnaExterno(),
  ]);

  const params: unknown[] = [];
  let where = "c.despachado_at IS NULL";
  if (filtro.id) {
    where += " AND c.id = ?";
    params.push(filtro.id);
  } else {
    where += ` AND (c.status NOT IN ('reparado','nota_credito','no_procesado')
                    OR c.updated_at >= DATE_SUB(NOW(), INTERVAL ${DIAS_RESUELTO_SIN_SALIDA} DAY))`;
  }
  if (filtro.companyId) {
    where += " AND c.company_id = ?";
    params.push(filtro.companyId);
  }

  const r = await query(
    `SELECT c.id, c.case_number, c.client_name, c.client_phone, c.model, c.hardware, c.brand,
            c.serial, c.serial_quantity, c.invoice_number, c.status, c.origen, c.company_id,
            c.created_at, c.despachado_at,
            ${conExterno ? "c.producto_externo" : "0"} AS externo,
            ${conProductos ? "(SELECT COUNT(*) FROM rma_case_items ci WHERE ci.case_id = c.id)" : "1"} AS productos,
            ${conIngresos ? "(SELECT MIN(si.created_at) FROM seguridad_ingresos si WHERE si.rma_case_id = c.id)" : "NULL"} AS ingreso_at,
            ${conIngresos ? "(SELECT MIN(si.id) FROM seguridad_ingresos si WHERE si.rma_case_id = c.id)" : "NULL"} AS ingreso_id,
            (SELECT MAX(h.created_at) FROM rma_history h WHERE h.case_id = c.id AND h.to_status = c.status) AS estado_desde,
            (SELECT MAX(h.created_at) FROM rma_history h WHERE h.case_id = c.id AND h.to_status = 'reingresado') AS reingreso_at,
            (SELECT MIN(h.created_at) FROM rma_history h WHERE h.case_id = c.id AND h.from_status = 'por_llegar') AS llegada_at
       FROM rma_cases c
      WHERE ${where}
      ORDER BY c.created_at ASC
      LIMIT 1000`,
    params,
  );

  const ahora = new Date();
  const casos: CasoConPlazo[] = [];
  for (const c of r.rows as any[]) {
    const plazo = calcularPlazo(c, ahora);
    if (!plazo) continue;
    const productos = Number(c.productos) || 1;
    casos.push({
      id: c.id,
      case_number: c.case_number,
      client_name: c.client_name || "",
      client_phone: c.client_phone || null,
      producto: (c.model || c.hardware || "") + (productos > 1 ? ` (+${productos - 1})` : ""),
      productos,
      brand: c.brand || null,
      serial: c.serial || c.serial_quantity || null,
      invoice_number: c.invoice_number || null,
      status: c.status,
      origen: c.origen || null,
      company_id: c.company_id ?? null,
      externo: Number(c.externo) === 1,
      created_at: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
      ingreso_id: c.ingreso_id ?? null,
      plazo,
    });
  }
  return casos;
}

export function resumirPlazos(casos: CasoConPlazo[]): ResumenPlazos {
  const res: ResumenPlazos = {
    por_llegar: 0,
    diagnostico: 0,
    reparacion: 0,
    listo: 0,
    avisos: 0,
    vencidos: 0,
    diagnosticoVencido: 0,
    tallerVencido: 0,
    porLlegarVencido: 0,
  };
  const es = (n: Nivel | undefined) => n === "vencido";
  for (const c of casos) {
    res[c.plazo.etapa]++;
    if (c.plazo.nivel === "vencido") res.vencidos++;
    else if (c.plazo.nivel === "aviso") res.avisos++;
    if (es(c.plazo.diagnostico?.nivel)) res.diagnosticoVencido++;
    if (es(c.plazo.taller?.nivel)) res.tallerVencido++;
    if (es(c.plazo.porLlegar?.nivel)) res.porLlegarVencido++;
  }
  return res;
}
