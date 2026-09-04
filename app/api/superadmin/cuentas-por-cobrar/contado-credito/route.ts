import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const CUSTOMER_INVOICE_TYPES = new Set(["out_invoice", "out_refund"]);

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

const isSupricom = (partner: any) => (partner?.[1] || "").toLowerCase().includes("supricom");

// Forma comun que alimenta la clasificacion contado/credito, sin importar
// si el monto viene de una factura entera o de un abono conciliado
// puntual. esDelMes distingue, para el modo "cobrado", si lo cobrado
// corresponde a una factura emitida ese mismo mes o a una de un mes
// anterior (deuda vieja que se termino de cobrar ahora) -- es lo que
// pidio cobranza para no confundir "cuanto entro" con "de que factura".
type Renglon = { monto: number; partnerId: number; partnerName: string; paymentTermId: number | undefined; esDelMes: boolean; journalId: number | undefined; journalName: string };

async function renglonesFacturado(companyIds: number[], monthStart: Date, monthEnd: Date): Promise<Renglon[]> {
  const invoicesRaw = await fetchPaginated(
    "account.move",
    [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["invoice_date", ">=", monthStart.toISOString().split("T")[0]],
      ["invoice_date", "<=", monthEnd.toISOString().split("T")[0]],
    ],
    ["id", "partner_id", "move_type", "amount_total", "invoice_payment_term_id"],
  );

  return invoicesRaw
    .filter((inv) => !isSupricom(inv.partner_id) && inv.partner_id)
    .map((inv) => ({
      monto: inv.move_type === "out_refund" ? -(inv.amount_total || 0) : (inv.amount_total || 0),
      partnerId: inv.partner_id[0],
      partnerName: inv.partner_id[1] || "Sin cliente",
      paymentTermId: inv.invoice_payment_term_id?.[0],
      esDelMes: true,
      journalId: undefined,
      journalName: "",
    }));
}

