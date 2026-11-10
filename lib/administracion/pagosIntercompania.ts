import { callOdooRPCEstricto } from "@/lib/odoo";
import { leerTodo, nombreM2o, idM2o, redondear } from "@/lib/administracion/lectura";
import {
  COMPANY_DE_SEDE,
  ILIKE_DE_SEDE,
  SedeIC,
  FacturaReceptor,
  buscarEquivalente,
  pendientePorPieza,
  Pieza,
  sedeDePartner,
} from "@/lib/administracion/pagosIntercompaniaCruce";

/**
 * Pagos entre sedes (Administracion › Pagos entre sedes).
 *
 * Una sede le paga a otra (Caracas a Valencia, sobre todo) y en su Odoo
 * aplica el pago a sus facturas de proveedor. La sede que cobra tiene que
 * aplicar el cobro a las mismas facturas, que en sus libros son facturas de
 * cliente. Antes se mandaba un Excel; aqui cada sede ve los pagos que hizo y
 * los que le hicieron, con las facturas a las que se aplicaron y, para cada
 * una, su factura equivalente en la otra sede y si alla sigue abierta.
 *
 * Solo lee Odoo. Se lee de las dos sedes del pago aunque el usuario de
 * Administracion sea de una sola: es justo lo que necesita ver, y solo salen
 * pagos en los que su sede paga o cobra.
 */

const SEDES: SedeIC[] = ["valencia", "caracas", "panama"];
const TODAS = SEDES.map((s) => COMPANY_DE_SEDE[s]);
const SEDE_DE_COMPANY: Record<number, SedeIC> = { 9: "valencia", 10: "caracas", 7: "panama" };

export type EstadoPagoIC = "sin_aplicar" | "por_aplicar" | "sin_equivalente" | "listo";

export interface DocumentoAplicado {
  documento: string;
  /** Enlace al documento en el Odoo de la sede que paga. */
  url: string;
  /** La ref de la factura de proveedor: el numero de la factura en la otra sede. */
  ref: string;
  tipo: string;
  fecha: string | null;
  total: number;
  aplicado: number;
  /** Lo que le queda en la sede que paga. */
  saldo: number;
  /** Lo de este pago que la sede que cobra todavia no aplico a la equivalente. */
  porAplicar: number;
  equivalente: (FacturaReceptor & { porMonto: boolean; url: string }) | null;
}

export interface PagoIC {
  id: number;
  numero: string;
  fecha: string;
  ref: string;
  diario: string;
  pagador: SedeIC;
  receptor: SedeIC;
  url: string;
  /** USD (moneda de la empresa). */
  monto: number;
  /** Moneda y monto del pago tal como se hizo (Bs en Caracas, a veces). */
  moneda: string;
  montoMoneda: number;
  /** Lo del pago que la sede que paga todavia no aplico a nada. */
  sinAplicar: number;
  documentos: DocumentoAplicado[];
  /** Comprobantes que la sede que paga adjunto al pago en Odoo (chatter del pago o de su asiento). */
  adjuntos: AdjuntoPago[];
  estado: EstadoPagoIC;
}

export interface AdjuntoPago {
  id: number;
  nombre: string;
  mimetype: string;
  tamano: number;
}

const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "").replace(/\/$/, "");
const enlace = (model: string, id: number, cid: number) =>
  `${ODOO}/web#id=${id}&model=${model}&view_type=form&cids=${cid}`;

const ES_FACTURA = new Set(["in_invoice", "in_refund", "out_invoice", "out_refund"]);

async function leerIds(model: string, ids: number[], fields: string[]): Promise<any[]> {
  let out: any[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const page =
      (await callOdooRPCEstricto<any[]>(model, "read", [ids.slice(i, i + 1000)], {
        fields,
        context: { allowed_company_ids: TODAS },
      })) || [];
    out = out.concat(page);
  }
  return out;
}

/**
 * Pagos entre sedes en los que participa alguna de `sedesUsuario` (pagando o
 * cobrando). `desde`/`hasta` null = todos.
 */
