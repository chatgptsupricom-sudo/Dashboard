import { callOdooRPC } from "@/lib/odoo";

/**
 * Fecha con la que Cuentas por Cobrar cuenta un cobro: la CONFIRMACIÓN del
 * pago en Odoo.
 *
 *   fecha de un cobro = account.payment.payment_registration_date
 *                       (si está vacía → create_date del pago)
 *
 * Es la misma fecha que ya usa "Pago de Clientes" (#145). Antes, cada sección
 * fechaba el cobro por la conciliación (`max_date`) o por la fecha contable
 * del asiento del pago (`date`), que coinciden entre sí en el 92% de los
 * casos pero NO con la confirmación: medido sobre may–sep 2026, 1 de cada 3
 * conciliaciones tiene otra fecha de confirmación (casi siempre posterior,
 * 2,5 días en promedio, con extremos de −129 / +78 días) y ~4% del monto
 * cobrado cae en otro mes.
 *
 * `payment_registration_date` empezó a poblarse en abr-2026; los pagos
 * anteriores caen a `create_date`. Por eso abril sale con menos cobrado y
 * mayo con más que por la fecha contable.
 *
 * ── Conciliaciones que no vienen de un pago ──
 *
 * Notas de crédito, retenciones y ajustes cargados como asiento no tienen
 * `account.payment` y por lo tanto no tienen confirmación. Siguen fechándose
 * por la conciliación (`max_date`): bajan el saldo ese día igual que antes.
 * Cada KPI decide aparte si además cuentan como "cobrado".
 */

const PAGE = 5000;

const iso = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().split("T")[0];

/** YYYY-MM-DD de un pago según la regla de arriba. */
export function fechaDePago(p: { payment_registration_date?: string | false; create_date?: string | false }): string | null {
  if (p.payment_registration_date) return String(p.payment_registration_date).slice(0, 10);
  if (p.create_date) return String(p.create_date).split(/[ T]/)[0];
  return null;
}

type Op = ">=" | "<=" | ">" | "<";

/**
 * Fragmento de dominio para `account.partial.reconcile`: "la fecha efectiva de
 * esta conciliación cumple `op fecha`". Se combina con AND con el resto del
 * dominio (va en notación polaca, autocontenido).
 *
 * Tres ramas excluyentes según qué tenga el lado acreedor:
 *   1. pago con confirmación      → payment_registration_date
 *   2. pago sin confirmación      → create_date del pago
 *   3. no es un pago (NC, ajuste) → max_date de la conciliación
 *
 * Como cada conciliación cae en UNA sola rama, dos fragmentos combinados
 * (`>= desde` y `<= hasta`) no mezclan ramas y dan un rango correcto.
 * Verificado contra SQL: agosto 2026 = 3.422 conciliaciones, $3.421.263,
 * idéntico en los dos lados.
 */
export function dominioFechaEfectiva(op: Op, fecha: Date | string): any[] {
  const f = iso(fecha);
  // create_date es datetime: el borde del día depende del operador.
  const ts = op === ">=" || op === "<" ? `${f} 00:00:00` : `${f} 23:59:59`;
  const pago = "credit_move_id.payment_id";
  return [
    "|", "|",
    [`${pago}.payment_registration_date`, op, f],
    "&", [`${pago}.payment_registration_date`, "=", false], [`${pago}.create_date`, op, ts],
    "&", [pago, "=", false], ["max_date", op, f],
  ];
}

async function leerPagos(domain: any[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>("account.payment", "search_read", [domain], {
      fields: ["id", "move_id", "payment_registration_date", "create_date"],
      order: "id asc",
      limit: PAGE,
      offset,
    });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v || undefined);

/**
 * Pagos confirmados en [desde, hasta], indexados por el asiento del
 * pago (`account.move` id) → fecha de confirmación.
 *
 * Para pantallas que ya tienen el asiento que salda la factura: si ese asiento
 * tiene `payment_id` y no está en este mapa, se confirmó fuera del rango; si no
 * tiene `payment_id`, no es un pago y se usa su propia fecha.
 */
export async function pagosConfirmadosEntre(
  companyIds: number[],
  desde: Date | string,
  hasta: Date | string,
): Promise<Map<number, string>> {
  const d = iso(desde);
  const h = iso(hasta);
  const pagos = await leerPagos([
    // Sin filtrar por tipo de pago: el mapa se consulta por asiento, así que
    // solo se usan los pagos que efectivamente saldan una factura.
    ["company_id", "in", companyIds],
    "|",
    "&", ["payment_registration_date", ">=", d], ["payment_registration_date", "<=", h],
    "&", ["payment_registration_date", "=", false],
    "&", ["create_date", ">=", `${d} 00:00:00`], ["create_date", "<=", `${h} 23:59:59`],
  ]);
  const out = new Map<number, string>();
  for (const p of pagos) {
    const moveId = idDe(p.move_id);
    const fecha = fechaDePago(p);
    if (moveId && fecha) out.set(moveId, fecha);
  }
  return out;
}

/**
 * Fecha de abono de un asiento que salda una factura, con el mapa de
 * `pagosConfirmadosEntre`. `null` = no cae en el rango (o no tiene fecha).
 * El asiento debe traer `payment_id` y `date`.
 */
export function fechaDeAbono(asiento: { id: number; payment_id?: any; date?: string | false }, confirmados: Map<number, string>): string | null {
  if (idDe(asiento.payment_id)) return confirmados.get(asiento.id) ?? null;
  return asiento.date ? String(asiento.date).split(/[ T]/)[0] : null;
}

/** Fecha de confirmación de pagos puntuales, por id de `account.payment`. */
export async function fechasDePagos(paymentIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = Array.from(new Set(paymentIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += PAGE) {
    const pagos = await leerPagos([["id", "in", ids.slice(i, i + PAGE)]]);
    for (const p of pagos) {
      const fecha = fechaDePago(p);
      if (fecha) out.set(p.id, fecha);
    }
  }
  return out;
}

/**
 * Fecha efectiva de cada conciliación (id de `account.partial.reconcile` →
 * YYYY-MM-DD): confirmación del pago si el lado acreedor es un pago, `max_date`
 * si no. Las conciliaciones deben traer `id`, `max_date` y `credit_move_id`.
 */
export async function fechasEfectivas(
  conciliaciones: { id: number; max_date?: string | false; credit_move_id?: any }[],
): Promise<Map<number, string>> {
  const lineIds = Array.from(
    new Set(conciliaciones.map((c) => idDe(c.credit_move_id)).filter((x): x is number => !!x)),
  );
  const pagoDeLinea = new Map<number, number>();
  for (let i = 0; i < lineIds.length; i += PAGE) {
    const lineas = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[["id", "in", lineIds.slice(i, i + PAGE)]]],
      { fields: ["id", "payment_id"] },
    );
    for (const l of lineas || []) {
      const pid = idDe(l.payment_id);
      if (pid) pagoDeLinea.set(l.id, pid);
    }
  }
  const fechaPago = await fechasDePagos(Array.from(pagoDeLinea.values()));

  const out = new Map<number, string>();
  for (const c of conciliaciones) {
    const pid = pagoDeLinea.get(idDe(c.credit_move_id) as number);
    const fecha = (pid !== undefined ? fechaPago.get(pid) : undefined) ?? (c.max_date ? String(c.max_date).slice(0, 10) : null);
    if (fecha) out.set(c.id, fecha);
  }
  return out;
}
