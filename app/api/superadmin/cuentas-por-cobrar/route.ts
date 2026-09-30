import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { calcularCEI } from "@/lib/cxc/efectividad";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { calcularRecuperacion } from "@/lib/cxc/recuperacion";
import { calcularDSO } from "@/lib/cxc/dso";
import { RELACIONADA, obtenerCobros } from "@/lib/cxc/cobros";
import { esResponsableExcluido } from "@/lib/cxc/vendedoresExcluidos";
import { obtenerSemanasDelMes, obtenerSemanasDelRango } from "@/lib/feriados";
import { ensureKpiTargetsPeso, pesoDeFila } from "@/lib/kpiTargets";
import { NextRequest, NextResponse } from "next/server";

// La lectura de `digiflex.cxc.report` es paginada y puede traer miles de
// renglones: sin esto el request se cortaba a los ~15s y el grupo de CxC del
// Stoplight quedaba vacío.
export const runtime = "nodejs";
export const maxDuration = 60;

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

// La consulta a `digiflex.cxc.report` es cara (paginado de miles de renglones,
// varios segundos). El Stoplight la pide cada vez que se abre y varios roles la
// comparten con los mismos parámetros, así que se cachea en memoria por 10 min
// — mismo patrón que app/api/compras/mayor_rotacion/route.ts.
const cxcCache = new Map<string, { data: any; ts: number }>();
const CXC_CACHE_TTL = 10 * 60 * 1000;