export async function pagosEntreSedes(
  sedesUsuario: number[],
  desde: string | null,
  hasta: string | null,
): Promise<PagoIC[]> {
  const nombre: any[] = ["|", "|"];
  for (const s of SEDES) nombre.push(["partner_id.commercial_partner_id.name", "ilike", ILIKE_DE_SEDE[s]]);
  const dominio: any[] = [
    ["company_id", "in", TODAS],
    ["state", "=", "posted"],
    ["payment_type", "=", "outbound"],
    ["is_internal_transfer", "=", false],
    ...nombre,
  ];
  if (desde) dominio.push(["date", ">=", desde]);
  if (hasta) dominio.push(["date", "<=", hasta]);

  const crudos = await leerTodo(
    "account.payment",
    dominio,
    ["name", "date", "ref", "journal_id", "company_id", "partner_id", "move_id", "amount_company_currency_signed", "amount", "currency_id"],
    TODAS,
    "date desc, id desc",
  );

  const pagos = crudos
    .map((p) => {
      const pagador = SEDE_DE_COMPANY[idM2o(p.company_id) ?? 0];
      // display_name del contacto: "Empresa, Contacto"; la empresa va primero.
      const receptor = sedeDePartner(nombreM2o(p.partner_id));
      return { p, pagador, receptor };
    })
    .filter(
      ({ pagador, receptor }) =>
        pagador &&
        receptor &&
        pagador !== receptor &&
        (sedesUsuario.includes(COMPANY_DE_SEDE[pagador]) || sedesUsuario.includes(COMPANY_DE_SEDE[receptor])),
    ) as { p: any; pagador: SedeIC; receptor: SedeIC }[];
  if (pagos.length === 0) return [];

  const adjuntosPorPago = await adjuntosDePagos(pagos.map(({ p }) => p));

  // Lineas por pagar/cobrar de cada pago y sus conciliaciones.
  const lineas = await leerTodo(
    "account.move.line",
    [
      ["payment_id", "in", pagos.map(({ p }) => p.id)],
      ["account_id.account_type", "in", ["liability_payable", "asset_receivable"]],
    ],
    ["payment_id", "matched_debit_ids", "matched_credit_ids", "amount_residual"],
    TODAS,
  );
  const parcialIds = [...new Set(lineas.flatMap((l) => [...l.matched_debit_ids, ...l.matched_credit_ids]))];
  const parciales = await leerIds("account.partial.reconcile", parcialIds, ["amount", "debit_move_id", "credit_move_id"]);
  const parcialPorId = new Map(parciales.map((x) => [x.id, x]));

  // Linea del pago -> [linea de la otra parte, monto, conciliacion]
  const contrapartes: { pagoId: number; lineaId: number; monto: number; parcialId: number }[] = [];
  const sinAplicar = new Map<number, number>();
  for (const l of lineas) {
    const pagoId = idM2o(l.payment_id)!;
    sinAplicar.set(pagoId, (sinAplicar.get(pagoId) || 0) + Math.abs(Number(l.amount_residual) || 0));
    for (const pid of [...l.matched_debit_ids, ...l.matched_credit_ids]) {
      const x = parcialPorId.get(pid);
      if (!x) continue;
      const otra = idM2o(x.debit_move_id) === l.id ? idM2o(x.credit_move_id) : idM2o(x.debit_move_id);
      if (otra) contrapartes.push({ pagoId, lineaId: otra, monto: Number(x.amount) || 0, parcialId: x.id });
    }
  }
  const lineasOtra = await leerIds("account.move.line", [...new Set(contrapartes.map((c) => c.lineaId))], ["move_id"]);
  const asientoDeLinea = new Map(lineasOtra.map((l) => [l.id, idM2o(l.move_id)!]));
  const asientos = await leerIds(
    "account.move",
    [...new Set(lineasOtra.map((l) => idM2o(l.move_id)!))],
    ["name", "ref", "move_type", "invoice_date", "date", "amount_total_signed", "amount_residual_signed"],
  );
  const asientoPorId = new Map(asientos.map((a) => [a.id, a]));

  // Facturas de cliente de cada sede que cobra, a la sede que paga.
  const pares = new Set(pagos.map(({ pagador, receptor }) => `${pagador}>${receptor}`));
  const candidatas = new Map<string, FacturaReceptor[]>();
  for (const par of pares) {
    const [pagador, receptor] = par.split(">") as SedeIC[];
    const filas = await leerTodo(
      "account.move",
      [
        ["company_id", "=", COMPANY_DE_SEDE[receptor]],
        ["state", "=", "posted"],
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["commercial_partner_id.name", "ilike", ILIKE_DE_SEDE[pagador]],
      ],
      ["name", "move_type", "invoice_date", "amount_total_signed", "amount_residual_signed", "payment_state", "commercial_partner_id"],
      [COMPANY_DE_SEDE[receptor]],
    );
    candidatas.set(
      par,
      filas
        .filter((f) => sedeDePartner(nombreM2o(f.commercial_partner_id)) === pagador)
        .map((f) => ({
          id: f.id,
          numero: String(f.name || ""),
          tipo: f.move_type,
          fecha: f.invoice_date || null,
          total: Math.abs(Number(f.amount_total_signed) || 0),
          saldo: Math.abs(Number(f.amount_residual_signed) || 0),
          estadoPago: String(f.payment_state || ""),
        })),
    );
  }

  const armados = pagos.map(({ p, pagador, receptor }) => {
    const porAsiento = new Map<number, number>();
    for (const c of contrapartes) {
      if (c.pagoId !== p.id) continue;
      const a = asientoDeLinea.get(c.lineaId);
      if (a) porAsiento.set(a, (porAsiento.get(a) || 0) + c.monto);
    }
    const documentos = [...porAsiento.entries()].map(([id, aplicado]) => {
      const a = asientoPorId.get(id) || {};
      const fecha = a.invoice_date || a.date || null;
      const total = Math.abs(Number(a.amount_total_signed) || 0);
      const ref = String(a.ref || "");
      const eq = ES_FACTURA.has(a.move_type)
        ? buscarEquivalente(ref, a.move_type, fecha, total, candidatas.get(`${pagador}>${receptor}`) || [])
        : null;
      return {
        documento: String(a.name || ""),
        url: enlace("account.move", id, COMPANY_DE_SEDE[pagador]),
        ref,
        tipo: String(a.move_type || ""),
        fecha,
        total: redondear(total),
        aplicado: redondear(aplicado),
        saldo: redondear(Math.abs(Number(a.amount_residual_signed) || 0)),
        porAplicar: 0,
        asientoId: id,
        parciales: contrapartes.filter((c) => c.pagoId === p.id && asientoDeLinea.get(c.lineaId) === id).map((c) => c.parcialId),
        equivalente: eq
          ? { ...eq.factura, porMonto: eq.porMonto, url: enlace("account.move", eq.factura.id, COMPANY_DE_SEDE[receptor]) }
          : null,
      };
    });
    documentos.sort((x, y) => (x.fecha || "").localeCompare(y.fecha || "") || x.documento.localeCompare(y.documento));

    return {
      id: p.id,
      numero: String(p.name || ""),
      fecha: String(p.date || ""),
      ref: String(p.ref || ""),
      diario: nombreM2o(p.journal_id),
      pagador,
      receptor,
      url: enlace("account.payment", p.id, COMPANY_DE_SEDE[pagador]),
      monto: redondear(Math.abs(Number(p.amount_company_currency_signed) || 0)),
      moneda: nombreM2o(p.currency_id, "USD"),
      montoMoneda: redondear(Math.abs(Number(p.amount) || 0)),
      sinAplicar: redondear(sinAplicar.get(p.id) || 0),
      documentos,
      adjuntos: adjuntosPorPago.get(p.id) || [],
    };
  });

  // Que falta aplicar en quien cobra, pago por pago: se cruzan las conciliaciones
  // de la factura en las dos sedes (todas, aunque el filtro de mes deje fuera
  // algun pago), no solo si la equivalente sigue con saldo.
  const docsConEq = armados.flatMap((x) => x.documentos).filter((d) => d.equivalente && ES_FACTURA.has(d.tipo));
  const piezasDe = async (asientos: number[]) => {
    const ls = await leerTodo(
      "account.move.line",
      [
        ["move_id", "in", asientos],
        ["account_id.account_type", "in", ["liability_payable", "asset_receivable"]],
      ],
      ["move_id", "matched_debit_ids", "matched_credit_ids"],
      TODAS,
    );
    const ids = [...new Set(ls.flatMap((l) => [...l.matched_debit_ids, ...l.matched_credit_ids]))];
    const xs = new Map((await leerIds("account.partial.reconcile", ids, ["amount", "max_date"])).map((x) => [x.id, x]));
    const out = new Map<number, Pieza[]>();
    for (const l of ls) {
      const lista = out.get(idM2o(l.move_id)!) || [];
      for (const pid of [...l.matched_debit_ids, ...l.matched_credit_ids]) {
        const x = xs.get(pid);
        if (x) lista.push({ id: x.id, monto: Number(x.amount) || 0, fecha: String(x.max_date || "") });
      }
      out.set(idM2o(l.move_id)!, lista);
    }
    return out;
  };
  const deQuienPaga = docsConEq.length ? await piezasDe([...new Set(docsConEq.map((d) => d.asientoId))]) : new Map();
  const deQuienCobra = docsConEq.length ? await piezasDe([...new Set(docsConEq.map((d) => d.equivalente!.id))]) : new Map();
  // Por factura equivalente: todos los pedazos que aplico quien paga en sus facturas que caen en ella.
  const pendientes = new Map<number, Map<number, number>>();
  for (const eqId of new Set(docsConEq.map((d) => d.equivalente!.id))) {
    const propias = [...new Set(docsConEq.filter((d) => d.equivalente!.id === eqId).map((d) => d.asientoId))];
    const piezas = [...new Map(propias.flatMap((a) => deQuienPaga.get(a) || []).map((x: Pieza) => [x.id, x])).values()];
    pendientes.set(eqId, pendientePorPieza(piezas, deQuienCobra.get(eqId) || []));
  }

  return armados.map((x) => {
    const documentos: DocumentoAplicado[] = x.documentos.map(({ asientoId, parciales: pids, ...d }) => {
      const pend = d.equivalente && ES_FACTURA.has(d.tipo) ? pendientes.get(d.equivalente.id) : undefined;
      const falta = pend ? pids.reduce((s, pid) => s + (pend.get(pid) ?? 0), 0) : 0;
      return { ...d, porAplicar: redondear(Math.min(falta, d.equivalente?.saldo ?? 0)) };
    });
    const facturas = documentos.filter((d) => ES_FACTURA.has(d.tipo));
    const estado: EstadoPagoIC =
      documentos.length === 0
        ? "sin_aplicar"
        : facturas.some((d) => d.porAplicar > 0.01)
          ? "por_aplicar"
          : facturas.some((d) => !d.equivalente)
            ? "sin_equivalente"
            : "listo";
    return { ...x, documentos, estado };
  });
}

