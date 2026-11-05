import { callOdooRPC } from "@/lib/odoo";
import { esIntercompania } from "@/lib/administracion/intercompania";
import { fetchFechasDePago } from "@/lib/administracion/saludFinanciera";
import { fetchTesoreriaAdmin, type CuentaTesoreria } from "@/lib/administracion/tesoreria";
import { CUENTA_ANTICIPOS_EMPLEADOS_POR_EMPRESA } from "@/lib/administracion/gestionAdministrativa";
import { cargarRefsAdminKpis, idsParaEmpresas, searchReadTodo } from "@/lib/administracion/odooRefs";
import { fetchCuentasGasto, fetchGastoReal, mesAnterior, rangoDelMes } from "@/lib/administracion/gastos";
import { query } from "@/lib/db";
import { detalleEfectividad } from "@/lib/cxc/efectividad";
import { efectividadDelMes } from "@/lib/cxc/cierreEfectividad";
import { cargarMetas } from "@/lib/administracion/metas";
import { hoyCaracas, sumarDias } from "@/lib/administracion/lectura";

/**
 * Detalle de una alerta del Top 10 (o de un indicador de las tablas) de Salud Administrativa: de donde sale en
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
  /** Barra de uso contra un tope (clientes excedidos: lo que debe contra su límite). */
  barra?: { usado: number; limite: number };
  /** El monto se marca en rojo (se pasa por mucho). */
  grave?: boolean;
  /** Por que esta asi (una cuenta de banco en negativo), resaltado debajo. */
  explicacion?: string;
  /** Registros que lo componen (los asientos que la dejaron en negativo, las facturas de un total). */
  hijos?: FilaDetalle[];
  /** Cuantos hijos hay en total, si se muestran menos. */
  totalHijos?: number;
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
// Un cliente que debe esto o mas por encima de su limite (0,5 = 50 %) sale en rojo.
const EXCESO_GRAVE = 0.5;
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

const usd = (n: number) => `$${redondo(n).toLocaleString("en-US")}`;

/**
 * Las cuentas de banco y caja disponibles; a las que estan en negativo se les
 * explica por que y se les cuelgan los asientos que las dejaron asi.
 */
async function filasDeCuentas(cuentas: CuentaTesoreria[]): Promise<FilaDetalle[]> {
  const disponibles = cuentas.filter((c) => c.clase === "disponible" && Math.abs(c.saldo) > 0.01).sort((a, b) => a.saldo - b.saldo);
  return Promise.all(
    disponibles.map(async (c) => {
      const fila: FilaDetalle = {
        texto: `${c.codigo} ${c.nombre}`,
        sub:
          `${c.sede} · en el banco ${usd(c.saldoBanco)}` +
          (Math.abs(c.pendiente) > 0.01 ? ` · cobros/pagos registrados sin conciliar (R/P) ${usd(c.pendiente)}` : ""),
        monto: redondo(c.saldo),
        url: urlRegistro("account.account", c.cuentaId),
      };
      return c.saldo < -0.01 ? { ...fila, ...(await porQueNegativa(c)) } : fila;
    }),
  );
}

const ASIENTOS_POR_CUENTA = 8;
// Una transferencia en bolivares cargada en un diario en dolares deja la diferencia aqui.
const RE_DIFERENCIAL = /diferencial cambiario/i;

/**
 * Por que una cuenta de banco esta en negativo y que asientos la dejaron asi:
 * los pagos registrados sin conciliar (R/P) mas grandes y, si la cuenta del
 * banco misma esta en negativo, sus apuntes negativos mas grandes.
 */
