import { callOdooRPC } from "@/lib/odoo";
import { dominioFechaEfectiva } from "@/lib/cxc/fechaConfirmacion";
import { RELACIONADA } from "@/lib/cxc/cobros";
import { esCarteraVieja } from "@/lib/cxc/carteraVieja";
import { esPlazoCredito } from "@/lib/cxc/credito";

/**
 * "Tiempo de cobro": cuántos días pasan desde que se emite una factura a
 * crédito hasta que el cliente la termina de pagar.
 *
 *   días = fecha del ÚLTIMO abono que la dejó en cero − fecha de la factura
 *
 * Entran las facturas que se terminaron de pagar DENTRO del período elegido,
 * sin importar cuándo se emitieron. Tomar las emitidas en el período sesgaría
 * los meses recientes: las que tardan más todavía no están pagadas y solo
 * aparecerían las rápidas.
 *
 * Fecha de cada abono: la FECHA DEL PAGO (`account.payment.date`), no la de
 * registro/confirmación que usa el resto de CxC: aquí se mide cuánto tardó el
 * cliente, y la confirmación suele llegar después (sep-2026 en Valencia: 271 de
 * 400 pagos, 2,4 días más tarde en promedio), que es demora interna. Un abono
 * que no es pago (nota de crédito, retención) se fecha por la conciliación. Por defecto solo facturas a crédito (plazo con días;
 * `tipo` suma las de contado, con plazo 0) que
 * recibieron al menos un pago real: una cerrada solo con nota de crédito no es
 * "el cliente pagó". Fuera Supricom, SUPER TECHNO y la cartera vieja (vencida
 * antes de 2025), como en los KPIs.
 */

/** Qué facturas mide: las de crédito (default, la de los KPIs), las de contado o todas. */
export type TipoCobro = "credito" | "contado" | "todos";
export const esTipoCobro = (v: unknown): v is TipoCobro => v === "credito" || v === "contado" || v === "todos";
const entra = (esCredito: boolean, tipo: TipoCobro) => tipo === "todos" || (tipo === "credito") === esCredito;
const nombreTipo = { credito: "a crédito", contado: "de contado", todos: "" } as const;

export interface FacturaCobrada {
  id: number;
  name: string;
  partnerId: number;
  cliente: string;
  vendedor: string;
  emision: string;
  /** Fecha del último abono (la que la dejó pagada). */
  pagada: string;
  dias: number;
  plazo: number;
  monto: number;
}

export interface Grupo {
  clave: string;
  facturas: number;
  monto: number;
  /** Promedio simple de días por factura (cada factura pesa igual). */
  promedioDias: number;
  /** Plazo promedio simple por factura. */
  plazoPromedio: number;
  /** Promedio de días ponderado por monto (las facturas grandes pesan más). */
  promedioPonderado: number;
  /** % de facturas pagadas dentro del plazo. */
  aTiempoPct: number;
}

export interface TiempoCobro {
  resumen: Grupo & { mediana: number };
  tramos: { label: string; facturas: number; monto: number; pct: number }[];
  porPlazo: (Grupo & { plazo: number })[];
  clientes: (Grupo & { partnerId: number })[];
  vendedores: Grupo[];
  facturas: FacturaCobrada[];
}

const PAGE = 5000;
const DIA_MS = 24 * 60 * 60 * 1000;
const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v || undefined);
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b.slice(0, 10) + "T00:00:00Z") - Date.parse(a.slice(0, 10) + "T00:00:00Z")) / DIA_MS);

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], { fields, order: "id asc", limit: PAGE, offset });
    out.push(...(page || []));
    if (!page || page.length < PAGE) break;
  }
  return out;
}

async function leer(model: string, ids: number[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    out.push(...((await callOdooRPC<any[]>(model, "read", [ids.slice(i, i + PAGE)], { fields })) || []));
  }
  return out;
}

export const TRAMOS = [
  { label: "0-7 días", max: 7 },
  { label: "8-15 días", max: 15 },
  { label: "16-30 días", max: 30 },
  { label: "31-45 días", max: 45 },
  { label: "46-60 días", max: 60 },
  { label: "61-90 días", max: 90 },
  { label: "Más de 90 días", max: Infinity },
];

