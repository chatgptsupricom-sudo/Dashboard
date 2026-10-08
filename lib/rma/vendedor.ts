import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { hayColumnasAprobacion, hayColumnaItemNota } from "@/lib/rma/notaCredito";

/**
 * Casos de RMA de los clientes de un vendedor (sección "RMA de mis clientes"
 * del panel de vendedores). Solo lectura: el vendedor sigue el proceso, no lo
 * opera.
 *
 * `rma_cases` no guarda el vendedor, así que se deduce de Odoo. Un caso es del
 * vendedor si cumple cualquiera de estas:
 *   1. `odoo_partner_id` es un cliente suyo (`user_id` del cliente o de su
 *      empresa, `commercial_partner_id`). Lo traen los casos del portal.
 *   2. `invoice_number` es una factura de Odoo hecha por él
 *      (`invoice_user_id`) o a un cliente suyo. Los casos internos solo
 *      traen el número de factura escrito a mano.
 *   3. `client_name` es, normalizado, el nombre de un cliente suyo. Para los
 *      casos internos sin factura o con la factura mal escrita.
 */

const TROZO_FACTURAS = 300;
/** Nombres más cortos que esto no se cruzan: "CA" o "JR" casan con cualquiera. */
const MIN_NOMBRE = 5;

/** Minúsculas, sin acentos ni signos: "Inversiones Pérez, C.A." = "inversiones perez c a". */
export function normalizarNombre(s: string | null | undefined): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type CasoBase = {
  id: number;
  invoice_number: string | null;
  odoo_partner_id: number | null;
  client_name: string | null;
  company_id: number | null;
};

type Factura = {
  name: string;
  company_id: [number, string] | false;
  invoice_user_id: [number, string] | false;
  commercial_partner_id: [number, string] | false;
};

const m2o = (v: any): number | null => (Array.isArray(v) ? Number(v[0]) : null);

/** Ids de `rma_cases` que son de clientes del vendedor `sellerId` (uid de Odoo). */
export async function casosDelVendedor(sellerId: number): Promise<number[]> {
  const casos = (await query(
    `SELECT id, invoice_number, odoo_partner_id, client_name, company_id FROM rma_cases`,
  )).rows as CasoBase[];
  if (casos.length === 0) return [];

  // Clientes del vendedor y sus contactos. Se incluyen archivados: un caso
  // viejo puede ser de un cliente que ya no está activo.
  const socios =
    (await callOdooRPCEstricto<any[]>(
      "res.partner",
      "search_read",
      [["|", ["user_id", "=", sellerId], ["commercial_partner_id.user_id", "=", sellerId]]],
      { fields: ["id", "name"], context: { active_test: false } },
    )) || [];
  const idsSocios = new Set<number>(socios.map((p) => Number(p.id)));
  const nombres = new Set<string>(
    socios.map((p) => normalizarNombre(p.name)).filter((n) => n.length >= MIN_NOMBRE),
  );

  // Facturas citadas en los casos. El número interno es texto libre, así que
  // se pide tal cual y en mayúsculas.
  const numeros = new Set<string>();
  for (const c of casos) {
    const n = String(c.invoice_number || "").trim();
    if (n) {
      numeros.add(n);
      numeros.add(n.toUpperCase());
    }
  }
  const lista = [...numeros];
  const facturas = new Map<string, Factura[]>();
  for (let i = 0; i < lista.length; i += TROZO_FACTURAS) {
    const trozo = lista.slice(i, i + TROZO_FACTURAS);
    const filas =
      (await callOdooRPCEstricto<Factura[]>(
        "account.move",
        "search_read",
        [[["name", "in", trozo], ["move_type", "in", ["out_invoice", "out_refund"]]]],
        { fields: ["name", "company_id", "invoice_user_id", "commercial_partner_id"] },
      )) || [];
    for (const f of filas) {
      const k = String(f.name).toUpperCase();
      facturas.set(k, [...(facturas.get(k) || []), f]);
    }
  }

  const facturaEsSuya = (c: CasoBase): boolean => {
    const k = String(c.invoice_number || "").trim().toUpperCase();
    let candidatas = facturas.get(k) || [];
    // Cada sede numera sus facturas: con el caso en una sede, manda la factura de esa sede.
    if (c.company_id) {
      const deLaSede = candidatas.filter((f) => m2o(f.company_id) === Number(c.company_id));
      if (deLaSede.length) candidatas = deLaSede;
    }
    return candidatas.some(
      (f) =>
        m2o(f.invoice_user_id) === sellerId ||
        idsSocios.has(m2o(f.commercial_partner_id) ?? -1),
    );
  };

  return casos
    .filter(
      (c) =>
        (c.odoo_partner_id != null && idsSocios.has(Number(c.odoo_partner_id))) ||
        facturaEsSuya(c) ||
        nombres.has(normalizarNombre(c.client_name)),
    )
    .map((c) => Number(c.id));
}

