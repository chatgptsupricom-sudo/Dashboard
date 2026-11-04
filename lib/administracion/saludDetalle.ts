import { callOdooRPC } from "@/lib/odoo";
import { esIntercompania } from "@/lib/administracion/intercompania";
import { fetchFechasDePago } from "@/lib/administracion/saludFinanciera";
import { fetchTesoreriaAdmin } from "@/lib/administracion/tesoreria";
import { CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA } from "@/lib/administracion/gestionAdministrativa";
import { searchReadTodo } from "@/lib/administracion/odooRefs";
import { cargarMetas } from "@/lib/administracion/metas";
import { hoyCaracas, sumarDias } from "@/lib/administracion/lectura";

/**
 * Detalle de una alerta del Top 10 de Salud Administrativa: de donde sale en
 * Odoo y los registros que la componen, cada uno con su enlace a la ficha en
 * Odoo. Un enlace de Odoo no puede llevar un filtro armado (el dominio no va en
 * la URL), por eso el enlace util es el de cada registro; el del menu solo
 * abre la lista para buscar ahi.
 *
 * Las consultas repiten el criterio del indicador (sin intercompania, las
 * mismas fechas), pero por registro: la cartera se ve por factura aunque el
 * indicador neta los saldos a favor de cada cliente.
 */

export interface FilaDetalle {
  texto: string;
  sub?: string;
  fecha?: string | null;
  monto?: number | null;
  url?: string | null;
}

export interface DetalleAlerta {
  /** De donde sale el dato, en palabras. */
  origen: string;
  /** Menu de Odoo donde se ve (sin el filtro). */
  odoo: { etiqueta: string; url: string } | null;
  /** Pantalla del panel con el detalle. */
  panel: { etiqueta: string; ruta: string } | null;
  filas: FilaDetalle[];
  /** Cuantos registros hay en total (las filas se cortan en MAX_FILAS). */
  total: number;
}

const MAX_FILAS = 300;
const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/+$/, "");

const urlRegistro = (model: string, id: number, cid?: number | null) =>
  `${ODOO}/web#id=${id}&model=${model}&view_type=form${cid ? `&cids=${cid}` : ""}`;

// Ids de las acciones de menu por su xmlid (estables entre bases; el id no).
const ACCIONES: Record<string, string> = {
  facturasProveedor: "account.action_move_in_invoice_type",
  facturasCliente: "account.action_move_out_invoice_type",
  clientes: "account.res_partner_action_customer",
  apuntes: "account.action_account_moves_all",
  extractos: "account.action_bank_statement_tree",
  tablero: "account.open_account_journal_dashboard_kanban",
};
const cacheAcciones = new Map<string, number | null>();

async function urlAccion(clave: keyof typeof ACCIONES, model: string, companyIds: number[]) {
  const xmlid = ACCIONES[clave];
  if (!cacheAcciones.has(xmlid)) {
    const [modulo, nombre] = xmlid.split(".");
    try {
      const r = await callOdooRPC<any[]>("ir.model.data", "search_read", [[["module", "=", modulo], ["name", "=", nombre]]], {
        fields: ["res_id"],
        limit: 1,
      });
      cacheAcciones.set(xmlid, r?.[0]?.res_id ?? null);
    } catch {
      cacheAcciones.set(xmlid, null);
    }
  }
  const id = cacheAcciones.get(xmlid);
  return id ? `${ODOO}/web#action=${id}&model=${model}&view_type=list&cids=${companyIds.join(",")}` : null;
}

const cid = (r: any): number | null => (Array.isArray(r.company_id) ? r.company_id[0] : null);
const nombre = (m2o: any) => (Array.isArray(m2o) ? String(m2o[1]) : "");
const redondo = (n: number) => Math.round(n * 100) / 100;

function recortar(filas: FilaDetalle[]): { filas: FilaDetalle[]; total: number } {
  return { filas: filas.slice(0, MAX_FILAS), total: filas.length };
}

const CAMPOS_FACTURA = [
  "name",
  "partner_id",
  "invoice_date",
  "invoice_date_due",
  "amount_residual_signed",
  "amount_total_signed",
  "invoice_payment_term_id",
  "payment_state",
  "company_id",
  "move_type",
];