/** Dominio de los adjuntos de unos pagos: en el pago o en su asiento (el chatter puede ser de cualquiera de los dos). */
function dominioAdjuntos(pagoIds: number[], asientoIds: number[]): any[] {
  return [
    "|",
    "&",
    ["res_model", "=", "account.payment"],
    ["res_id", "in", pagoIds],
    "&",
    ["res_model", "=", "account.move"],
    ["res_id", "in", asientoIds],
  ];
}

async function adjuntosDePagos(pagos: any[]): Promise<Map<number, AdjuntoPago[]>> {
  const pagoDeAsiento = new Map(pagos.map((p) => [idM2o(p.move_id) ?? 0, p.id as number]));
  const filas = await leerTodo(
    "ir.attachment",
    dominioAdjuntos(pagos.map((p) => p.id), [...pagoDeAsiento.keys()].filter(Boolean)),
    ["name", "mimetype", "file_size", "res_model", "res_id"],
    TODAS,
  );
  const out = new Map<number, AdjuntoPago[]>();
  for (const a of filas) {
    const pagoId = a.res_model === "account.payment" ? a.res_id : pagoDeAsiento.get(a.res_id);
    if (!pagoId) continue;
    const lista = out.get(pagoId) || [];
    lista.push({ id: a.id, nombre: String(a.name || "comprobante"), mimetype: String(a.mimetype || ""), tamano: Number(a.file_size) || 0 });
    out.set(pagoId, lista);
  }
  return out;
}