async function porQueNegativa(c: CuentaTesoreria): Promise<Pick<FilaDetalle, "explicacion" | "hijos" | "totalHijos">> {
  const campos = ["move_id", "date", "name", "ref", "partner_id", "balance", "company_id"];
  const [pendientes, delBanco] = await Promise.all([
    c.cuentasPendientes.length
      ? searchReadTodo(
          "account.move.line",
          [["account_id", "in", c.cuentasPendientes], ["parent_state", "=", "posted"], ["reconciled", "=", false]],
          campos,
        )
      : Promise.resolve([] as any[]),
    c.saldoBanco < -0.01
      ? callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [[["account_id", "=", c.cuentaId], ["parent_state", "=", "posted"], ["balance", "<", 0]]],
          { fields: campos, order: "balance asc", limit: ASIENTOS_POR_CUENTA },
        ).then((r) => r || [])
      : Promise.resolve([] as any[]),
  ]);
  const pagos = pendientes.filter((l) => Number(l.balance) < 0);
  const cobros = pendientes.filter((l) => Number(l.balance) > 0);
  const suma = (ls: any[]) => ls.reduce((t, l) => t + Number(l.balance), 0);
  const mayores = [...pagos].sort((a, b) => Number(a.balance) - Number(b.balance)).slice(0, ASIENTOS_POR_CUENTA);

  // Asientos de esos pagos que mandaron la diferencia a "Diferencial Cambiario".
  const movesId = [...new Set(mayores.map((l) => l.move_id?.[0]).filter(Boolean))];
  const conDiferencial = new Set<number>();
  if (movesId.length) {
    const otras = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[["move_id", "in", movesId]]],
      { fields: ["move_id", "account_id"], limit: 0 },
    );
    (otras || []).forEach((l) => RE_DIFERENCIAL.test(nombre(l.account_id)) && conDiferencial.add(l.move_id[0]));
  }

  const fila = (l: any, origen: string): FilaDetalle => {
    const enBs = conDiferencial.has(l.move_id?.[0]);
    return {
      texto: `${nombre(l.move_id)} · ${nombre(l.partner_id) || l.ref || l.name || "sin contacto"}`,
      sub:
        [origen, l.ref && nombre(l.partner_id) ? l.ref : "", typeof l.name === "string" && l.name !== l.ref ? l.name : ""].filter(Boolean).join(" · ") +
        (enBs ? " · parece un monto en bolívares cargado en dólares: la diferencia se fue a Diferencial Cambiario" : ""),
      fecha: l.date,
      monto: redondo(Number(l.balance)),
      url: l.move_id?.[0] ? urlRegistro("account.move", l.move_id[0], cid(l)) : null,
      grave: enBs,
    };
  };

  const partes: string[] = [];
  if (pagos.length) {
    partes.push(
      `Tiene ${pagos.length} pago${pagos.length === 1 ? "" : "s"} registrado${pagos.length === 1 ? "" : "s"} sin conciliar por ${usd(-suma(pagos))}` +
        ` contra ${cobros.length} cobro${cobros.length === 1 ? "" : "s"} sin conciliar por ${usd(suma(cobros))} y ${usd(c.saldoBanco)} en la cuenta del banco` +
        ` (último extracto: ${c.extracto.ultimo ? fechaLatina(c.extracto.ultimo) : "ninguno"}).`,
    );
  }
  if (conDiferencial.size) {
    partes.push(
      `${conDiferencial.size === 1 ? "Un asiento parece" : `${conDiferencial.size} asientos parecen`} un monto en bolívares cargado como dólares: hay que anularlo y rehacerlo con el monto correcto.`,
    );
  }
  if (delBanco.length) partes.push("La cuenta del banco misma está en negativo: hay apuntes directos contra ella que pasan lo que entró.");
  partes.push(
    pagos.length
      ? "Si los pagos son reales, al cargar y conciliar el extracto se ve qué cobro falta registrar; si no, hay pagos de más o duplicados."
      : "Revisa los apuntes de abajo.",
  );
  const hijos = [...mayores.map((l) => fila(l, "Pago sin conciliar")), ...delBanco.map((l) => fila(l, "Apunte en la cuenta del banco"))];
  return { explicacion: partes.join(" "), hijos, totalHijos: pagos.length + delBanco.length };
}

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

  if (alertaId.startsWith("gastos-")) return detalleGastos(alertaId.slice("gastos-".length), companyIds, mes);
  if (alertaId.startsWith("admin-")) {
    const d = await detalleGestion(alertaId.slice("admin-".length), companyIds, desde, hasta);
    if (d) return d;
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

    case "sf-dso": {
      // Mismo peso que el indicador: cada tramo de antiguedad por su punto medio (15/45/75/105 dias).
      const peso = (dias: number) => (dias <= 30 ? 15 : dias <= 60 ? 45 : dias <= 90 ? 75 : 105);
      const porCliente = new Map<string, { nombre: string; id: number; sede: number | null; vencido: number; ponderado: number; facturas: number }>();
      for (const f of await cxcPendientes(companyIds)) {
        const saldo = Number(f.amount_residual_signed);
        if (f.move_type !== "out_invoice" || saldo <= 0.01 || !f.invoice_date_due || f.invoice_date_due >= hoy) continue;
        const dias = Math.floor((Date.parse(hoy) - Date.parse(f.invoice_date_due)) / 86400000);
        const clave = `${cid(f)}:${f.partner_id?.[0]}`;
        const c = porCliente.get(clave) || { nombre: nombre(f.partner_id), id: f.partner_id?.[0], sede: cid(f), vencido: 0, ponderado: 0, facturas: 0 };
        c.vencido += saldo;
        c.ponderado += saldo * peso(dias);
        c.facturas += 1;
        porCliente.set(clave, c);
      }
      const totalPonderado = [...porCliente.values()].reduce((s, c) => s + c.ponderado, 0);
      const lista = [...porCliente.values()]
        .sort((a, b) => b.ponderado - a.ponderado)
        .map((c) => ({
          texto: c.nombre || "Sin cliente",
          sub:
            `${c.facturas} factura${c.facturas === 1 ? "" : "s"} vencida${c.facturas === 1 ? "" : "s"} · ${Math.round(c.ponderado / c.vencido)} días en promedio` +
            ` · pesa ${totalPonderado > 0 ? Math.round((c.ponderado / totalPonderado) * 1000) / 10 : 0}% del indicador`,
          monto: redondo(c.vencido),
          url: c.id ? urlRegistro("res.partner", c.id, c.sede) : null,
        }));
      return {
        origen:
          "Días promedio de la cartera vencida: cada factura vencida pesa por su saldo y por su tramo de antigüedad (1-30 días cuenta 15, 31-60 cuenta 45, 61-90 cuenta 75 y más de 90 cuenta 105). Aquí está por cliente, ordenado por cuánto sube el promedio: el de arriba es el que más días le suma.",
        odoo: { etiqueta: "Contabilidad › Clientes › Facturas", url: (await urlAccion("facturasCliente", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Cobrar", ruta: "/cuentas-por-cobrar" },
        ...recortar(lista),
      };
    }

    case "sf-cumplimiento_cobranza": {
      // Lo mismo que el modal de Efectividad de Cobranza de CxC: por cliente, lo que había que cobrar y lo cobrado.
      const fin = new Date(anio, m, 0);
      const corte = new Date();
      corte.setHours(23, 59, 59, 999);
      const { detalle } = await efectividadDelMes(companyIds, mes, fin, corte, () =>
        detalleEfectividad(companyIds, new Date(anio, m - 1, 1), fin, [], corte),
      );
      const r = detalle.resumen;
      const lista = detalle.clientes
        .filter((c) => c.falta > 0.01)
        .map((c) => ({
          texto: c.nombre,
          sub: `Había que cobrar ${redondo(c.porCobrar).toLocaleString("en-US")} · cobrado ${redondo(c.cobrado).toLocaleString("en-US")}${c.vendedor ? ` · ${c.vendedor}` : ""}`,
          monto: redondo(c.falta),
          url: c.partnerId ? urlRegistro("res.partner", c.partnerId) : null,
        }));
      return {
        origen:
          `Es la tarjeta Efectividad de Cobranza de Cuentas por Cobrar: de lo que había que cobrar en el mes (${redondo(r.venciaAntes).toLocaleString("en-US")} ya vencido al empezar el mes + ${redondo(r.vencioEnElMes).toLocaleString("en-US")} que se venció en el mes` +
          (r.notasCredito > 0 ? ` − ${redondo(r.notasCredito).toLocaleString("en-US")} de notas de crédito` : "") +
          `), cuánto se cobró: ${redondo(r.cobrado).toLocaleString("en-US")}. Solo crédito, sin Supricom ni SUPER TECHNO; un mes cerrado sale de la foto de cierre. Aquí están los clientes con lo que les falta pagar.`,
        odoo: { etiqueta: "Contabilidad › Clientes › Facturas", url: (await urlAccion("facturasCliente", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Cuentas por Cobrar", ruta: "/cuentas-por-cobrar" },
        ...recortar(lista),
      };
    }

    case "sf-cartera_vencida":
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

    case "sf-cobros_esperados": {
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
          "Facturas de cliente que vencen en el mes y todavía tienen saldo, sin empresas del grupo: es lo que falta por cobrar de lo esperado. El indicador compara lo cobrado de esas facturas contra lo que vencía en el mes.",
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
        .map((p) => {
          const debe = Number(p.credit);
          const limite = Number(p.credit_limit);
          const exceso = debe - limite;
          return {
            texto: p.display_name,
            sub: `Debe ${redondo(debe).toLocaleString("en-US")} con límite de ${redondo(limite).toLocaleString("en-US")} · se pasa ${Math.round((exceso / limite) * 100)}%`,
            monto: redondo(exceso),
            url: urlRegistro("res.partner", p.id, p.sede),
            barra: { usado: redondo(debe), limite: redondo(limite) },
            grave: exceso >= limite * EXCESO_GRAVE,
          };
        })
        .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
      return {
        origen:
          `Clientes con límite de crédito cargado (ficha del contacto › Contabilidad) cuyo total por cobrar lo pasa. La barra es lo que deben contra su límite (la raya es el límite) y el monto, cuánto se pasan; en rojo los que se pasan ${EXCESO_GRAVE * 100}% o más del límite.`,
        odoo: { etiqueta: "Contabilidad › Clientes › Clientes", url: (await urlAccion("clientes", "res.partner", companyIds)) || "" },
        panel: null,
        ...recortar(lista),
      };
    }

    case "sf-disponibilidad_bancaria": {
      const tes = await fetchTesoreriaAdmin(companyIds, hoy, desde, hasta);
      const lista = await filasDeCuentas(tes.cuentas);
      return {
        origen:
          "El disponible es el saldo en libros de cada cuenta de banco y caja: lo de la cuenta del banco más los cobros y pagos registrados que todavía no se concilian con un extracto (R/P). Las cuentas en negativo traen por qué y los asientos que las dejaron así.",
        odoo: { etiqueta: "Contabilidad › Tablero", url: (await urlAccion("tablero", "account.journal", companyIds)) || "" },
        panel: { etiqueta: "Tesorería y Bancos", ruta: "/administracion/tesoreria" },
        ...recortar(lista),
      };
    }

    case "sf-cobertura_caja_30d":
    case "sf-flujo_proyectado_30d": {
      const flujo = alertaId === "sf-flujo_proyectado_30d";
      const hasta30 = sumarDias(hoy, 30);
      const [tes, cxp, cxc] = await Promise.all([
        fetchTesoreriaAdmin(companyIds, hoy, desde, hasta),
        cxpPendientes(companyIds),
        flujo ? cxcPendientes(companyIds) : Promise.resolve([] as any[]),
      ]);
      const cuentas = await filasDeCuentas(tes.cuentas);
      const debe = (f: any) => -Number(f.amount_residual_signed);
      const factura = (f: any, vence: string) => filaFactura(f, vence, debe(f));
      const vencidas = cxp.filter((f) => f.invoice_date_due && f.invoice_date_due < hoy).sort((a, b) => debe(b) - debe(a));
      const proximas = cxp
        .filter((f) => f.invoice_date_due && f.invoice_date_due >= hoy && f.invoice_date_due <= hasta30)
        .sort((a, b) => debe(b) - debe(a));
      const suma = (fs: any[], m: (f: any) => number) => redondo(fs.reduce((t, f) => t + m(f), 0));
      const HIJOS = 15;
      const grupo = (texto: string, sub: string, monto: number, hijos: FilaDetalle[]): FilaDetalle => ({
        texto,
        sub,
        monto,
        hijos: hijos.slice(0, HIJOS),
        totalHijos: hijos.length,
      });
      const filas: FilaDetalle[] = [
        grupo(
          "Caja disponible",
          `${tes.cuentas.filter((c) => c.clase === "disponible").length} cuentas de banco y caja; las que están en negativo dicen por qué`,
          redondo(tes.resumen.disponible),
          cuentas,
        ),
      ];
      if (flujo) {
        const porCobrar = cxc
          .filter((f) => f.move_type === "out_invoice" && Number(f.amount_residual_signed) > 0.01 && f.invoice_date_due && f.invoice_date_due >= hoy)
          .sort((a, b) => Number(b.amount_residual_signed) - Number(a.amount_residual_signed));
        filas.push(
          grupo(
            "+ Por cobrar no vencido",
            `${porCobrar.length} facturas de cliente que todavía no vencen (el indicador resta los saldos a favor de cada cliente)`,
            suma(porCobrar, (f) => Number(f.amount_residual_signed)),
            porCobrar.map((f) => filaFactura(f, `Vence ${fechaLatina(f.invoice_date_due)}`, Number(f.amount_residual_signed))),
          ),
        );
      }
      filas.push(
        grupo(
          `${flujo ? "− " : ""}Por pagar ya vencido`,
          `${vencidas.length} facturas de proveedor vencidas (las sin condición de pago vencen el día de la factura)`,
          flujo ? -suma(vencidas, debe) : suma(vencidas, debe),
          vencidas.map((f) => factura(f, `Venció ${fechaLatina(f.invoice_date_due)}${f.invoice_payment_term_id ? "" : " · sin condición de pago"}`)),
        ),
        grupo(
          `${flujo ? "− " : ""}Por pagar en los próximos 30 días`,
          `${proximas.length} facturas de proveedor que vencen hasta el ${fechaLatina(hasta30)}`,
          flujo ? -suma(proximas, debe) : suma(proximas, debe),
          proximas.map((f) => factura(f, `Vence ${fechaLatina(f.invoice_date_due)}`)),
        ),
      );
      return {
        origen: flujo
          ? "Flujo a 30 días = caja disponible + lo que hay por cobrar no vencido − lo que hay por pagar (vencido y lo que vence en 30 días), sin empresas del grupo. Abre cada parte para ver lo que la compone."
          : "Cobertura = caja disponible ÷ lo que hay por pagar (vencido y lo que vence en 30 días), sin empresas del grupo. Abre cada parte para ver lo que la compone.",
        odoo: { etiqueta: "Contabilidad › Proveedores › Facturas", url: (await urlAccion("facturasProveedor", "account.move", companyIds)) || "" },
        panel: { etiqueta: "Tesorería y Bancos", ruta: "/administracion/tesoreria" },
        filas,
        total: filas.length,
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

  if (/^(sf|admin)-/.test(alertaId)) {
    return {
      origen: "Este indicador no tiene detalle por registro: o todavía no tiene fuente de datos en Odoo, o se calcula con totales. La fórmula está en la tabla del índice.",
      odoo: null,
      panel: null,
      filas: [],
      total: 0,
    };
  }
  return null;
}

/**
 * Gastos y Presupuesto: las cuentas de gasto del mes con su presupuesto (o, en
 * la alerta de una cuenta, los apuntes de esa cuenta). Mismo criterio que
 * /api/administracion/gastos.
 */
async function detalleGastos(kpi: string, companyIds: number[], mes: string): Promise<DetalleAlerta> {
  const cuentas = await fetchCuentasGasto(companyIds);
  const rango = rangoDelMes(mes);
  const { porCuenta: real, detalles } = await fetchGastoReal(companyIds, rango.desde, rango.hasta, cuentas);
  const panel = { etiqueta: "Gastos y Presupuesto", ruta: "/administracion/gastos" };
  const odoo = { etiqueta: "Contabilidad › Apuntes contables", url: (await urlAccion("apuntes", "account.move.line", companyIds)) || "" };

  // Alerta de una cuenta puntual: sus apuntes del mes.
  if (kpi.startsWith("cuenta-")) {
    const codigo = kpi.slice("cuenta-".length);
    const lista = detalles
      .filter((d) => d.cuentaCodigo === codigo)
      .sort((a, b) => b.monto - a.monto)
      .map((d) => ({
        texto: `${d.proveedor} · ${d.factura}`,
        sub: [d.concepto, d.referencia, d.diario].filter(Boolean).join(" · "),
        fecha: d.fecha,
        monto: redondo(d.monto),
        url: d.moveId ? urlRegistro("account.move", d.moveId) : null,
      }));
    return {
      origen: `Apuntes publicados del mes en la cuenta ${codigo} (${cuentas.find((c) => c.codigo === codigo)?.nombre || ""}).`,
      odoo,
      panel,
      ...recortar(lista),
    };
  }

  const presupuesto: Record<string, number> = {};
  try {
    const rows = await query(
      `SELECT cuenta_codigo, SUM(monto) AS monto FROM presupuesto_gastos
        WHERE company_id IN (${companyIds.map(() => "?").join(",")}) AND mes = ? GROUP BY cuenta_codigo`,
      [...companyIds, mes],
    );
    (rows.rows as any[]).forEach((r) => {
      if (Number(r.monto) > 0) presupuesto[r.cuenta_codigo] = Number(r.monto);
    });
  } catch {
    // Sin la tabla todavia: todo sale sin presupuesto, como en el indicador.
  }
  const anterior = rangoDelMes(mesAnterior(mes, 1));
  const { porCuenta: previo } = await fetchGastoReal(companyIds, anterior.desde, anterior.hasta, cuentas);
  let antes3: Record<string, number> = {};
  if (kpi === "gastos_extraordinarios") {
    antes3 = (await fetchGastoReal(companyIds, rangoDelMes(mesAnterior(mes, 3)).desde, anterior.hasta, cuentas)).porCuenta;
  }

  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  const codigos = [...new Set([...Object.keys(real), ...Object.keys(presupuesto)])].filter((c) => {
    if (kpi === "gastos_sin_presupuesto") return (real[c] || 0) !== 0 && !presupuesto[c];
    if (kpi === "gastos_extraordinarios") return (real[c] || 0) !== 0 && !antes3[c];
    if (kpi === "variacion_mensual_gasto") return (real[c] || 0) !== 0 || (previo[c] || 0) !== 0;
    return true;
  });
  const lista = codigos
    .map((c) => {
      const r = real[c] || 0;
      const pres = presupuesto[c] || 0;
      const prev = previo[c] || 0;
      const sub =
        kpi === "variacion_mensual_gasto"
          ? `Mes anterior ${redondo(prev).toLocaleString("en-US")} · diferencia ${redondo(r - prev).toLocaleString("en-US")}`
          : kpi === "gastos_extraordinarios"
            ? "Sin movimiento en los 3 meses anteriores"
            : pres
              ? `Presupuesto ${redondo(pres).toLocaleString("en-US")} · ${redondo((r / pres) * 100)}% ejecutado`
              : "Sin presupuesto cargado";
      const cuenta = porCodigo.get(c);
      return {
        texto: `${c} ${cuenta?.nombre || ""}`.trim(),
        sub,
        monto: redondo(kpi === "variacion_mensual_gasto" ? r - prev : r),
        url: cuenta ? urlRegistro("account.account", cuenta.id) : null,
        orden: kpi === "variacion_mensual_gasto" ? Math.abs(r - prev) : kpi === "desviacion_gastos" ? r - pres : r,
      };
    })
    .sort((a, b) => b.orden - a.orden)
    .map(({ orden: _orden, ...f }) => f);
  const ORIGEN: Record<string, string> = {
    ejecucion_presupuestaria: "Gasto real del mes por cuenta (apuntes publicados en cuentas de gasto, grupo 6) contra el presupuesto cargado en el panel.",
    desviacion_gastos: "Gasto real del mes por cuenta contra su presupuesto; arriba las que más se pasan.",
    gastos_sin_presupuesto: "Cuentas con gasto en el mes que no tienen presupuesto cargado en el panel.",
    gastos_extraordinarios: "Cuentas con gasto este mes y sin movimiento en los 3 meses anteriores (gasto no recurrente; Odoo no marca qué es extraordinario).",
    variacion_mensual_gasto: "Gasto por cuenta este mes contra el mes anterior; el monto es la diferencia.",
  };
  return {
    origen: ORIGEN[kpi] || ORIGEN.ejecucion_presupuestaria,
    odoo,
    panel,
    ...recortar(lista),
  };
}

const ESTADO_SOLICITUD: Record<string, string> = {
  new: "Nueva",
  pending: "Pendiente",
  approved: "Aprobada",
  refused: "Rechazada",
  cancel: "Cancelada",
};
const diasDesde = (a: string, b?: string) =>
  Math.max(0, Math.round(((b ? Date.parse(b.replace(" ", "T") + "Z") : Date.now()) - Date.parse(a.replace(" ", "T") + "Z")) / 86400000));

/**
 * Gestion Administrativa y Cumplimiento y Control: solicitudes de aprobacion,
 * tickets de incidencias y tareas de los proyectos de cierre y auditoria, con
 * el mismo dominio que cada indicador (lib/administracion/gestionAdministrativa.ts
 * y cumplimientoControl.ts). null = ese indicador no tiene registros que listar.
 */
async function detalleGestion(kpi: string, companyIds: number[], desdeDia: string, hastaDia: string): Promise<DetalleAlerta | null> {
  const desde = `${desdeDia} 00:00:00`;
  const hasta = `${hastaDia} 23:59:59`;
  if (!["documentos_procesados_a_tiempo", "tiempo_promedio_procesamiento", "operaciones_fuera_politica", "incidencias_vencidas", "cumplimiento_cierre_mensual", "auditoria_cerrados", "reincidencias"].includes(kpi)) {
    return null;
  }
  const refs = await cargarRefsAdminKpis();
  const vacio = (origen: string): DetalleAlerta => ({ origen, odoo: null, panel: null, filas: [], total: 0 });

  if (kpi === "documentos_procesados_a_tiempo" || kpi === "tiempo_promedio_procesamiento") {
    const categorias = idsParaEmpresas(refs.categoriaSolicitudAdministrativaPorEmpresa, companyIds);
    if (!categorias.length) return vacio("No se encontró la categoría de aprobación «Solicitud Administrativa» de esta sede en Odoo.");
    const metas = await cargarMetas(companyIds[0]);
    const plazo = metas.plazo_procesamiento_dias;
    const [procesadas, pendientes] = await Promise.all([
      searchReadTodo(
        "approval.request",
        [["category_id", "in", categorias], ["request_status", "in", ["approved", "refused"]], ["create_date", ">=", desde], ["create_date", "<=", hasta]],
        ["name", "request_owner_id", "request_status", "create_date", "write_date", "company_id"],
      ),
      searchReadTodo(
        "approval.request",
        [["category_id", "in", categorias], ["request_status", "in", ["new", "pending"]]],
        ["name", "request_owner_id", "request_status", "create_date", "company_id"],
      ),
    ]);
    const lista: (FilaDetalle & { orden: number })[] = [
      ...pendientes.map((r) => {
        const dias = diasDesde(r.create_date);
        return {
          texto: `${r.name} · ${nombre(r.request_owner_id) || "—"}`,
          sub: `${ESTADO_SOLICITUD[r.request_status] || r.request_status} hace ${dias} días` + (plazo !== null && dias > plazo ? " · fuera de plazo" : ""),
          fecha: String(r.create_date).slice(0, 10),
          url: urlRegistro("approval.request", r.id, cid(r)),
          orden: 1e6 + dias,
        };
      }),
      ...procesadas.map((r) => {
        const dias = diasDesde(r.create_date, r.write_date);
        return {
          texto: `${r.name} · ${nombre(r.request_owner_id) || "—"}`,
          sub: `${ESTADO_SOLICITUD[r.request_status] || r.request_status} en ${dias} días` + (plazo !== null && dias > plazo ? " · fuera de plazo" : ""),
          fecha: String(r.create_date).slice(0, 10),
          url: urlRegistro("approval.request", r.id, cid(r)),
          orden: dias,
        };
      }),
    ];
    return {
      origen: `Solicitudes de la categoría «Solicitud Administrativa» (Aprobaciones de Odoo): las creadas en el mes ya aprobadas o rechazadas, con cuánto tardaron (de la creación al último cambio), y arriba las pendientes.${plazo !== null ? ` Plazo interno: ${plazo} días.` : ""}`,
      odoo: null,
      panel: null,
      ...recortar(lista.sort((a, b) => b.orden - a.orden).map(({ orden: _o, ...f }) => f)),
    };
  }

  if (kpi === "operaciones_fuera_politica") {
    const categorias = idsParaEmpresas(refs.categoriaOperacionesFueraPoliticaPorEmpresa, companyIds);
    if (!categorias.length) return vacio("No se encontró la categoría de aprobación «Excepción de Política» de esta sede en Odoo.");
    const filas = await searchReadTodo(
      "approval.request",
      [["category_id", "in", categorias], ["create_date", ">=", desde], ["create_date", "<=", hasta]],
      ["name", "request_owner_id", "request_status", "create_date", "company_id"],
    );
    return {
      origen: "Solicitudes de la categoría «Excepción de Política» (Aprobaciones de Odoo) creadas en el mes, en cualquier estado: que exista la solicitud ya es la excepción.",
      odoo: null,
      panel: null,
      ...recortar(
        filas.map((r) => ({
          texto: `${r.name} · ${nombre(r.request_owner_id) || "—"}`,
          sub: ESTADO_SOLICITUD[r.request_status] || r.request_status,
          fecha: String(r.create_date).slice(0, 10),
          url: urlRegistro("approval.request", r.id, cid(r)),
        })),
      ),
    };
  }

  if (kpi === "incidencias_vencidas") {
    const equipos = idsParaEmpresas(refs.equipoIncidenciasAdministrativasPorEmpresa, companyIds);
    if (!equipos.length) return vacio("No se encontró el equipo de Soporte «Incidencias Administrativas» de esta sede en Odoo.");
    const tickets = await searchReadTodo(
      "helpdesk.ticket",
      [["team_id", "in", equipos], ["close_date", "=", false]],
      ["name", "stage_id", "user_id", "create_date", "sla_fail", "company_id"],
    );
    return {
      origen: "Tickets abiertos del equipo «Incidencias Administrativas» (Soporte de Odoo); arriba los que ya pasaron su SLA.",
      odoo: null,
      panel: null,
      ...recortar(
        tickets
          .sort((a, b) => Number(b.sla_fail) - Number(a.sla_fail) || String(a.create_date).localeCompare(String(b.create_date)))
          .map((t) => ({
            texto: t.name,
            sub: `${nombre(t.stage_id)} · ${nombre(t.user_id) || "sin asignar"}${t.sla_fail ? " · SLA vencido" : ""}`,
            fecha: String(t.create_date).slice(0, 10),
            url: urlRegistro("helpdesk.ticket", t.id, cid(t)),
          })),
      ),
    };
  }

  // Tareas de los proyectos de Cierre Mensual y Auditoria Interna (compartidos entre sedes: company_id puede venir vacio).
  const cierre = kpi === "cumplimiento_cierre_mensual";
  const proyecto = cierre ? refs.proyectoCierreMensual : refs.proyectoAuditoriaInterna;
  if (proyecto === null) return vacio(`No se encontró el proyecto «${cierre ? "Cierre Mensual" : "Auditoría Interna"}» en Odoo.`);
  const tareas = await searchReadTodo(
    "project.task",
    [
      ["project_id", "=", proyecto],
      "|",
      ["company_id", "=", false],
      ["company_id", "in", companyIds],
      [cierre ? "date_deadline" : "create_date", ">=", desde],
      [cierre ? "date_deadline" : "create_date", "<=", hasta],
    ],
    ["name", "stage_id", "date_deadline", "create_date", "tag_ids", "company_id"],
  );
  const lista = tareas
    .filter((t) => kpi !== "reincidencias" || (refs.tagReincidencia !== null && (t.tag_ids || []).includes(refs.tagReincidencia)))
    .map((t) => ({
      texto: t.name,
      sub: nombre(t.stage_id) + (cierre && t.date_deadline ? ` · fecha límite ${fechaLatina(t.date_deadline)}` : ""),
      fecha: String(cierre ? t.date_deadline : t.create_date).slice(0, 10),
      url: urlRegistro("project.task", t.id, cid(t) ?? companyIds[0]),
    }));
  return {
    origen: cierre
      ? "Tareas del proyecto «Cierre Mensual» (Proyecto de Odoo) con fecha límite en el mes: a tiempo = llegaron a «Cerrado» antes de su fecha límite."
      : kpi === "reincidencias"
        ? "Hallazgos del proyecto «Auditoría Interna» creados en el mes con la etiqueta «Reincidencia»."
        : "Hallazgos del proyecto «Auditoría Interna» (Proyecto de Odoo) creados en el mes y su etapa.",
    odoo: null,
    panel: null,
    ...recortar(lista),
  };
}
