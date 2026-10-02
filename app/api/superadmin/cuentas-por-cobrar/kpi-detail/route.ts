import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { detalleCEI, saldoRelacionada } from "@/lib/cxc/efectividad";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { calcularRecuperacion } from "@/lib/cxc/recuperacion";
import { obtenerCobros, RELACIONADA } from "@/lib/cxc/cobros";
import { calcularDSO } from "@/lib/cxc/dso";
import { VENCIMIENTO_DESDE } from "@/lib/cxc/carteraVieja";
import { bandaDeDias } from "@/lib/cxc/bandas";
import { idsIncobrablesManuales } from "@/lib/cxc/incobrablesManuales";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

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
    const type = searchParams.get("type"); // efectividad | cartera | incobrables | recuperacion | dso
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    if (!type || !["efectividad", "cartera", "incobrables", "recuperacion", "dso"].includes(type)) {
      return NextResponse.json({ error: "type requerido: efectividad | cartera | incobrables | recuperacion | dso" }, { status: 400 });
    }

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = getMonthStart(currentYear, currentMonth);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    if (type === "efectividad") {
      // CEI con su detalle por cliente. Mismos helpers que la tarjeta
      // (lib/cxc/efectividad.ts) para que nunca discrepen.
      const semanas = obtenerSemanasDelMes(currentYear, currentMonth + 1);
      const { carteraCEI } = await calcularSeriesCxC(companyIds, semanas, today);
      const { resumen, clientes } = await detalleCEI(companyIds, monthStart, monthEnd, [], today, carteraCEI);
      return NextResponse.json({
        success: true,
        data: { type: "efectividad", summary: resumen, clientes },
      });
    }

    // "incobrables" es el complemento de "cartera": solo la cartera vieja.
    if (type === "cartera" || type === "incobrables") {
      // Mismo cálculo que la tarjeta (seriesSemanales.ts → saldosEn): saldo de
      // cada factura / nota de crédito hoy, sin Supricom. Cartera Vencida va
      // sin la cartera vieja (vencida antes de 2025) ni SUPER TECHNO;
      // Incobrables es solo esa cartera vieja. Antes leía el reporte de
      // antigüedad de Odoo, que además trae los pagos sin aplicar (renglones
      // negativos PCSH1/PBANES...) y asientos manuales: no son facturas y la
      // tarjeta no los cuenta.
      // Solo informativo: si falla, el modal sigue sin el aviso.
      const relacionadas = saldoRelacionada(companyIds).catch(() => 0);
      // Cartera al cierre del mes elegido si ya terminó (igual que la tarjeta,
      // route.ts → corteCartera); si no, hoy. Incobrables es siempre de hoy.
      const finMes = new Date(monthEnd);
      finMes.setHours(23, 59, 59, 999);
      const corte = type === "cartera" && finMes < today ? finMes : today;
      const inicioCorte = new Date(corte);
      inicioCorte.setHours(0, 0, 0, 0);
      const series = await calcularSeriesCxC(companyIds, [{ inicio: inicioCorte, fin: corte }], today);
      const { saldos, credito, viejas } = series.saldosEn(corte);
      // Cartera Vencida es solo crédito, igual que la tarjeta (seriesSemanales.ts → carteraVencidaEn).
      const mapa = type === "incobrables" ? viejas : new Map([...saldos].filter(([id]) => credito.has(id)));
      const ids = [...mapa.keys()];
      const moves: any[] = [];
      for (let i = 0; i < ids.length; i += 5000) {
        moves.push(...((await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 5000)], {
          fields: ["id", "name", "partner_id", "company_id", "invoice_user_id", "invoice_date", "invoice_date_due"],
        })) || []));
      }
      const filtered = moves.map((m: any) => {
        const due = m.invoice_date_due ? new Date(String(m.invoice_date_due).slice(0, 10) + "T00:00:00") : null;
        return {
          id: m.id,
          document_number: m.name,
          partner_name: m.partner_id?.[1],
          partner_id: m.partner_id,
          company_name: m.company_id?.[1],
          user_name: m.invoice_user_id?.[1],
          invoice_date: m.invoice_date,
          date_maturity: m.invoice_date_due,
          days_overdue: due ? Math.max(0, Math.round((inicioCorte.getTime() - due.getTime()) / 86400000)) : 0,
          amount_residual: mapa.get(m.id) || 0,
        };
      });

      const getAgingBand = (r: any) => bandaDeDias(r.days_overdue || 0);

      const invoices = filtered.map((r: any) => ({
        id: r.id,
        name: r.document_number || "",
        partnerName: r.partner_name || "Sin cliente",
        partnerId: r.partner_id?.[0] || 0,
        companyName: r.company_name || "",
        userName: r.user_name || "Sin asignar",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        daysOverdue: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        // Con signo (negativo = nota de credito abierta) para que total/
        // overdue/byBand mas abajo neten correctamente.
        amountResidual: Math.round((r.amount_residual || 0) * 100) / 100,
      }));

      const total = invoices.reduce((s, i) => s + i.amountResidual, 0);
      const overdue = invoices.filter(i => i.daysOverdue > 0).reduce((s, i) => s + i.amountResidual, 0);

      const byBand: Record<string, { count: number; total: number }> = {};
      invoices.forEach(i => {
        if (!byBand[i.agingBand]) byBand[i.agingBand] = { count: 0, total: 0 };
        byBand[i.agingBand].count++;
        byBand[i.agingBand].total += i.amountResidual;
      });

      return NextResponse.json({
        success: true,
        data: {
          type,
          summary: {
            // SUPER TECHNO: fuera del cálculo, pero el modal muestra su saldo.
            relacionadas: Math.round((await relacionadas) * 100) / 100,
            totalReceivable: Math.round(total * 100) / 100,
            totalOverdue: Math.round(overdue * 100) / 100,
            overduePct: total > 0 ? Math.round((overdue / total) * 10000) / 100 : 0,
            count: invoices.length,
            overdueCount: invoices.filter(i => i.daysOverdue > 0).length,
            clientes: new Set(invoices.map(i => i.partnerId).filter(Boolean)).size,
            corte: `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}-${String(corte.getDate()).padStart(2, "0")}`,
            alCierre: corte !== today,
          },
          byBand,
          invoices: invoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
        },
      });
    }

    if (type === "recuperacion") {
      // Mismo cálculo que la tarjeta (lib/cxc/recuperacion.ts, issue #189)
      // para que el modal y el KPI nunca discrepen: antes cada uno tenía su
      // propia versión de la fórmula.
      const monthStart = getMonthStart(currentYear, currentMonth);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);
      const [calc, relacionadas] = await Promise.all([
        calcularRecuperacion(companyIds, monthStart, monthEnd),
        saldoRelacionada(companyIds).catch(() => 0),
      ]);

      // Universo del KPI: facturas ya vencidas al iniciar el mes. Se listan las
      // que siguen con saldo (lo que queda por recuperar) y las que recibieron
      // cobros en el mes, aunque ya esten cerradas.
      const desdeStr = monthStart.toISOString().split("T")[0];
      const hastaStr = monthEnd.toISOString().split("T")[0];
      // Incobrables marcados a mano: fuera, igual que en la tarjeta.
      const manuales = [...(await idsIncobrablesManuales(companyIds))];
      const sinManuales: any[] = manuales.length ? [["id", "not in", manuales]] : [];
      const dominioVencidas: any[] = [
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["invoice_date_due", "<", desdeStr],
        ["invoice_date_due", ">=", VENCIMIENTO_DESDE],
        ["partner_id.name", "not ilike", "supricom"],
        ["commercial_partner_id.name", "not ilike", RELACIONADA],
        ...sinManuales,
      ];
      const camposFactura = ["id", "name", "partner_id", "company_id", "invoice_date",
        "invoice_date_due", "payment_state", "amount_total", "amount_residual"];

      // Cobrado en el mes por factura: mismo numerador que la tarjeta
      // (lib/cxc/cobros.ts), abierto factura por factura.
      const [pendientes, cobros] = await Promise.all([
        fetchPaginated("account.move", [...dominioVencidas, ["amount_residual", "!=", 0]], camposFactura),
        obtenerCobros(companyIds, {
          desde: desdeStr,
          hasta: hastaStr,
          dominioFactura: [
            ["move_type", "=", "out_invoice"],
            ["invoice_date_due", "<", desdeStr],
            ["invoice_date_due", ">=", VENCIMIENTO_DESDE],
            ["partner_id.name", "not ilike", "supricom"],
            ["commercial_partner_id.name", "not ilike", RELACIONADA],
            ...sinManuales,
          ],
        }),
      ]);

      const cobradoPorFactura = new Map<number, number>();
      for (const c of cobros) {
        cobradoPorFactura.set(c.facturaId, (cobradoPorFactura.get(c.facturaId) || 0) + c.monto);
      }

      // Facturas que se cobraron en el mes y hoy ya no tienen saldo: no vienen
      // en `pendientes` y sin ellas la tabla no explicaria lo recuperado.
      const idsPendientes = new Set(pendientes.map((f: any) => f.id));
      const faltantes = [...cobradoPorFactura.keys()].filter((id) => !idsPendientes.has(id));
      const cerradas = faltantes.length
        ? await fetchPaginated("account.move", [["id", "in", faltantes]], camposFactura)
        : [];

      const invoices = [...pendientes, ...cerradas].map((inv: any) => {
        const cobrado = Math.round((cobradoPorFactura.get(inv.id) || 0) * 100) / 100;
        return {
          id: inv.id,
          name: inv.name || "",
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          partnerId: inv.partner_id?.[0] || 0,
          companyName: inv.company_id?.[1] || "",
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: inv.invoice_date_due || null,
          paymentState: inv.payment_state || "not_paid",
          amountTotal: Math.round(Math.abs(inv.amount_total || 0) * 100) / 100,
          amountResidual: Math.round(Math.abs(inv.amount_residual || 0) * 100) / 100,
          // Cobrado DEL MES sobre esta factura (no el pagado historico): es lo
          // que suma al KPI.
          amountPaid: cobrado,
          status: cobrado > 0 ? "Recuperado" : "Pendiente",
        };
      });
      const recuperadas = invoices.filter((i) => i.amountPaid > 0).length;

      return NextResponse.json({
        success: true,
        data: {
          type: "recuperacion",
          summary: {
            relacionadas: Math.round(relacionadas * 100) / 100,
            // Nombres que usa el modal; los largos se mantienen por compatibilidad.
            vencidoInicial: calc.saldoVencidoInicial,
            recuperado: calc.recuperadoEnElMes,
            vencidoRestante: Math.round((calc.saldoVencidoInicial - calc.recuperadoEnElMes) * 100) / 100,
            recoveredCount: recuperadas,
            recuperacion: calc.value,
            saldoVencidoInicial: calc.saldoVencidoInicial,
            recuperadoEnElMes: calc.recuperadoEnElMes,
            saldoVencidoHoy: calc.saldoVencidoHoy,
            conciliadoDesdeElCorte: calc.conciliadoDesdeElCorte,
            count: invoices.length,
            pendingCount: invoices.filter((i) => i.amountResidual > 0).length,
          },
          // Primero las recuperadas (de mayor cobro a menor): son la respuesta a
          // "que se recupero este mes". Despues las pendientes, de la mas
          // vencida a la mas reciente.
          invoices: invoices.sort((a, b) => {
            if ((a.amountPaid > 0) !== (b.amountPaid > 0)) return a.amountPaid > 0 ? -1 : 1;
            if (a.amountPaid > 0) return b.amountPaid - a.amountPaid;
            return (a.invoiceDateDue || "").localeCompare(b.invoiceDateDue || "");
          }),
        },
      });
    }

    if (type === "dso") {
      // Mismo helper que la tarjeta (lib/cxc/dso.ts) para que nunca discrepen.
      const monthStart = getMonthStart(currentYear, currentMonth);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);
      const series = await calcularSeriesCxC(companyIds, obtenerSemanasDelMes(currentYear, currentMonth + 1), today);
      const { value, carteraAbierta, ventasNetas, dias, clientesIncluidos, clientes } =
        await calcularDSO(companyIds, monthStart, monthEnd, today, series);
      return NextResponse.json({
        success: true,
        data: {
          type: "dso",
          summary: { dso: value, carteraAbierta, ventasNetas, dias, count: clientesIncluidos },
          clientes,
        },
      });
    }

    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error KPI detail:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