/** Facturas de proveedor publicadas con saldo, sin intercompania (como fetchCxP). */
async function cxpPendientes(companyIds: number[]) {
  const filas = await searchReadTodo(
    "account.move",
    [
      ["company_id", "in", companyIds],
      ["move_type", "in", ["in_invoice", "in_refund"]],
      ["state", "=", "posted"],
      ["amount_residual", "!=", 0],
    ],
    CAMPOS_FACTURA,
  );
  return filas.filter(
    (f) => !esIntercompania(nombre(f.partner_id)) && f.payment_state !== "paid" && Math.abs(Number(f.amount_residual_signed)) > 0.01,
  );
}

/** Facturas de cliente publicadas con saldo, sin intercompania. */
async function cxcPendientes(companyIds: number[]) {
  const filas = await searchReadTodo(
    "account.move",
    [
      ["company_id", "in", companyIds],
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["amount_residual", "!=", 0],
    ],
    CAMPOS_FACTURA,
  );
  return filas.filter((f) => !esIntercompania(nombre(f.partner_id)));
}

const filaFactura = (f: any, sub: string, monto: number): FilaDetalle => ({
  texto: `${nombre(f.partner_id) || "Sin contacto"} · ${f.name}`,
  sub,
  fecha: f.invoice_date_due || null,
  monto: redondo(monto),
  url: urlRegistro("account.move", f.id, cid(f)),
});

const fechaLatina = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Detalle de la alerta `alertaId` ("sf-<kpi>", "admin-<kpi>", "gastos-…").
 * null = la alerta no existe para este panel.
 */
