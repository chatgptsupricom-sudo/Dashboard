import { callOdooRPC } from "@/lib/odoo";

/**
 * ¿Una factura / nota de crédito de cliente es A CRÉDITO?
 *
 * Mismo criterio que Contado/Crédito (contado-credito/route.ts) y que el DSO
 * anterior: es crédito si su plazo de pago tiene un número de días en el
 * nombre ("30 Días", "15 Days", "7 días"). Sin plazo, o un plazo sin número
 * ("Immediate Payment", "Contado"), es contado.
 *
 * Notas de crédito: casi ninguna trae plazo propio (medido jun–sep 2026: 316
 * de 423, todas con factura de origen), así que se clasifican por su propio
 * plazo si lo tienen y, si no, por el de la factura que revierten
 * (`reversed_entry_id`). Si no, una NC de una venta a crédito caería en
 * contado y la venta a crédito neta saldría inflada.
 */

export const esPlazoCredito = (nombre: string | null | undefined) => Boolean(nombre) && /\d/.test(nombre as string);

const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

async function leer(model: string, ids: number[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const page = await callOdooRPC<any[]>(model, "read", [ids.slice(i, i + 1000)], { fields });
    out.push(...(page || []));
  }
  return out;
}

/**
 * Devuelve los ids de `moves` que son a crédito. Cada move necesita
 * `id`, `move_type`, `invoice_payment_term_id` y `reversed_entry_id`.
 */
export async function idsACredito(moves: any[]): Promise<Set<number>> {
  const plazoDe = new Map<number, number | undefined>();
  for (const m of moves) plazoDe.set(m.id, idDe(m.invoice_payment_term_id));

  // Plazo de la factura de origen de las NC sin plazo propio.
  const origenes = Array.from(new Set(
    moves
      .filter((m) => m.move_type === "out_refund" && !idDe(m.invoice_payment_term_id))
      .map((m) => idDe(m.reversed_entry_id))
      .filter((id): id is number => Boolean(id) && !plazoDe.has(id as number)),
  ));
  for (const o of await leer("account.move", origenes, ["id", "invoice_payment_term_id"])) {
    plazoDe.set(o.id, idDe(o.invoice_payment_term_id));
  }

  const plazoIds = Array.from(new Set(Array.from(plazoDe.values()).filter((id): id is number => Boolean(id))));
  const nombre = new Map<number, string>();
  for (const t of await leer("account.payment.term", plazoIds, ["id", "name"])) nombre.set(t.id, t.name);

  const credito = new Set<number>();
  for (const m of moves) {
    let plazo = plazoDe.get(m.id);
    if (!plazo && m.move_type === "out_refund") {
      const origen = idDe(m.reversed_entry_id);
      if (origen) plazo = plazoDe.get(origen);
    }
    if (plazo && esPlazoCredito(nombre.get(plazo))) credito.add(m.id);
  }
  return credito;
}
