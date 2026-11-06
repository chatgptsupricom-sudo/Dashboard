/**
 * Parte pura de Pagos entre sedes (lib/administracion/pagosIntercompania.ts),
 * sin imports para poder probarla con `node scripts/check-pagos-intercompania.cjs`.
 */

export type SedeIC = "valencia" | "caracas" | "panama";

export const COMPANY_DE_SEDE: Record<SedeIC, number> = { valencia: 9, caracas: 10, panama: 7 };

/**
 * Como se llama cada sede en los libros de las otras (nombre del partner):
 * Valencia = "OFFICE SOLUTIONS CENTER 2004, C.A" (y la de ASTA), Caracas =
 * "SUPRICOM CCS 21, C.A.", Panama = "SUPRICOM, S.A.". SUPRICOM LLC/USA,
 * SUPRICOM GASTOS u Ofimaster no son sedes del panel y quedan fuera.
 * El partner de la propia empresa ("... - B") cae en su misma sede y se descarta.
 */
export function sedeDePartner(nombre: unknown): SedeIC | null {
  const n = String(nombre ?? "");
  if (/office solutions? center/i.test(n)) return "valencia";
  if (/supricom\s+ccs/i.test(n)) return "caracas";
  if (/^supricom,\s*s\.?\s*a\b/i.test(n)) return "panama";
  return null;
}

/** Lo que va en `ilike` sobre el nombre del partner para traer cada sede. */
export const ILIKE_DE_SEDE: Record<SedeIC, string> = {
  valencia: "office solution",
  caracas: "supricom ccs",
  panama: "supricom, s",
};

export interface FacturaReceptor {
  id: number;
  numero: string;
  tipo: string; // out_invoice | out_refund
  fecha: string | null;
  total: number;
  saldo: number;
  estadoPago: string;
}

const sinCeros = (s: string) => s.replace(/^0+/, "") || "0";

/** Ultimo grupo de digitos del numero, sin ceros adelante: "FCLIE/2026/04434" -> "4434". */
export function claveNumero(numero: string): string {
  const grupos = String(numero || "").match(/\d+/g);
  return grupos ? sinCeros(grupos[grupos.length - 1]) : "";
}

const diasEntre = (a: string, b: string) =>
  Math.abs(new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime()) / 86400000;

/**
 * La factura de la sede que cobra que corresponde a la factura de proveedor
 * de la sede que paga. Quien carga la factura de proveedor pone en `ref` el
 * numero de la factura de la otra sede ("5039017", "04434", "FACT 5036216 -
 * HONORARIOS…", "Importación Masiva - FAC 5034375"):
 *  1. numero igual a la ref;
 *  2. algun numero de 4+ digitos de la ref = el numero de la factura (sin
 *     ceros adelante); si hay varias, la del mismo monto;
 *  3. si la ref no ayuda (vacia o un numero fiscal, como en Panama), la unica
 *     del mismo monto en ±15 dias (`porMonto`: hay que revisarla).
 */
export function buscarEquivalente(
  ref: string,
  tipoProveedor: string,
  fecha: string | null,
  total: number,
  candidatas: FacturaReceptor[],
): { factura: FacturaReceptor; porMonto: boolean } | null {
  const tipo = tipoProveedor === "in_refund" ? "out_refund" : "out_invoice";
  const mismas = candidatas.filter((c) => c.tipo === tipo);
  const r = String(ref || "").trim().toUpperCase();
  if (r) {
    const exacta = mismas.find((c) => c.numero.trim().toUpperCase() === r);
    if (exacta) return { factura: exacta, porMonto: false };
    const claves = new Set((r.match(/\d{4,}/g) || []).map(sinCeros));
    const porNumero = mismas.filter((c) => claves.has(claveNumero(c.numero)));
    if (porNumero.length === 1) return { factura: porNumero[0], porMonto: false };
    const mismoMonto = porNumero.filter((c) => Math.abs(c.total - total) <= 0.01);
    if (mismoMonto.length === 1) return { factura: mismoMonto[0], porMonto: false };
  }
  if (!fecha) return null;
  const porMonto = mismas.filter(
    (c) => Math.abs(c.total - total) <= 0.01 && c.fecha && diasEntre(c.fecha, fecha) <= 15,
  );
  return porMonto.length === 1 ? { factura: porMonto[0], porMonto: true } : null;
}