// Dinero que efectivamente entro el mes, sin importar cuando se emitio la
// factura que salda -- mismo mecanismo de conciliacion que ya usa
// app/api/superadmin/integraciondepago/route.ts (account.partial.reconcile
// emparejado con el lado factura y el lado pago), reutilizado tal cual.
// Es la unica fuente para "Cobrado": coincide con el reporte "Integracion
// de Pagos" que ya usa cobranza para verificar (confirmado con un cliente
// real, mismo monto centavo a centavo).
async function renglonesCobradoDinero(companyIds: number[], monthStart: Date, monthEnd: Date): Promise<Renglon[]> {
  // No filtramos account.partial.reconcile por fecha en el dominio: el
  // campo que representa la "fecha de abono" (paymentMove.date) vive en
  // account.move, dos saltos mas alla del reconcile. Se filtra abajo, ya
  // emparejado, por ese unico campo.
  const reconciles = await fetchPaginated(
    "account.partial.reconcile",
    [],
    ["amount", "debit_move_id", "credit_move_id"],
  );
  if (reconciles.length === 0) return [];

  const lineIds = new Set<number>();
  reconciles.forEach((r) => {
    if (r.debit_move_id) lineIds.add(r.debit_move_id[0]);
    if (r.credit_move_id) lineIds.add(r.credit_move_id[0]);
  });

  const lines = await callOdooRPC<any[]>(
    "account.move.line", "search_read",
    [[["id", "in", Array.from(lineIds)]]],
    { fields: ["move_id"] },
  );
  const lineToMoveMap: Record<number, number> = {};
  (lines || []).forEach((l) => { lineToMoveMap[l.id] = l.move_id[0]; });

  const moves = await fetchPaginated(
    "account.move",
    [["company_id", "in", companyIds]],
    ["state", "amount_total", "partner_id", "move_type", "date", "invoice_date", "invoice_payment_term_id", "journal_id"],
  );
  const moveMap: Record<number, any> = {};
  moves.forEach((m) => { moveMap[m.id] = m; });

  const startStr = monthStart.toISOString().split("T")[0];
  const endStr = monthEnd.toISOString().split("T")[0];

  const renglones: Renglon[] = [];
  reconciles.forEach((r) => {
    const dMove = moveMap[lineToMoveMap[r.debit_move_id?.[0]]];
    const cMove = moveMap[lineToMoveMap[r.credit_move_id?.[0]]];
    if (!dMove || !cMove) return;

    const dIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(dMove.move_type);
    const cIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(cMove.move_type);
    if (dIsCustomerInvoice === cIsCustomerInvoice) return;

    const invoiceMove = dIsCustomerInvoice ? dMove : cMove;
    const paymentMove = dIsCustomerInvoice ? cMove : dMove;

    if (CUSTOMER_INVOICE_TYPES.has(paymentMove.move_type)) return;
    if (!invoiceMove.partner_id || isSupricom(invoiceMove.partner_id)) return;

    const fechaAbono = (paymentMove.date || "").split(" ")[0].split("T")[0];
    if (fechaAbono < startStr || fechaAbono > endStr) return;

    const fechaFactura = (invoiceMove.invoice_date || "").split(" ")[0].split("T")[0];
    // "Del mes" = factura emitida en el mismo mes que se selecciono (o
    // despues, caso raro de pago adelantado). "Anterior" = deuda de un
    // mes previo que se termino de cobrar ahora.
    const esDelMes = !fechaFactura || fechaFactura >= startStr;

    renglones.push({
      monto: r.amount || 0,
      partnerId: invoiceMove.partner_id[0],
      partnerName: invoiceMove.partner_id[1] || "Sin cliente",
      paymentTermId: invoiceMove.invoice_payment_term_id?.[0],
      esDelMes,
      // El "banco" es el diario del lado PAGO de la conciliacion (donde
      // realmente entro el dinero), no el diario de la factura.
      journalId: paymentMove.journal_id?.[0],
      journalName: paymentMove.journal_id?.[1] || "Sin diario",
    });
  });
  return renglones;
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
    const modoParam = searchParams.get("modo");
    const modo = modoParam === "cobrado" ? "cobrado" : "facturado";

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

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const renglones = modo === "cobrado"
      ? await renglonesCobradoDinero(companyIds, monthStart, monthEnd)
      : await renglonesFacturado(companyIds, monthStart, monthEnd);

    // ── Nombres de los plazos de pago vistos ──
    const ptIds = [...new Set(renglones.map((r) => r.paymentTermId).filter((id): id is number => Boolean(id)))];
    let ptMap: Record<number, string> = {};
    if (ptIds.length > 0) {
      try {
        const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
        (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
      } catch (_) {}
    }

    // ── Clasificar contado/credito + acumular por plazo exacto ──
    // Un card por cada plazo real que aparezca (7, 15, 21, 30, 45...),
    // sin agrupar los que no matchean una lista fija en un "Otros" opaco.
    type ClientAcum = { partnerId: number; partnerName: string; monto: number; facturas: number };
    type Acum = {
      monto: number;
      facturas: number;
      clientesMap: Map<number, ClientAcum>;
    };
    const nuevoAcum = (): Acum => ({ monto: 0, facturas: 0, clientesMap: new Map() });

    const contado = nuevoAcum();
    const credito = nuevoAcum();
    const bucketsPorDias = new Map<number, Acum>();
    // Solo relevante en modo "cobrado": por que diario/banco entro el
    // dinero (journal_id del lado pago de la conciliacion).
    const bancosPorJournal = new Map<number, Acum>();
    const bancoNombres = new Map<number, string>();
    // Solo relevante en modo "cobrado": de lo cobrado, cuanto es de
    // facturas de este mes vs de meses anteriores (deuda vieja cobrada
    // ahora). Alimenta la barra de progreso del total en ese modo.
    let delMesMonto = 0;
    let delMesFacturas = 0;
    let anterioresMonto = 0;
    let anterioresFacturas = 0;

    const acumular = (acum: Acum, monto: number, partnerId: number, partnerName: string) => {
      acum.monto += monto;
      acum.facturas += 1;
      const c = acum.clientesMap.get(partnerId);
      if (c) {
        c.monto += monto;
        c.facturas += 1;
      } else {
        acum.clientesMap.set(partnerId, { partnerId, partnerName, monto, facturas: 1 });
      }
    };

    renglones.forEach((r) => {
      if (r.esDelMes) {
        delMesMonto += r.monto;
        delMesFacturas += 1;
      } else {
        anterioresMonto += r.monto;
        anterioresFacturas += 1;
      }

      if (r.journalId !== undefined) {
        bancoNombres.set(r.journalId, r.journalName);
        if (!bancosPorJournal.has(r.journalId)) bancosPorJournal.set(r.journalId, nuevoAcum());
        acumular(bancosPorJournal.get(r.journalId)!, r.monto, r.partnerId, r.partnerName);
      }

      const ptName = ptMap[r.paymentTermId ?? -1] || "Contado";
      const diasMatch = ptName.match(/(\d+)/);

      if (!diasMatch) {
        acumular(contado, r.monto, r.partnerId, r.partnerName);
        return;
      }

      const dias = parseInt(diasMatch[1], 10);
      acumular(credito, r.monto, r.partnerId, r.partnerName);

      if (!bucketsPorDias.has(dias)) bucketsPorDias.set(dias, nuevoAcum());
      acumular(bucketsPorDias.get(dias)!, r.monto, r.partnerId, r.partnerName);
    });

    const totalFacturado = contado.monto + credito.monto;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const pct = (parte: number, total: number) => (total > 0 ? round2((parte / total) * 100) : 0);

    const clientesDe = (acum: Acum) =>
      [...acum.clientesMap.values()]
        .map((c) => ({ ...c, monto: round2(c.monto) }))
        .sort((a, b) => b.monto - a.monto);

    const buckets = [...bucketsPorDias.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dias, acum]) => ({
        dias,
        monto: round2(acum.monto),
        pct: pct(acum.monto, credito.monto),
        facturas: acum.facturas,
        clientes: acum.clientesMap.size,
        clientesDetalle: clientesDe(acum),
      }));

    const bancos = [...bancosPorJournal.entries()]
      .sort((a, b) => b[1].monto - a[1].monto)
      .map(([journalId, acum]) => ({
        journalId,
        journalName: bancoNombres.get(journalId) || "Sin diario",
        monto: round2(acum.monto),
        pct: pct(acum.monto, totalFacturado),
        facturas: acum.facturas,
        clientes: acum.clientesMap.size,
        clientesDetalle: clientesDe(acum),
      }));

    return NextResponse.json({
      success: true,
      data: {
        totalFacturado: round2(totalFacturado),
        contado: {
          monto: round2(contado.monto),
          pct: pct(contado.monto, totalFacturado),
          facturas: contado.facturas,
          clientes: contado.clientesMap.size,
          clientesDetalle: clientesDe(contado),
        },
        credito: {
          monto: round2(credito.monto),
          pct: pct(credito.monto, totalFacturado),
          facturas: credito.facturas,
          clientes: credito.clientesMap.size,
          clientesDetalle: clientesDe(credito),
        },
        delMes: {
          monto: round2(delMesMonto),
          pct: pct(delMesMonto, totalFacturado),
          facturas: delMesFacturas,
        },
        mesesAnteriores: {
          monto: round2(anterioresMonto),
          pct: pct(anterioresMonto, totalFacturado),
          facturas: anterioresFacturas,
        },
        buckets,
        bancos,
        filters: {
          empresa,
          month: currentMonth + 1,
          year: currentYear,
          companyIds,
          modo,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error CxC contado-credito API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
