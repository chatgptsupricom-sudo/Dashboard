import { callOdooRPC } from "@/lib/odoo";

/**
 * KPI "Recuperación Vencidos" (issue #189).
 *
 *   Recuperación = pagos conciliados DURANTE el mes sobre facturas que ya
 *                  estaban vencidas al INICIAR el mes
 *                ÷ saldo vencido al iniciar el mes
 *
 * ── Por qué no se puede leer directo de `account.move` ──
 *
 * `amount_residual` es el saldo de HOY, no el de una fecha pasada, así que el
 * denominador no se puede leer: hay que reconstruirlo.
 *
 *   saldo vencido al inicio del mes
 *     = saldo que esas facturas tienen hoy
 *     + todo lo que se les conció desde el corte hasta hoy
 *
 * La versión anterior de este KPI intentaba evitar esa reconstrucción usando
 * `(facturado − saldo) / facturado` sobre TODAS las facturas con
 * `invoice_date_due < inicio de mes`, sin filtrar por saldo abierto. Eso
 * arrastraba 14.748 facturas desde 2018 (solo 1.578 con saldo) y el
 * denominador terminaba siendo todo lo facturado en la historia, de modo que
 * el valor subía monótonamente cada mes por construcción (21,7% → 54,5% →
 * 71,0% → 77,5% → 81,8% → 82,4%) sin importar la gestión de cobranza.
 *
 * ── Notas de crédito ──
 *
 * El denominador se reconstruye con TODAS las conciliaciones, porque el saldo
 * realmente bajó por todas ellas. El numerador cuenta solo PAGOS: una factura
 * que se limpió con una nota de crédito no se recuperó, se dio de baja. Medido
 * sobre agosto 2026, las notas de crédito son el 0,6% de lo conciliado
 * ($17.712 de $2,97M), así que la distinción casi no mueve el número — pero
 * deja el KPI conceptualmente correcto.
 *
 * ── Alternativa descartada ──
 *
 * Guardar un snapshot mensual del saldo vencido (tabla + cron) haría el
 * denominador una lectura directa, pero no habría histórico hasta que el cron
 * acumulara meses. Esta reconstrucción funciona retroactivamente para
 * cualquier mes. Si algún día resulta lenta, el snapshot queda como
 * optimización encima, no como reemplazo.
 */

export interface RecuperacionResultado {
  /** % recuperado en el mes. `null` si no había saldo vencido al iniciar. */
  value: number | null;
  /** Saldo vencido al iniciar el mes (denominador). */
  saldoVencidoInicial: number;
  /** Pagos conciliados durante el mes sobre ese saldo (numerador). */
  recuperadoEnElMes: number;
  /** Saldo que esas facturas todavía tienen hoy. */
  saldoVencidoHoy: number;
  /** Conciliado desde el corte hasta hoy — lo que se suma para reconstruir. */
  conciliadoDesdeElCorte: number;
  /** Nº de facturas vencidas con saldo abierto al día de hoy. */
  facturasConSaldo: number;
}

const PAGE = 5000;

async function sumarCampo(
  model: string,
  domain: any[],
  campo: string,
): Promise<{ total: number; count: number }> {
  let total = 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields: [campo],
      order: "id asc",
      limit: PAGE,
      offset,
    });
    if (!page || page.length === 0) break;
    for (const r of page) total += Number(r[campo] || 0);
    count += page.length;
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return { total, count };
}

const iso = (d: Date) => d.toISOString().split("T")[0];

export async function calcularRecuperacion(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
): Promise<RecuperacionResultado> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);

  // El filtro de partners internos va en el dominio de Odoo y no en JS: así
  // no viajan filas que después se descartan (el resto del endpoint las
  // filtra en JS por razones históricas).
  const noInterno = (prefijo: string): any[] => [
    [`${prefijo}partner_id.name`, "not ilike", "supricom"],
  ];

  // Facturas que ya estaban vencidas al iniciar el mes y HOY siguen con saldo.
  const baseFacturas: any[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["company_id", "in", companyIds],
    ["invoice_date_due", "<", desde],
    ...noInterno(""),
  ];

  // Conciliaciones sobre esas mismas facturas. `debit_move_id.move_id.*`
  // funciona en el dominio (verificado contra Odoo real).
  const baseConciliaciones: any[] = [
    ["debit_move_id.move_id.move_type", "=", "out_invoice"],
    ["debit_move_id.move_id.state", "=", "posted"],
    ["debit_move_id.move_id.invoice_date_due", "<", desde],
    ["company_id", "in", companyIds],
    ...noInterno("debit_move_id.move_id."),
  ];

  const [saldoHoy, desdeElCorte, enElMes] = await Promise.all([
    sumarCampo("account.move", [...baseFacturas, ["amount_residual", "!=", 0]], "amount_residual"),
    // Todo lo conciliado desde el corte: se suma al saldo de hoy para
    // reconstruir cuánto había vencido al iniciar el mes.
    sumarCampo("account.partial.reconcile", [...baseConciliaciones, ["max_date", ">=", desde]], "amount"),
    // Solo el mes, y solo pagos: una nota de crédito no es recuperación.
    sumarCampo(
      "account.partial.reconcile",
      [
        ...baseConciliaciones,
        ["max_date", ">=", desde],
        ["max_date", "<=", hasta],
        ["credit_move_id.move_id.move_type", "!=", "out_refund"],
      ],
      "amount",
    ),
  ]);

  const saldoVencidoInicial = saldoHoy.total + desdeElCorte.total;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    value:
      saldoVencidoInicial > 0
        ? Math.round((enElMes.total / saldoVencidoInicial) * 10000) / 100
        : null,
    saldoVencidoInicial: r2(saldoVencidoInicial),
    recuperadoEnElMes: r2(enElMes.total),
    saldoVencidoHoy: r2(saldoHoy.total),
    conciliadoDesdeElCorte: r2(desdeElCorte.total),
    facturasConSaldo: saldoHoy.count,
  };
}