/**
 * Un comprobante de un pago entre sedes, solo si el pago es entre dos sedes y
 * una de ellas esta en `sedesUsuario` (la sede que cobra baja lo que adjunto la que paga).
 * null = no existe o no le toca.
 */
export async function comprobanteDePago(
  adjuntoId: number,
  sedesUsuario: number[],
): Promise<{ nombre: string; mimetype: string; datos: Buffer } | null> {
  const [a] =
    (await callOdooRPCEstricto<any[]>("ir.attachment", "read", [[adjuntoId]], {
      fields: ["name", "mimetype", "res_model", "res_id", "datas"],
      context: { allowed_company_ids: TODAS },
    })) || [];
  if (!a || !a.datas) return null;
  const dominio: any[] =
    a.res_model === "account.payment"
      ? [["id", "=", a.res_id]]
      : a.res_model === "account.move"
        ? [["move_id", "=", a.res_id]]
        : [];
  if (dominio.length === 0) return null;
  const [p] = await leerTodo("account.payment", [...dominio, ["company_id", "in", TODAS]], ["company_id", "partner_id"], TODAS);
  if (!p) return null;
  const pagador = SEDE_DE_COMPANY[idM2o(p.company_id) ?? 0];
  const receptor = sedeDePartner(nombreM2o(p.partner_id));
  if (!pagador || !receptor || pagador === receptor) return null;
  if (!sedesUsuario.includes(COMPANY_DE_SEDE[pagador]) && !sedesUsuario.includes(COMPANY_DE_SEDE[receptor])) return null;
  return {
    nombre: String(a.name || "comprobante"),
    mimetype: String(a.mimetype || "application/octet-stream"),
    datos: Buffer.from(String(a.datas), "base64"),
  };
}