// Misma fórmula en resumenDe() de la página (tiempo-cobro/page.tsx).
function agrupar(clave: string, fs: FacturaCobrada[]): Grupo {
  const monto = fs.reduce((s, f) => s + f.monto, 0);
  const prom = (campo: "dias" | "plazo") => (fs.length ? fs.reduce((s, f) => s + f[campo], 0) / fs.length : 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    clave,
    facturas: fs.length,
    monto: r2(monto),
    promedioDias: r2(prom("dias")),
    plazoPromedio: r2(prom("plazo")),
    promedioPonderado: r2(monto > 0 ? fs.reduce((s, f) => s + f.dias * f.monto, 0) / monto : 0),
    aTiempoPct: fs.length ? Math.round((fs.filter((f) => f.dias <= f.plazo).length / fs.length) * 1000) / 10 : 0,
  };
}

function porClave(fs: FacturaCobrada[], clave: (f: FacturaCobrada) => string) {
  const m = new Map<string, FacturaCobrada[]>();
  for (const f of fs) {
    const k = clave(f);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(f);
  }
  return m;
}

// Último abono de cada factura (fecha del pago; un abono que no es pago se
// fecha por la conciliación) y si alguno fue un pago real.
async function ultimosAbonos(conciliaciones: any[]): Promise<Map<number, { fecha: string; conPago: boolean }>> {
  const [lineasDebito, lineasCredito] = await Promise.all([
    leer("account.move.line", [...new Set(conciliaciones.map((c) => idDe(c.debit_move_id)!).filter(Boolean))], ["id", "move_id"]),
    leer("account.move.line", [...new Set(conciliaciones.map((c) => idDe(c.credit_move_id)!).filter(Boolean))], ["id", "payment_id"]),
  ]);
  const facturaDeLinea = new Map(lineasDebito.map((l) => [l.id, idDe(l.move_id)]));
  const pagoDeLinea = new Map(lineasCredito.filter((l) => idDe(l.payment_id)).map((l) => [l.id, idDe(l.payment_id)!]));
  const pagos = await leer("account.payment", [...new Set(pagoDeLinea.values())], ["id", "date"]);
  const fechaPago = new Map(pagos.map((p) => [p.id, String(p.date || "").slice(0, 10)]));

  const ultimo = new Map<number, { fecha: string; conPago: boolean }>();
  for (const c of conciliaciones) {
    const fid = facturaDeLinea.get(idDe(c.debit_move_id)!);
    const pagoId = pagoDeLinea.get(idDe(c.credit_move_id)!);
    const fecha = (pagoId && fechaPago.get(pagoId)) || (c.max_date ? String(c.max_date).slice(0, 10) : "");
    if (!fid || !fecha) continue;
    const u = ultimo.get(fid) || { fecha: "", conPago: false };
    if (fecha > u.fecha) u.fecha = fecha;
    if (pagoId) u.conPago = true;
    ultimo.set(fid, u);
  }
  return ultimo;
}

// Plazos a crédito (número en el nombre, esPlazoCredito) → días del nombre.
async function diasPlazoCredito(): Promise<Map<number, number>> {
  const plazos = await callOdooRPC<any[]>("account.payment.term", "search_read", [[]], { fields: ["id", "name"], context: { active_test: false } });
  const dias = new Map<number, number>();
  for (const p of plazos || []) {
    if (esPlazoCredito(p.name)) dias.set(p.id, parseInt(String(p.name).match(/\d+/)![0], 10));
  }
  return dias;
}

