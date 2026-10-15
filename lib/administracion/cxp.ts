import {
  RE_INTERCOMPANIA,
  diasEntre,
  idM2o,
  leerTodo,
  nombreM2o,
  redondear,
  sumarDias,
} from "@/lib/administracion/lectura";
import { empresaDeCompanyId } from "@/lib/administracion/empresas";

/**
 * Cuentas por Pagar del rol Administracion: lo que se le debe a proveedores,
 * por antiguedad y por semana de vencimiento, mas lo que esta en borrador.
 *
 * Montos SIEMPRE en la moneda de la empresa (USD): `*_signed`. Caracas tiene
 * facturas de proveedor en bolivares y `amount_residual` las sumaria como
 * dolares (ver fetchCxP en saludFinanciera.ts). La moneda de origen se
 * muestra aparte.
 *
 * `payment_state = in_payment` cuenta como pagada: el pago esta registrado y
 * solo falta conciliarlo con el banco (eso lo muestra Tesoreria).
 */

export const BANDAS = ["corriente", "1_30", "31_60", "61_90", "91_mas"] as const;
export type Banda = (typeof BANDAS)[number];

export interface DocumentoCxP {
  id: number;
  numero: string;
  referencia: string;
  tipo: "factura" | "nota_credito";
  proveedor: string;
  proveedorId: number | null;
  sede: string;
  fecha: string;
  vence: string;
  diasVencido: number;
  banda: Banda;
  total: number;
  saldo: number;
  moneda: string;
  /** Saldo en la moneda del documento, si no es USD. */
  saldoMonedaOrigen: number | null;
  sinCondicionPago: boolean;
  intercompania: boolean;
}

export interface ProveedorCxP {
  proveedor: string;
  proveedorId: number | null;
  intercompania: boolean;
  documentos: number;
  saldo: number;
  vencido: number;
  bandas: Record<Banda, number>;
  venceMasViejo: string;
}

export interface SemanaCxP {
  desde: string;
  hasta: string;
  monto: number;
  documentos: number;
}

export interface BorradorCxP {
  id: number;
  numero: string;
  referencia: string;
  proveedor: string;
  sede: string;
  fecha: string;
  total: number;
  diasEnBorrador: number;
}

export interface PagoProveedor {
  id: number;
  fecha: string;
  proveedor: string;
  diario: string;
  monto: number;
  sede: string;
}

export interface DatosCxPAdmin {
  resumen: {
    saldo: number;
    vencido: number;
    porVencer7: number;
    porVencer30: number;
    notasCredito: number;
    intercompania: number;
    proveedores: number;
    documentos: number;
    sinCondicionPago: { documentos: number; monto: number };
    pagadoEnElMes: number;
  };
  bandas: Record<Banda, number>;
  proveedores: ProveedorCxP[];
  calendario: SemanaCxP[];
  documentos: DocumentoCxP[];
  borradores: BorradorCxP[];
  pagosDelMes: PagoProveedor[];
}

function bandaDe(diasVencido: number): Banda {
  if (diasVencido <= 0) return "corriente";
  if (diasVencido <= 30) return "1_30";
  if (diasVencido <= 60) return "31_60";
  if (diasVencido <= 90) return "61_90";
  return "91_mas";
}

const bandasEnCero = (): Record<Banda, number> => ({
  corriente: 0,
  "1_30": 0,
  "31_60": 0,
  "61_90": 0,
  "91_mas": 0,
});

/** Lunes de la semana de `fecha`. */
function lunesDe(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  const dia = d.getUTCDay() || 7;
  return sumarDias(fecha, 1 - dia);
}