const COMPANY_NAMES: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const cacheKey = JSON.stringify([empresa, userCidsParam, monthParam, yearParam, startDateParam, endDateParam]);
    const cached = cxcCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CXC_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    let monthStart: Date, monthEnd: Date, currentYear: number, currentMonth: number;

    if (startDateParam && endDateParam) {
      monthStart = new Date(startDateParam + "T00:00:00");
      monthEnd = new Date(endDateParam + "T23:59:59");
      currentYear = monthStart.getFullYear();
      currentMonth = monthStart.getMonth();
    } else {
      currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
      currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
      monthStart = getMonthStart(currentYear, currentMonth);
      monthEnd = new Date(currentYear, currentMonth + 1, 0);
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const mes = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    // company_id para leer metas/pesos de `kpi_targets` (tabla por sede). Con
    // filtro de empresa o de usuario coincide con `companyIds[0]`; en la
    // vista consolidada (sin filtro, `companyIds = [7,9,10]`) se usa Valencia
    // (9) como sede de referencia explícita -- antes se tomaba
    // `companyIds[0] || 9`, que por el orden del array quedaba en Panamá (7)
    // sin que nadie lo hubiera decidido así (issue #190).
    const companyId = empresa && COMPANY_MAP[empresa]
      ? COMPANY_MAP[empresa]
      : userCidsParam
        ? parseInt(userCidsParam, 10)
        : 9;

    await ensureKpiTargetsPeso();
    const cxcMetasResult = await query(
      "SELECT kpi_key, meta_mensual, peso FROM kpi_targets WHERE company_id = ? AND mes = ? AND kpi_key IN ('efectividad_cobranza', 'cartera_vencida', 'recuperacion_vencidos', 'dso') ORDER BY id",
      [companyId, mes]
    );
    const cxcMetas: Record<string, number> = {};
    const cxcPesos: Record<string, number> = {};
    (cxcMetasResult.rows as any[]).forEach((r: any) => {
      cxcMetas[r.kpi_key] = Number(r.meta_mensual);
      // null = sin peso propio (valor por defecto); 0 = no cuenta.
      const p = pesoDeFila(r.peso);
      if (p !== null) cxcPesos[r.kpi_key] = p;
    });

    // ═══════════════════════════════════════════════════════════════════
    // FUENTE 1: digiflex.cxc.report — Aging, balances, top deudores
    // ═══════════════════════════════════════════════════════════════════
    const reportDomain: any[] = [
      ["company_id", "in", companyIds],
    ];

    const reportData = await fetchPaginated(
      "digiflex.cxc.report",
      reportDomain,
      [
        "id", "move_id", "partner_id", "partner_name",
        "user_id", "user_name", "company_id", "company_name",
        "invoice_date", "date_maturity", "days_overdue",
        "amount_residual", "amount_current",
        "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
        "transaction_type", "document_number",
      ],
    );

    // Filtrar renglones con saldo abierto (excluye asientos internos de Supricom).
    // Incluye notas de credito abiertas: en este modelo traen amount_residual
    // NEGATIVO (verificado contra Odoo real, ej. RNC/2026/00650 de GRUPO CMW,
    // S.A. = -545), asi que sumarlas con signo resta correctamente del saldo
    // del cliente en vez de excluirlas o contarlas como deuda.
    const reportInvoices = reportData.filter((r: any) =>
      r.amount_residual !== 0 && !((r.partner_name || "").toLowerCase().includes("supricom"))
    );

    // Aging distribution (rangos del reporte Odoo: corriente, 1-30, 31-60, 61-90, 91+)
    const agingDistribution: Record<string, number> = {
      "corriente": 0,
      "1-30": 0,
      "31-60": 0,
      "61-90": 0,
      "91+": 0,
    };

    let totalReceivable = 0;
    let totalOverdue = 0;

    reportInvoices.forEach((r: any) => {
      // Con signo: una nota de credito abierta (residual negativo) debe
      // restar del total, no sumarse en valor absoluto. Las bandas de aging
      // (amount_current, amount_1_30, ...) vienen con el mismo signo que
      // amount_residual (verificado: para estas filas su suma da exactamente
      // amount_residual), asi que se agregan igual sin Math.abs para que las
      // bandas sigan sumando el mismo total.
      const residual = r.amount_residual || 0;
      totalReceivable += residual;
      if (r.days_overdue > 0) totalOverdue += residual;

      agingDistribution["corriente"] += r.amount_current || 0;
      agingDistribution["1-30"] += r.amount_1_30 || 0;
      agingDistribution["31-60"] += r.amount_31_60 || 0;
      agingDistribution["61-90"] += r.amount_61_90 || 0;
      agingDistribution["91+"] += r.amount_91_plus || 0;
    });

    const carteraVencidaPct = totalReceivable > 0
      ? Math.round((totalOverdue / totalReceivable) * 10000) / 100
      : null;

    // Top deudores
    const topDebtors = (() => {
      const byClient: Record<number, { name: string; total: number; overdue: number; oldest: number; count: number }> = {};
      reportInvoices.forEach((r: any) => {
        const pid = r.partner_id?.[0] || 0;
        if (!pid) return;
        if (!byClient[pid]) {
          byClient[pid] = { name: r.partner_name || r.partner_id?.[1] || "Sin cliente", total: 0, overdue: 0, oldest: 0, count: 0 };
        }
        const residual = r.amount_residual || 0;
        byClient[pid].total += residual;
        byClient[pid].count++;
        if (r.days_overdue > 0) byClient[pid].overdue += residual;
        if ((r.days_overdue || 0) > byClient[pid].oldest) byClient[pid].oldest = r.days_overdue;
      });
      return Object.entries(byClient)
        .map(([id, data]) => ({ partnerId: parseInt(id), ...data }))
        // Top de deudores VENCIDOS: solo quien tiene algo vencido, ordenados
        // por lo vencido. Total sigue mostrando todo lo que debe.
        .filter((d) => d.overdue > 0.005)
        .sort((a, b) => b.overdue - a.overdue)
        .slice(0, 10);
    })();

    // Por vendedor
    const bySalesperson = (() => {
      const byUser: Record<number, { name: string; total: number; overdue: number; count: number }> = {};
      reportInvoices.forEach((r: any) => {
        const uid = r.user_id?.[0] || 0;
        if (!uid) return;
        // Asistentes y quienes no gestionan cobranza no van en esta tabla.
        if (esResponsableExcluido(r.user_name || r.user_id?.[1], r.company_id?.[0])) return;
        if (!byUser[uid]) {
          byUser[uid] = { name: r.user_name || r.user_id?.[1] || "Sin asignar", total: 0, overdue: 0, count: 0 };
        }
        const residual = r.amount_residual || 0;
        byUser[uid].total += residual;
        byUser[uid].count++;
        if (r.days_overdue > 0) byUser[uid].overdue += residual;
      });
      return Object.entries(byUser)
        .map(([id, data]) => ({ userId: parseInt(id), ...data }))
        .sort((a, b) => b.total - a.total);
    })();

    // Por compañía
    const byCompany = companyIds.map((cid) => {
      const coRecords = reportInvoices.filter((r: any) => (r.company_id?.[0] || 0) === cid);
      const coOverdue = coRecords.filter((r: any) => r.days_overdue > 0);
      const coTotalReceivable = coRecords.reduce((s, r) => s + (r.amount_residual || 0), 0);
      const coTotalOverdue = coOverdue.reduce((s, r) => s + (r.amount_residual || 0), 0);
      const coTotalCurrent = coRecords.reduce((s, r) => s + (r.amount_current || 0), 0);

      return {
        companyId: cid,
        companyName: COMPANY_NAMES[cid] || `Sucursal ${cid}`,
        totalReceivable: Math.round(coTotalReceivable * 100) / 100,
        totalOverdue: Math.round(coTotalOverdue * 100) / 100,
        overduePct: coTotalReceivable > 0 ? Math.round((coTotalOverdue / coTotalReceivable) * 10000) / 100 : 0,
        // Mismo calculo que el KPI global "Efectividad Cobranza" (corriente /
        // cartera total) pero por sede — la tabla "Por Sede" lo pedia y nunca
        // se calculo, asi que el frontend mostraba literalmente "undefined%"
        // (el chequeo `!== null` no atajaba `undefined`).
        efectividad: coTotalReceivable > 0 ? Math.round((coTotalCurrent / coTotalReceivable) * 10000) / 100 : null,
        openInvoices: coRecords.length,
        overdueInvoices: coOverdue.length,
        aging: {
          corriente: Math.round(coTotalCurrent * 100) / 100,
          "1-30": Math.round(coRecords.reduce((s, r) => s + (r.amount_1_30 || 0), 0) * 100) / 100,
          "31-60": Math.round(coRecords.reduce((s, r) => s + (r.amount_31_60 || 0), 0) * 100) / 100,
          "61-90": Math.round(coRecords.reduce((s, r) => s + (r.amount_61_90 || 0), 0) * 100) / 100,
          "91+": Math.round(coRecords.reduce((s, r) => s + (r.amount_91_plus || 0), 0) * 100) / 100,
        },
      };
    });

    // ═══════════════════════════════════════════════════════════════════
    // FUENTE 2: account.move — Efectividad, Recuperación, DSO, Cartera Vencida
    // Mismas consultas y fórmulas que /kpi-detail para que la tarjeta y su
    // propio modal de detalle siempre coincidan (antes cada uno calculaba
    // algo distinto con el mismo nombre y el mismo semáforo/meta).
    // ═══════════════════════════════════════════════════════════════════
    const [recuperacionCalc, cobrosMes, sinAplicarGrupo] = await Promise.all([
      // Recuperación Vencidos: reconstruye el saldo vencido al inicio del mes
      // y lo compara con los pagos conciliados durante el mes. Ver
      // lib/cxc/recuperacion.ts para el detalle del método y por qué no se
      // puede leer directo de `amount_residual` (issue #189).
      calcularRecuperacion(companyIds, monthStart, monthEnd),
      // Cobrado del mes por vendedor (tabla por responsable): dinero que entró
      // a banco/caja, misma fuente que "Cobrado" de Contado/Crédito.
      obtenerCobros(companyIds, { desde: monthStart, hasta: monthEnd < today ? monthEnd : today }),
      // Pagos todavía no aplicados a una factura (anticipos, saldo a favor):
      // restan en el reporte de Odoo pero no son de ninguna factura, así que
      // el Resumen los muestra en su propia fila.
      callOdooRPC<any[]>(
        "account.move.line",
        "read_group",
        [[
          ["account_id.account_type", "=", "asset_receivable"],
          ["parent_state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["move_type", "not in", ["out_invoice", "out_refund"]],
          ["amount_residual", "!=", 0],
          ["partner_id.name", "not ilike", "supricom"],
          ["partner_id.commercial_partner_id.name", "not ilike", RELACIONADA],
        ], ["amount_residual:sum"], []],
        { lazy: false },
      ),
    ]);
    const sinAplicar = Math.round(Number(sinAplicarGrupo?.[0]?.amount_residual || 0) * 100) / 100;

    // ── Efectividad (CEI) y su fila semanal ──
    // (lib/cxc/efectividad.ts, compartido con el modal de detalle). Se usan las mismas semanas que arma el Stoplight de ventas (mismo
    // helper) para que la fila quede alineada con los encabezados
    // `weekHeaders`. La lógica vive en lib/cxc/efectividad.ts, compartida con
    // el modal de detalle para que nunca discrepen.
    const semanasCxc = (startDateParam && endDateParam)
      ? obtenerSemanasDelRango(new Date(startDateParam), new Date(endDateParam))
      : obtenerSemanasDelMes(currentYear, currentMonth + 1);

    // Series semanales de Cartera Vencida y Recuperación: las dos reconstruyen
    // el saldo de cada factura en cortes pasados (lib/cxc/seriesSemanales.ts).
    // `carteraHoy` sale del mismo método que las celdas semanales, para que el
    // promedio del KPI y su fila aten entre sí.
    // El CEI usa el saldo contable al inicio y al final del mes, pero le resta
    // el contado y la cartera vieja por factura con esas mismas series, así
    // que va después (seriesSemanales.ts → carteraCEI).
    const seriesCxc = await calcularSeriesCxC(companyIds, semanasCxc, today);

    // Incobrables: la cartera vieja (vencida antes de 2025) que los KPIs dejan
    // fuera (lib/cxc/carteraVieja.ts), factura por factura con el mismo cálculo
    // que su modal. El reporte de Odoo metía además pagos sin aplicar viejos.
    const { viejas } = seriesCxc.saldosEn(today);
    const clientesViejas = viejas.size
      ? await callOdooRPC<any[]>("account.move", "read", [[...viejas.keys()]], { fields: ["id", "partner_id"] })
      : [];
    const incobrables = {
      saldo: Math.round([...viejas.values()].reduce((a, b) => a + b, 0) * 100) / 100,
      facturas: viejas.size,
      clientes: new Set((clientesViejas || []).map((m: any) => m.partner_id?.[0]).filter(Boolean)).size,
    };
    // El DSO usa la CxC final y las ventas a crédito del CEI (lib/cxc/dso.ts).
    const [efectividadCalc, dsoCalc] = await Promise.all([
      calcularCEI(companyIds, monthStart, monthEnd, semanasCxc, today, seriesCxc.carteraCEI),
      calcularDSO(companyIds, monthStart, monthEnd, today, seriesCxc),
    ]);
    const efectividad = efectividadCalc.value;
    const semanaEfectividad = efectividadCalc.semana;

    // ── Cartera Vencida: % de cartera que está vencida ── (ya calculado arriba)

    // ── Recuperación Vencidos: ya calculado arriba por calcularRecuperacion() ──
    const recuperacion = recuperacionCalc.value;

    // ── DSO: ya calculado arriba por calcularDSO() ──
    const dsoPorCliente = new Map(dsoCalc.clientes.map((c) => [c.partnerId, c.dso]));
    const topDebtorsConDso = topDebtors.map((d) => ({ ...d, dso: dsoPorCliente.get(d.partnerId) ?? null }));

    // ═══════════════════════════════════════════════════════════════════
    // Respuesta
    // ═══════════════════════════════════════════════════════════════════
    const payload = {
      success: true,
      data: {
        kpis: {
          efectividad: {
            // CEI estándar, solo crédito: (CxC inicial + ventas crédito − CxC
            // final) ÷ (CxC inicial + ventas crédito − CxC final no vencida)
            // (lib/cxc/efectividad.ts → calcularCEI).
            value: efectividad,
            meta: cxcMetas["efectividad_cobranza"] || 85,
            recuperado: efectividadCalc.recuperado,
            ventasCredito: efectividadCalc.ventasCredito,
            carteraInicial: efectividadCalc.carteraInicial,
            carteraFinal: efectividadCalc.carteraFinal,
            carteraFinalNoVencida: efectividadCalc.carteraFinalNoVencida,
            exigible: efectividadCalc.exigible,
            pagosRegistrados: efectividadCalc.pagosRegistrados,
            pagos: efectividadCalc.pagos,
            facturas: efectividadCalc.facturas,
            parcial: efectividadCalc.parcial,
            relacionadas: efectividadCalc.relacionadas,
          },
          carteraVencida: {
            // Se calcula con el mismo método que la fila semanal (reconstruyendo
            // el saldo en el corte) y no con `days_overdue` del reporte de Odoo,
            // para que el promedio y las celdas de la semana aten. Mueve el
            // valor ~1,7 pts respecto a la fuente anterior y de paso unifica el
            // desvío entre fuentes del issue #190. El aging, los top deudores y
            // el corte por sede siguen leyendo el reporte, que es donde está el
            // detalle por renglón.
            value: seriesCxc.carteraHoy.pct,
            meta: cxcMetas["cartera_vencida"] || 10,
            saldoVencido: seriesCxc.carteraHoy.vencido,
            carteraTotal: seriesCxc.carteraHoy.total,
            // SUPER TECHNO queda fuera del % pero su saldo se muestra.
            relacionadas: efectividadCalc.relacionadas,
          },
          recuperacion: {
            value: recuperacion,
            meta: cxcMetas["recuperacion_vencidos"] || 60,
            // Nombres nuevos y explícitos: `vencidoInicial`/`vencidoRestante`
            // se retiran a propósito porque significaban otra cosa (todo lo
            // facturado en la historia y su saldo) y arrastrarlos invitaba a
            // leerlos mal. Ver lib/cxc/recuperacion.ts.
            saldoVencidoInicial: recuperacionCalc.saldoVencidoInicial,
            recuperadoEnElMes: recuperacionCalc.recuperadoEnElMes,
            saldoVencidoHoy: recuperacionCalc.saldoVencidoHoy,
            conciliadoDesdeElCorte: recuperacionCalc.conciliadoDesdeElCorte,
            facturasConSaldo: recuperacionCalc.facturasConSaldo,
            relacionadas: efectividadCalc.relacionadas,
          },
          dso: {
            value: dsoCalc.value,
            meta: cxcMetas["dso"] || 45,
            carteraAbierta: dsoCalc.carteraAbierta,
            ventasNetas: dsoCalc.ventasNetas,
            dias: dsoCalc.dias,
            clientes: dsoCalc.clientesIncluidos,
          },
          incobrables,
        },
        semanaEfectividad,
        semanaCarteraVencida: seriesCxc.carteraVencidaSemana,
        semanaRecuperacion: seriesCxc.recuperacionSemana,
        pesos: cxcPesos,
        // Antigüedad del saldo abierto con el cálculo de Cartera Vencida (sin
        // Incobrables ni SUPER TECHNO): las bandas suman la cartera del Resumen.
        agingDistribution: seriesCxc.carteraHoy.aging,
        // Cartera, vencida y facturas por sede con el mismo cálculo que las
        // tarjetas (sin Incobrables ni SUPER TECHNO); la efectividad es el CEI
        // de la sede. El aging por sede sigue saliendo del reporte de Odoo.
        byCompany: byCompany.map((co) => {
          const sede = seriesCxc.carteraHoyPorSede[co.companyId];
          return {
            ...co,
            totalReceivable: sede?.total ?? co.totalReceivable,
            totalOverdue: sede?.vencido ?? co.totalOverdue,
            overduePct: sede?.pct ?? co.overduePct,
            openInvoices: sede?.facturas ?? co.openInvoices,
            overdueInvoices: sede?.facturasVencidas ?? co.overdueInvoices,
            efectividad: companyIds.length > 1 ? efectividadCalc.porSede[co.companyId] ?? null : efectividad,
            aging: sede?.aging ?? co.aging,
          };
        }),
        topDebtors: topDebtorsConDso,
        bySalesperson: (() => {
          const cobrado = new Map<number, { name: string; monto: number }>();
          for (const c of cobrosMes) {
            if (c.interno || !c.vendedorId || esResponsableExcluido(c.vendedorName, c.companyId)) continue;
            const v = cobrado.get(c.vendedorId) || { name: c.vendedorName, monto: 0 };
            v.monto += c.monto;
            cobrado.set(c.vendedorId, v);
          }
          const filas = bySalesperson.map((sp) => ({
            ...sp,
            cobrado: Math.round((cobrado.get(sp.userId)?.monto || 0) * 100) / 100,
          }));
          // Quien cobró en el mes pero ya no tiene cartera también aparece.
          for (const [userId, v] of cobrado) {
            if (!filas.some((f) => f.userId === userId)) {
              filas.push({ userId, name: v.name, total: 0, overdue: 0, count: 0, cobrado: Math.round(v.monto * 100) / 100 });
            }
          }
          return filas;
        })(),
        // Mismas cifras que la tarjeta de Cartera Vencida. Lo que el reporte de
        // Odoo suma aparte va en filas propias; las cuatro partes cuadran con
        // `totalOdoo` (el total del reporte de antigüedad).
        summary: {
          totalReceivable: seriesCxc.carteraHoy.total,
          totalOverdue: seriesCxc.carteraHoy.vencido,
          openInvoiceCount: seriesCxc.carteraHoy.facturas,
          overdueInvoiceCount: seriesCxc.carteraHoy.facturasVencidas,
          incobrables: incobrables.saldo,
          sinAplicar,
          relacionadas: efectividadCalc.relacionadas,
          totalOdoo: Math.round(totalReceivable * 100) / 100,
        },
        filters: {
          empresa,
          month: currentMonth + 1,
          year: currentYear,
          companyIds,
        },
        updatedAt: new Date().toISOString(),
      },
    };

    cxcCache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Error CxC API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