export async function calcularTiempoCobro(
  companyIds: number[],
  desde: string,
  hasta: string,
  tipo: TipoCobro = "credito",
): Promise<TiempoCobro> {
  // Conciliaciones desde el inicio del período de facturas que HOY están en
  // cero. La última de cada factura dice cuándo quedó pagada.
  const conciliaciones = await paginar(
    "account.partial.reconcile",
    [
      ["company_id", "in", companyIds],
      ["debit_move_id.move_id.move_type", "=", "out_invoice"],
      ["debit_move_id.move_id.state", "=", "posted"],
      ["debit_move_id.move_id.amount_residual", "=", 0],
      ["debit_move_id.move_id.partner_id.name", "not ilike", "supricom"],
      ["debit_move_id.move_id.commercial_partner_id.name", "not ilike", RELACIONADA],
      ...dominioFechaEfectiva(">=", desde),
    ],
    ["id", "max_date", "debit_move_id", "credit_move_id"],
  );

  // El dominio filtra por confirmación (siempre >= fecha del pago), así que
  // no se pierde ningún pago del período; los que sobran caen en el filtro de abajo.
  const ultimo = await ultimosAbonos(conciliaciones);
  // Pagada en el período: su último abono cae entre desde y hasta.
  const ids = [...ultimo].filter(([, u]) => u.conPago && u.fecha >= desde && u.fecha <= hasta).map(([id]) => id);

  const [moves, diasPlazo] = await Promise.all([
    leer("account.move", ids, ["id", "name", "partner_id", "invoice_date", "invoice_date_due",
      "invoice_payment_term_id", "amount_total_signed", "invoice_user_id"]),
    diasPlazoCredito(),
  ]);
  // Crédito = plazo con número en el nombre (esPlazoCredito, como el resto de
  // CxC). Pero los DÍAS del plazo salen del vencimiento de la factura: es lo
  // que define "a tiempo", y el nombre que devuelve la API (en inglés) quedó
  // viejo en varios plazos (ver nombresPlazos en lib/cxc/credito.ts).

  const facturas: FacturaCobrada[] = [];
  for (const m of moves) {
    const delNombre = diasPlazo.get(idDe(m.invoice_payment_term_id) ?? -1);
    if (!entra(delNombre !== undefined, tipo) || !m.invoice_date || esCarteraVieja(m.invoice_date_due)) continue;
    // Contado: plazo 0 (se paga al facturar); "a tiempo" = pagada el mismo día.
    const plazo = delNombre === undefined ? 0
      : m.invoice_date_due ? Math.max(0, diasEntre(m.invoice_date, m.invoice_date_due)) : delNombre;
    const pagada = ultimo.get(m.id)!.fecha;
    facturas.push({
      id: m.id,
      name: m.name || "",
      partnerId: idDe(m.partner_id) || 0,
      cliente: m.partner_id?.[1] || "Sin cliente",
      vendedor: m.invoice_user_id?.[1] || "Sin vendedor",
      emision: m.invoice_date,
      pagada,
      // Un abono anterior a la factura (anticipo) no da días negativos.
      dias: Math.max(0, diasEntre(m.invoice_date, pagada)),
      plazo,
      monto: Math.round(Number(m.amount_total_signed || 0) * 100) / 100,
    });
  }
  facturas.sort((a, b) => b.dias - a.dias);

  const ordenados = facturas.map((f) => f.dias).sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length === 0 ? 0
    : ordenados.length % 2 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2;
  const total = facturas.reduce((s, f) => s + f.monto, 0);

  const tramos = TRAMOS.map((t, i) => {
    const min = i === 0 ? 0 : TRAMOS[i - 1].max + 1;
    const fs = facturas.filter((f) => f.dias >= min && f.dias <= t.max);
    const monto = fs.reduce((s, f) => s + f.monto, 0);
    return { label: t.label, facturas: fs.length, monto: Math.round(monto * 100) / 100, pct: total > 0 ? Math.round((monto / total) * 1000) / 10 : 0 };
  });

  const clientesMap = porClave(facturas, (f) => String(f.partnerId));
  return {
    resumen: { ...agrupar("total", facturas), mediana },
    tramos,
    porPlazo: [...porClave(facturas, (f) => String(f.plazo))]
      .map(([k, fs]) => ({ ...agrupar(k === "0" ? "0 días (contado)" : `${k} días`, fs), plazo: Number(k) }))
      .sort((a, b) => a.plazo - b.plazo),
    clientes: [...clientesMap]
      .map(([k, fs]) => ({ ...agrupar(fs[0].cliente, fs), partnerId: Number(k) }))
      .sort((a, b) => b.monto - a.monto),
    vendedores: [...porClave(facturas, (f) => f.vendedor)]
      .map(([k, fs]) => agrupar(k, fs))
      .sort((a, b) => b.monto - a.monto),
    facturas,
  };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (fecha: string) => `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`;
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Por qué un cliente buscado no sale en el tiempo de cobro del período: mira
 * sus facturas de cliente en las sedes elegidas y lo explica con los mismos
 * criterios de calcularTiempoCobro (crédito, cartera vieja, pagada en el
 * período con un pago real, sin el grupo).
 */
export async function explicarAusencia(
  companyIds: number[],
  desde: string,
  hasta: string,
  texto: string,
  tipo: TipoCobro = "credito",
): Promise<{ cliente: string; motivo: string }[]> {
  const facturas = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["company_id", "in", companyIds],
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["partner_id.name", "ilike", texto],
    ]],
    { fields: ["id", "partner_id", "commercial_partner_id", "invoice_payment_term_id", "invoice_date_due", "amount_residual"], limit: 1000 },
  );
  if (!facturas?.length) return [];

  const diasPlazo = await diasPlazoCredito();
  const porCliente = new Map<number, any[]>();
  for (const f of facturas) {
    const k = idDe(f.partner_id) || 0;
    if (!porCliente.has(k)) porCliente.set(k, []);
    porCliente.get(k)!.push(f);
  }
  const clientes = [...porCliente.values()].slice(0, 5);

  const delTipo = (f: any) => entra(diasPlazo.has(idDe(f.invoice_payment_term_id) ?? -1), tipo);
  // Último abono de las facturas del tipo elegido ya pagadas.
  const pagadas = clientes.flat().filter(
    (f) => delTipo(f) && !esCarteraVieja(f.invoice_date_due) && Number(f.amount_residual) === 0,
  );
  const ultimo = pagadas.length
    ? await ultimosAbonos(await paginar("account.partial.reconcile", [["debit_move_id.move_id", "in", pagadas.map((f) => f.id)]], ["id", "max_date", "debit_move_id", "credit_move_id"]))
    : new Map<number, { fecha: string; conPago: boolean }>();

  return clientes.map((fs) => {
    const cliente = fs[0].partner_id?.[1] || "Sin cliente";
    const comercial = String(fs[0].commercial_partner_id?.[1] || "");
    if (/supricom/i.test(cliente) || comercial.toLowerCase().includes(RELACIONADA))
      return { cliente, motivo: "Es una empresa del grupo: no entra en el tiempo de cobro." };

    const t = nombreTipo[tipo];
    const delTipoCliente = fs.filter(delTipo);
    const vigentes = delTipoCliente.filter((f) => !esCarteraVieja(f.invoice_date_due));
    if (!delTipoCliente.length)
      return {
        cliente,
        motivo: tipo === "credito"
          ? `Solo tiene facturas de contado en esta sede (${plural(fs.length, "factura", "facturas")}): elige «Contado» o «Todas» arriba para verlo.`
          : `Solo tiene facturas a crédito en esta sede (${plural(fs.length, "factura", "facturas")}): elige «Crédito» o «Todas» arriba para verlo.`,
      };
    if (!vigentes.length)
      return { cliente, motivo: `Sus facturas${t ? " " + t : ""} vencieron antes de 2025 (cartera vieja): no cuentan.` };

    const partes: string[] = [];
    const conPago = vigentes.map((f) => ultimo.get(f.id)).filter((u) => u?.conPago) as { fecha: string }[];
    const enPeriodo = conPago.filter((u) => u.fecha >= desde && u.fecha <= hasta);
    if (enPeriodo.length) partes.push(`Terminó de pagar ${plural(enPeriodo.length, "factura", "facturas")} en el período: sale como «${cliente}».`);
    else if (conPago.length) {
      const meses = [...new Set(conPago.map((u) => u.fecha.slice(0, 7)))].sort().map((m) => mesDe(m));
      partes.push(`No terminó de pagar facturas${t ? " " + t : ""} en este período; lo hizo en ${lista(meses)}.`);
    }
    const soloNota = vigentes.filter((f) => Number(f.amount_residual) === 0 && !ultimo.get(f.id)?.conPago).length;
    if (soloNota) partes.push(`${plural(soloNota, "factura se cerró", "facturas se cerraron")} solo con nota de crédito (no cuentan).`);
    const pendientes = vigentes.filter((f) => Number(f.amount_residual) > 0).length;
    if (pendientes) partes.push(`Tiene ${plural(pendientes, `factura${t ? " " + t : ""}`, `facturas${t ? " " + t : ""}`)} sin terminar de pagar.`);
    return { cliente, motivo: partes.join(" ") || `No terminó de pagar facturas${t ? " " + t : ""} en este período.` };
  });
}