export async function fetchCxPAdmin(
  companyIds: number[],
  hoy: string,
  desde: string,
  hasta: string,
  sinIntercompania = false,
): Promise<DatosCxPAdmin> {
  const [abiertos, borradoresRaw, pagosRaw] = await Promise.all([
    leerTodo(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "in", ["in_invoice", "in_refund"]],
        ["state", "=", "posted"],
        ["payment_state", "not in", ["paid", "in_payment", "reversed"]],
      ],
      [
        "name",
        "ref",
        "move_type",
        "partner_id",
        "company_id",
        "invoice_date",
        "invoice_date_due",
        "invoice_payment_term_id",
        "amount_total_signed",
        "amount_residual_signed",
        "amount_residual",
        "currency_id",
      ],
      companyIds,
    ),
    leerTodo(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "in", ["in_invoice", "in_refund"]],
        ["state", "=", "draft"],
      ],
      ["name", "ref", "partner_id", "company_id", "invoice_date", "create_date", "amount_total_signed"],
      companyIds,
    ),
    leerTodo(
      "account.payment",
      [
        ["company_id", "in", companyIds],
        ["partner_type", "=", "supplier"],
        ["payment_type", "=", "outbound"],
        ["is_internal_transfer", "=", false],
        ["state", "=", "posted"],
        ["date", ">=", desde],
        ["date", "<=", hasta],
      ],
      ["date", "partner_id", "journal_id", "amount_company_currency_signed", "company_id"],
      companyIds,
      "date desc, id desc",
    ),
  ]);

  const documentos: DocumentoCxP[] = abiertos
    .map((f: any) => {
      // in_invoice: residual_signed negativo (le debemos); in_refund: positivo
      // (nos deben). "Saldo" = lo que hay que pagar, con la NC restando.
      const saldo = redondear(-(Number(f.amount_residual_signed) || 0));
      const vence = f.invoice_date_due || f.invoice_date || "";
      const diasVencido = vence ? diasEntre(vence, hoy) : 0;
      const proveedor = nombreM2o(f.partner_id, "Sin proveedor");
      const moneda = nombreM2o(f.currency_id, "USD");
      return {
        id: f.id,
        numero: f.name || "",
        referencia: f.ref || "",
        tipo: f.move_type === "in_refund" ? ("nota_credito" as const) : ("factura" as const),
        proveedor,
        proveedorId: idM2o(f.partner_id),
        sede: empresaDeCompanyId(idM2o(f.company_id) || 0),
        fecha: f.invoice_date || "",
        vence,
        diasVencido,
        banda: bandaDe(diasVencido),
        total: redondear(Math.abs(Number(f.amount_total_signed) || 0)),
        saldo,
        moneda,
        saldoMonedaOrigen: moneda !== "USD" ? redondear(Math.abs(Number(f.amount_residual) || 0)) : null,
        sinCondicionPago: !f.invoice_payment_term_id,
        intercompania: RE_INTERCOMPANIA.test(proveedor),
      };
    })
    .filter((d) => Math.abs(d.saldo) > 0.01 && !(sinIntercompania && d.intercompania))
    .sort((a, b) => (a.vence || "9999").localeCompare(b.vence || "9999"));

  const bandas = bandasEnCero();
  const porProveedor = new Map<string, ProveedorCxP>();
  documentos.forEach((d) => {
    bandas[d.banda] += d.saldo;
    const clave = d.proveedorId ? String(d.proveedorId) : d.proveedor;
    let p = porProveedor.get(clave);
    if (!p) {
      p = {
        proveedor: d.proveedor,
        proveedorId: d.proveedorId,
        intercompania: d.intercompania,
        documentos: 0,
        saldo: 0,
        vencido: 0,
        bandas: bandasEnCero(),
        venceMasViejo: d.vence,
      };
      porProveedor.set(clave, p);
    }
    p.documentos++;
    p.saldo += d.saldo;
    if (d.diasVencido > 0) p.vencido += d.saldo;
    p.bandas[d.banda] += d.saldo;
    if (d.vence && (!p.venceMasViejo || d.vence < p.venceMasViejo)) p.venceMasViejo = d.vence;
  });

  const proveedores = Array.from(porProveedor.values())
    .map((p) => ({
      ...p,
      saldo: redondear(p.saldo),
      vencido: redondear(p.vencido),
      bandas: Object.fromEntries(BANDAS.map((b) => [b, redondear(p.bandas[b])])) as Record<Banda, number>,
    }))
    .sort((a, b) => b.saldo - a.saldo);

  // Calendario: 8 semanas desde la actual. Lo vencido va aparte (resumen).
  const lunes = lunesDe(hoy);
  const calendario: SemanaCxP[] = Array.from({ length: 8 }, (_, i) => ({
    desde: sumarDias(lunes, i * 7),
    hasta: sumarDias(lunes, i * 7 + 6),
    monto: 0,
    documentos: 0,
  }));
  documentos
    .filter((d) => d.tipo === "factura" && d.vence >= hoy)
    .forEach((d) => {
      const semana = calendario.find((s) => d.vence >= s.desde && d.vence <= s.hasta);
      if (semana) {
        semana.monto += d.saldo;
        semana.documentos++;
      }
    });
  calendario.forEach((s) => (s.monto = redondear(s.monto)));

  const suma = (lista: DocumentoCxP[]) => redondear(lista.reduce((s, d) => s + d.saldo, 0));
  const en7 = sumarDias(hoy, 7);
  const en30 = sumarDias(hoy, 30);
  const sinCondicion = documentos.filter((d) => d.tipo === "factura" && d.sinCondicionPago);

  const borradores: BorradorCxP[] = borradoresRaw
    .filter((b: any) => !(sinIntercompania && RE_INTERCOMPANIA.test(nombreM2o(b.partner_id))))
    .map((b: any) => ({
      id: b.id,
      numero: b.name && b.name !== "/" ? b.name : "Borrador",
      referencia: b.ref || "",
      proveedor: nombreM2o(b.partner_id, "Sin proveedor"),
      sede: empresaDeCompanyId(idM2o(b.company_id) || 0),
      fecha: b.invoice_date || "",
      total: redondear(Math.abs(Number(b.amount_total_signed) || 0)),
      diasEnBorrador: b.create_date ? diasEntre(String(b.create_date).slice(0, 10), hoy) : 0,
    }))
    .sort((a, b) => b.diasEnBorrador - a.diasEnBorrador);

  const pagosDelMes: PagoProveedor[] = pagosRaw
    .filter((p: any) => !(sinIntercompania && RE_INTERCOMPANIA.test(nombreM2o(p.partner_id))))
    .map((p: any) => ({
    id: p.id,
    fecha: p.date || "",
    proveedor: nombreM2o(p.partner_id, "Sin proveedor"),
    diario: nombreM2o(p.journal_id),
    // Salida de dinero: viene negativa; se muestra en positivo.
    monto: redondear(Math.abs(Number(p.amount_company_currency_signed) || 0)),
    sede: empresaDeCompanyId(idM2o(p.company_id) || 0),
  }));

  return {
    resumen: {
      saldo: suma(documentos),
      vencido: suma(documentos.filter((d) => d.diasVencido > 0)),
      porVencer7: suma(documentos.filter((d) => d.vence >= hoy && d.vence <= en7)),
      porVencer30: suma(documentos.filter((d) => d.vence >= hoy && d.vence <= en30)),
      notasCredito: suma(documentos.filter((d) => d.tipo === "nota_credito")),
      intercompania: suma(documentos.filter((d) => d.intercompania)),
      proveedores: proveedores.length,
      documentos: documentos.length,
      sinCondicionPago: { documentos: sinCondicion.length, monto: suma(sinCondicion) },
      pagadoEnElMes: redondear(pagosDelMes.reduce((s, p) => s + p.monto, 0)),
    },
    bandas: Object.fromEntries(BANDAS.map((b) => [b, redondear(bandas[b])])) as Record<Banda, number>,
    proveedores,
    calendario,
    documentos,
    borradores,
    pagosDelMes,
  };
}