/** Adjuntos del caso (fotos del cliente, guías). Solo los que tienen URL pública. */
export async function adjuntosDelCaso(caseId: number): Promise<any[]> {
  const columnas = [
    "id, filename, mime, size, created_at, tracking_token, tipo, item_id",
    "id, filename, mime, size, created_at, tracking_token, tipo",
    "id, filename, mime, size, created_at, tracking_token",
  ];
  // Las columnas `tipo` e `item_id` llegaron con migraciones posteriores: se
  // prueba de la más completa a la más vieja en vez de alterar la tabla desde
  // una pantalla de solo lectura.
  for (const cols of columnas) {
    try {
      const r = await query(
        `SELECT ${cols} FROM rma_ticket_adjuntos WHERE ticket_id = ? ORDER BY created_at ASC`,
        [caseId],
      );
      return (r.rows as any[])
        .filter((a) => a.tracking_token)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size: a.size,
          created_at: a.created_at,
          tipo: a.tipo || "reporte",
          item_id: a.item_id ?? null,
          url: `/api/servicio-tecnico/ticket/adjuntos/${a.tracking_token}/${a.id}`,
        }));
    } catch {
      // siguiente variante
    }
  }
  return [];
}

/** Recepciones del equipo en Seguridad (acta de ingreso). */
export async function ingresosDelCaso(caseId: number): Promise<any[]> {
  try {
    const r = await query(
      `SELECT id, fecha_entrega, nd_numero, factura_numero, hardware, serial,
              descripcion_falla, accesorios_integros, sin_manipulacion,
              recibido_por, recibido_seguridad_nombre, recibido_rma_nombre, created_at
         FROM seguridad_ingresos WHERE rma_case_id = ? ORDER BY created_at ASC`,
      [caseId],
    );
    return r.rows as any[];
  } catch {
    return [];
  }
}

/** Despachos del equipo en Seguridad (acta de entrega al cliente). */
export async function despachosDelCaso(caseId: number): Promise<any[]> {
  try {
    const r = await query(
      `SELECT id, fecha_despacho, nd_numero, almacenista_nombre, cliente_retira,
              accesorios_integros, observaciones, created_at
         FROM seguridad_despachos WHERE rma_case_id = ? ORDER BY created_at ASC`,
      [caseId],
    );
    return r.rows as any[];
  } catch {
    return [];
  }
}

/** Solicitudes de nota de crédito del caso (lib/rma/notaCredito.ts). */
export async function notasDelCaso(caseId: number): Promise<any[]> {
  try {
    if (!(await hayColumnasAprobacion())) {
      const r = await query(
        `SELECT id, detail, observations, created_by, created_at FROM rma_notas_credito
          WHERE case_id = ? ORDER BY created_at ASC`,
        [caseId],
      );
      return (r.rows as any[]).map((n) => ({ ...n, estado: "aprobada", item_id: null }));
    }
    const conItem = await hayColumnaItemNota();
    const r = await query(
      `SELECT id, ${conItem ? "item_id" : "NULL AS item_id"}, estado, motivo, detail, observations,
              created_by, created_at, decidido_por, decidido_at, motivo_rechazo
         FROM rma_notas_credito WHERE case_id = ? ORDER BY created_at ASC`,
      [caseId],
    );
    return r.rows as any[];
  } catch {
    return [];
  }
}