export async function detalleAlerta(alertaId: string, companyIds: number[], mes: string): Promise<DetalleAlerta | null> {
  const hoy = hoyCaracas();
  const [anio, m] = mes.split("-").map(Number);
  const desde = `${mes}-01`;
  const hasta = `${mes}-${String(new Date(anio, m, 0).getDate()).padStart(2, "0")}`;

  if (alertaId.startsWith("gastos-")) {
    return {
      origen:
        "Sale de los apuntes contables de las cuentas de gasto del mes, comparados contra el presupuesto cargado en el panel. El detalle por cuenta está en Gastos y Presupuesto.",
      odoo: null,
      panel: { etiqueta: "Gastos y Presupuesto", ruta: "/administracion/gastos" },
      filas: [],
      total: 0,
    };
  }

  switch (alertaId) {
    case "sf-obligaciones_vencidas":
    case "sf-cobertura_pagos_30d": {
      const vencidas = alertaId === "sf-obligaciones_vencidas";
      const hasta30 = sumarDias(hoy, 30);
      const lista = (await cxpPendientes(companyIds))
        .filter((f) =>
          vencidas
            ? f.invoice_date_due && f.invoice_date_due < hoy
            : f.invoice_date_due && f.invoice_date_due >= hoy && f.invoice_date_due <= hasta30,
        )
        .map((f) => {
          const sinCondicion = !f.invoice_payment_term_id;
          return filaFactura(
            f,
            `Vence ${fechaLatina(f.invoice_date_due)}` +
              (sinCondicion ? " · sin condición de pago en Odoo (vence el día de la factura)" : ""),
            -Number(f.amount_residual_signed),
          );
        })
        .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
      return {
        origen: vencidas
          ? "Facturas de proveedor publicadas con saldo y vencimiento antes de hoy, sin empresas del grupo. Una factura sin condición de pago vence el mismo día de la factura: cargarle la condición en Odoo la saca de aquí si no está vencida de verdad."
          : "Facturas de proveedor publicadas con saldo que vencen en los próximos 30 días, sin empresas del grupo.",
        odoo: { etiqueta: "Contabilidad › Proveedores › Facturas", url: (await urlAccion("facturasProveedor", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Pagar", ruta: "/administracion/cuentas-por-pagar" },
        ...recortar(lista),
      };
    }

    case "sf-pagos_a_tiempo": {
      const delPeriodo = (
        await searchReadTodo(
          "account.move",
          [
            ["company_id", "in", companyIds],
            ["move_type", "=", "in_invoice"],
            ["state", "=", "posted"],
            ["invoice_date_due", ">=", desde],
            ["invoice_date_due", "<=", hasta],
          ],
          CAMPOS_FACTURA,
        )
      ).filter((f) => !esIntercompania(nombre(f.partner_id)));
      const fechas = await fetchFechasDePago(delPeriodo.map((f) => f.id));
      // Mismo criterio que el indicador: pagada despues del vencimiento, o sin pagar y ya vencida.
      const tarde = delPeriodo
        .map((f) => {
          const pagada = f.payment_state === "paid" || f.payment_state === "in_payment";
          const fechaPago = fechas[f.id];
          if (pagada && fechaPago && fechaPago > f.invoice_date_due) {
            return filaFactura(f, `Venció ${fechaLatina(f.invoice_date_due)} · pagada ${fechaLatina(fechaPago)}`, Math.abs(Number(f.amount_total_signed)));
          }
          const residual = -Number(f.amount_residual_signed);
          if (!pagada && f.payment_state !== "reversed" && residual > 0.01 && f.invoice_date_due < hoy) {
            return filaFactura(f, `Venció ${fechaLatina(f.invoice_date_due)} · sin pagar`, residual);
          }
          return null;
        })
        .filter((f): f is FilaDetalle => f !== null)
        .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
      return {
        origen:
          "Facturas de proveedor que vencían en el mes: aquí están las pagadas después de su vencimiento (la fecha de pago es la de la última conciliación) y las que siguen sin pagar ya vencidas.",
        odoo: { etiqueta: "Contabilidad › Proveedores › Facturas", url: (await urlAccion("facturasProveedor", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Pagar", ruta: "/administracion/cuentas-por-pagar" },
        ...recortar(tarde),
      };
    }

    case "sf-facturas_pendientes": {
      const metas = await cargarMetas(companyIds[0]);
      const plazoDias = metas.plazo_procesamiento_dias ?? 1;
      const borradores = await searchReadTodo(
        "account.move",
        [
          ["company_id", "in", companyIds],
          ["move_type", "=", "in_invoice"],
          ["state", "=", "draft"],
        ],
        ["name", "ref", "partner_id", "create_date", "amount_total_signed", "company_id"],
      );
      const ahora = Date.now();
      const lista = borradores
        .map((f) => ({ f, dias: (ahora - Date.parse(String(f.create_date).replace(" ", "T") + "Z")) / 86400000 }))
        .filter(({ dias }) => dias > plazoDias)
        .sort((a, b) => b.dias - a.dias)
        .map(({ f, dias }) => ({
          texto: `${nombre(f.partner_id) || "Sin proveedor"} · ${f.ref || (f.name && f.name !== "/" ? f.name : "Borrador")}`,
          sub: `En borrador hace ${Math.floor(dias)} días`,
          fecha: String(f.create_date).slice(0, 10),
          monto: redondo(Math.abs(Number(f.amount_total_signed) || 0)),
          url: urlRegistro("account.move", f.id, cid(f)),
        }));
      return {
        origen: `Facturas de proveedor en borrador cargadas hace más de ${plazoDias * 24} h (cualquier fecha; incluye empresas del grupo, porque cargarlas a tiempo también es trabajo de Administración).`,
        odoo: { etiqueta: "Contabilidad › Proveedores › Facturas (filtro Borrador)", url: (await urlAccion("facturasProveedor", "account.move", companyIds)) || "" },
        panel: null,
        ...recortar(lista),
      };
    }

    case "sf-cartera_vencida":
    case "sf-dso":
    case "sf-cartera_90": {
      const limite = alertaId === "sf-cartera_90" ? sumarDias(hoy, -90) : hoy;
      const lista = (await cxcPendientes(companyIds))
        .filter((f) => f.move_type === "out_invoice" && Number(f.amount_residual_signed) > 0.01 && f.invoice_date_due && f.invoice_date_due < limite)
        .map((f) =>
          filaFactura(
            f,
            `Vencida desde ${fechaLatina(f.invoice_date_due)} (${Math.floor((Date.parse(hoy) - Date.parse(f.invoice_date_due)) / 86400000)} días)`,
            Number(f.amount_residual_signed),
          ),
        )
        .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
      return {
        origen:
          (alertaId === "sf-cartera_90" ? "Facturas de cliente con más de 90 días de vencidas" : "Facturas de cliente vencidas") +
          " con saldo, sin empresas del grupo. El indicador además resta los saldos a favor de cada cliente (anticipos, notas de crédito sin aplicar), así que su total puede ser algo menor que la suma de esta lista.",
        odoo: { etiqueta: "Contabilidad › Clientes › Facturas", url: (await urlAccion("facturasCliente", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Cobrar", ruta: "/cuentas-por-cobrar" },
        ...recortar(lista),
      };
    }

    case "sf-cobros_esperados":
    case "sf-cumplimiento_cobranza": {
      const delMes = (
        await searchReadTodo(
          "account.move",
          [
            ["company_id", "in", companyIds],
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date_due", ">=", desde],
            ["invoice_date_due", "<=", hasta],
            ["amount_residual", "!=", 0],
          ],
          CAMPOS_FACTURA,
        )
      ).filter((f) => !esIntercompania(nombre(f.partner_id)) && Number(f.amount_residual_signed) > 0.01);
      const lista = delMes
        .map((f) =>
          filaFactura(
            f,
            `Vence ${fechaLatina(f.invoice_date_due)} · cobrado ${redondo(Number(f.amount_total_signed) - Number(f.amount_residual_signed)).toLocaleString("en-US")} de ${redondo(Number(f.amount_total_signed)).toLocaleString("en-US")}`,
            Number(f.amount_residual_signed),
          ),
        )
        .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
      return {
        origen:
          "Facturas de cliente que vencen en el mes y todavía tienen saldo, sin empresas del grupo: es lo que falta por cobrar de lo esperado. El indicador compara lo cobrado de esas facturas (y, en Cumplimiento, todo lo que entró a banco y caja) contra lo esperado.",
        odoo: { etiqueta: "Contabilidad › Clientes › Facturas", url: (await urlAccion("facturasCliente", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Cobrar", ruta: "/cuentas-por-cobrar" },
        ...recortar(lista),
      };
    }

    case "sf-clientes_excedidos": {
      const porSede = await Promise.all(
        companyIds.map(async (c) =>
          ((await callOdooRPC<any[]>(
            "res.partner",
            "search_read",
            [[["company_id", "=", c], ["customer_rank", ">", 0], ["credit_limit", ">", 0], ["active", "=", true]]],
            { fields: ["display_name", "credit", "credit_limit"], limit: 0, context: { allowed_company_ids: [c] } },
          )) || []).map((p) => ({ ...p, sede: c })),
        ),
      );
      const lista = porSede
        .flat()
        .filter((p) => !esIntercompania(p.display_name) && Number(p.credit) > Number(p.credit_limit))
        .map((p) => ({
          texto: p.display_name,
          sub: `Debe ${redondo(Number(p.credit)).toLocaleString("en-US")} con límite de ${redondo(Number(p.credit_limit)).toLocaleString("en-US")}`,
          monto: redondo(Number(p.credit) - Number(p.credit_limit)),
          url: urlRegistro("res.partner", p.id, p.sede),
        }))
        .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
      return {
        origen:
          "Clientes con límite de crédito cargado (ficha del contacto › Contabilidad) cuyo total por cobrar lo pasa. El monto es cuánto se pasan del límite.",
        odoo: { etiqueta: "Contabilidad › Clientes › Clientes", url: (await urlAccion("clientes", "res.partner", companyIds)) || "" },
        panel: null,
        ...recortar(lista),
      };
    }

    case "sf-cobertura_caja_30d":
    case "sf-flujo_proyectado_30d":
    case "sf-disponibilidad_bancaria": {
      const tes = await fetchTesoreriaAdmin(companyIds, hoy, desde, hasta);
      const lista = tes.cuentas
        .filter((c) => c.clase === "disponible" && Math.abs(c.saldo) > 0.01)
        .sort((a, b) => a.saldo - b.saldo)
        .map((c) => ({
          texto: `${c.codigo} ${c.nombre}`,
          sub:
            `${c.sede} · en el banco ${redondo(c.saldoBanco).toLocaleString("en-US")}` +
            (Math.abs(c.pendiente) > 0.01
              ? ` · cobros/pagos registrados sin conciliar (R/P) ${redondo(c.pendiente).toLocaleString("en-US")}`
              : ""),
          monto: redondo(c.saldo),
          url: urlRegistro("account.account", c.cuentaId),
        }));
      return {
        origen:
          "La caja es el saldo en libros de cada cuenta de banco y caja: lo de la cuenta del banco más los cobros y pagos registrados que todavía no se concilian con un extracto (R/P). Sin extractos cargados, los pagos se quedan en R/P y la caja puede salir negativa sin serlo. El flujo y la cobertura suman a esa caja lo que hay por cobrar y por pagar a 30 días.",
        odoo: { etiqueta: "Contabilidad › Tablero", url: (await urlAccion("tablero", "account.journal", companyIds)) || "" },
        panel: { etiqueta: "Tesorería y Bancos", ruta: "/administracion/tesoreria" },
        ...recortar(lista),
      };
    }

    case "sf-conciliaciones_dia": {
      const lineas = await searchReadTodo(
        "account.bank.statement.line",
        [
          ["company_id", "in", companyIds],
          ["state", "=", "posted"],
          ["date", ">=", `${hoy.slice(0, 4)}-01-01`],
          ["is_reconciled", "=", false],
        ],
        ["date", "payment_ref", "amount", "journal_id", "move_id", "company_id"],
      );
      const lista = lineas
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((l) => ({
          texto: `${nombre(l.journal_id)} · ${l.payment_ref || "Sin referencia"}`,
          sub: "Línea de extracto sin conciliar",
          fecha: l.date,
          monto: redondo(Number(l.amount) || 0),
          url: Array.isArray(l.move_id) ? urlRegistro("account.move", l.move_id[0], cid(l)) : null,
        }));
      return {
        origen:
          "Líneas de extractos bancarios publicadas este año que no están conciliadas. Solo mide los extractos cargados en Odoo: en Valencia y Caracas casi no se cargan desde abril, por eso el último puede ser viejo.",
        odoo: { etiqueta: "Contabilidad › Extractos bancarios", url: (await urlAccion("extractos", "account.bank.statement", companyIds)) || "" },
        panel: { etiqueta: "Tesorería y Bancos", ruta: "/administracion/tesoreria" },
        ...recortar(lista),
      };
    }

    case "admin-legalizacion_pendiente": {
      const pares = companyIds
        .filter((c) => CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA[c] !== undefined)
        .map((c) => ["&", ["company_id", "=", c], ["code", "=", CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA[c]]]);
      const cuentas = pares.length
        ? await searchReadTodo("account.account", [...Array(pares.length - 1).fill("|"), ...pares.flat()], ["id", "code", "name"])
        : [];
      const lineas = cuentas.length
        ? await searchReadTodo(
            "account.move.line",
            [["account_id", "in", cuentas.map((c) => c.id)], ["parent_state", "=", "posted"]],
            ["account_id", "partner_id", "debit", "credit", "date", "company_id"],
          )
        : [];
      // Igual que el indicador: saldo por (cuenta, contacto) y la fecha del anticipo mas viejo.
      const grupos = new Map<string, { partner: any; cuenta: any; saldo: number; desde: string | null; sede: number | null }>();
      lineas.forEach((l) => {
        const clave = `${l.account_id[0]}:${Array.isArray(l.partner_id) ? l.partner_id[0] : "-"}`;
        const g = grupos.get(clave) || { partner: l.partner_id, cuenta: l.account_id, saldo: 0, desde: null, sede: cid(l) };
        g.saldo += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        if (Number(l.debit) > 0 && (!g.desde || l.date < g.desde)) g.desde = l.date;
        grupos.set(clave, g);
      });
      const lista = [...grupos.values()]
        .filter((g) => g.saldo > 0.01)
        .sort((a, b) => b.saldo - a.saldo)
        .map((g) => ({
          texto: Array.isArray(g.partner) ? g.partner[1] : "Sin empleado asignado",
          sub: `Cuenta ${nombre(g.cuenta)} · anticipo desde ${fechaLatina(g.desde)}`,
          fecha: g.desde,
          monto: redondo(g.saldo),
          url: Array.isArray(g.partner) ? urlRegistro("res.partner", g.partner[0], g.sede) : urlRegistro("account.account", g.cuenta[0]),
        }));
      return {
        origen: `Saldo (débito − crédito) de la cuenta de anticipos a empleados de cada sede (${cuentas
          .map((c) => c.code)
          .join(", ") || "sin cuenta"}), por empleado. Se llevan por asiento directo, no por el módulo de Gastos.`,
        odoo: { etiqueta: "Contabilidad › Apuntes contables", url: (await urlAccion("apuntes", "account.move.line", companyIds)) || "" },
        panel: null,
        ...recortar(lista),
      };
    }
  }

  if (alertaId.startsWith("admin-")) {
    return {
      origen:
        "Sale de las tareas y proyectos de Administración en Odoo (checklist de cierre, incidencias, auditoría y documentos). Este indicador no tiene detalle por registro en el panel.",
      odoo: null,
      panel: null,
      filas: [],
      total: 0,
    };
  }
  return null;
}
