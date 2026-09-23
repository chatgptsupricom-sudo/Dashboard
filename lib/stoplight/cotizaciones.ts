import { callOdooRPC } from "@/lib/odoo";
import { fechaLocalDeDatetime } from "@/lib/stoplight/margen";

/**
 * Cotizaciones de venta para el KPI "Tasa de efectividad de cierre de
 * cotizaciones" (tabla de KPIs de Ventas, vigente para todos los meses por
 * decisión del usuario, 2026-09-21):
 *
 *   efectividad = cotizaciones confirmadas ÷ cotizaciones emitidas
 *
 * - Emitida: `sale.order` CREADA en el período (`create_date`, en hora de
 *   Venezuela), en cualquier estado. Se usa `create_date` y no `date_order`
 *   porque Odoo pisa `date_order` con la fecha de confirmación.
 * - Confirmada: estado `sale`/`done` hoy. Cancelada: `cancel` (negocio
 *   perdido). Pendiente: `draft`/`sent` (todavía abierta).
 * - Antes el KPI era facturadas ÷ órdenes ya confirmadas: medía facturación
 *   de pedidos, no cierre de cotizaciones.
 *
 * Lo usan la grilla y el detalle (superadmin y vendedor), así los números
 * coinciden.
 */

export type EstadoCotizacion = "confirmada" | "pendiente" | "cancelada";

export interface Cotizacion {
  id: number;
  vendedorId: number;
  vendedor: string;
  /** Día de emisión a medianoche local (comparable con las semanas del Stoplight). */
  fecha: Date;
  estado: EstadoCotizacion;
  /** Monto sin IVA. */
  monto: number;
}

/** "YYYY-MM-DD" (día de Venezuela, UTC-4) → límite UTC para `create_date`. */
function limiteUTC(fecha: string, finDelDia: boolean): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + (finDelDia ? 1 : 0), 4, 0, 0));
  if (finDelDia) utc.setUTCSeconds(-1);
  return utc.toISOString().replace("T", " ").slice(0, 19);
}

export async function obtenerCotizaciones(
  companyId: number,
  fechaInicio: string,
  fechaFin: string,
  dominioExtra: any[] = [],
): Promise<Cotizacion[]> {
  const out: Cotizacion[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = (await callOdooRPC<any[]>(
      "sale.order",
      "search_read",
      [[
        ["company_id", "=", companyId],
        ["create_date", ">=", limiteUTC(fechaInicio, false)],
        ["create_date", "<=", limiteUTC(fechaFin, true)],
        ["user_id", "!=", false],
        ...dominioExtra,
      ]],
      { fields: ["id", "user_id", "state", "create_date", "amount_untaxed"], order: "id asc", limit: 5000, offset },
    )) || [];
    for (const o of page) {
      out.push({
        id: o.id,
        vendedorId: o.user_id?.[0] || 0,
        vendedor: o.user_id?.[1] || "",
        fecha: fechaLocalDeDatetime(o.create_date),
        estado: o.state === "sale" || o.state === "done" ? "confirmada" : o.state === "cancel" ? "cancelada" : "pendiente",
        monto: Number(o.amount_untaxed) || 0,
      });
    }
    if (page.length < 5000) break;
  }
  return out;
}
