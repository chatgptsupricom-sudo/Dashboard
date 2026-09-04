import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
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

const BUCKETS_ESTANDAR = [7, 15, 30, 60, 90];

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

    // ── Facturas del mes ──
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

    const isSupricom = (inv: any) => (inv.partner_id?.[1] || "").toLowerCase().includes("supricom");
    const invoices = invoicesRaw.filter((inv) => !isSupricom(inv) && inv.partner_id);

    // ── Nombres de los plazos de pago usados este mes ──
    const ptIds = [...new Set(invoices.map((f) => f.invoice_payment_term_id?.[0]).filter(Boolean))];
    let ptMap: Record<number, string> = {};
    if (ptIds.length > 0) {
      try {
        const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
        (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
      } catch (_) {}
    }

    // ── Clasificar contado/credito + acumular por bucket ──
    type ClientAcum = { partnerId: number; partnerName: string; monto: number; facturas: number };
    type Acum = {
      monto: number;
      facturas: number;
      clientesMap: Map<number, ClientAcum>;
      diasVistos: Set<number>;
    };
    const nuevoAcum = (): Acum => ({ monto: 0, facturas: 0, clientesMap: new Map(), diasVistos: new Set() });

    const contado = nuevoAcum();
    const credito = nuevoAcum();
    const bucketsPorDias = new Map<number | "Otros", Acum>();

    const acumular = (acum: Acum, monto: number, partnerId: number, partnerName: string, dias?: number) => {
      acum.monto += monto;
      acum.facturas += 1;
      if (dias !== undefined) acum.diasVistos.add(dias);
      const c = acum.clientesMap.get(partnerId);
      if (c) {
        c.monto += monto;
        c.facturas += 1;
      } else {
        acum.clientesMap.set(partnerId, { partnerId, partnerName, monto, facturas: 1 });
      }
    };

    invoices.forEach((inv) => {
      const monto = inv.move_type === "out_refund" ? -(inv.amount_total || 0) : (inv.amount_total || 0);
      const partnerId = inv.partner_id[0];
      const partnerName = inv.partner_id[1] || "Sin cliente";
      const ptName = ptMap[inv.invoice_payment_term_id?.[0]] || "Contado";
      const diasMatch = ptName.match(/(\d+)/);

      if (!diasMatch) {
        acumular(contado, monto, partnerId, partnerName);
        return;
      }

      const dias = parseInt(diasMatch[1], 10);
      acumular(credito, monto, partnerId, partnerName);

      const bucketKey: number | "Otros" = BUCKETS_ESTANDAR.includes(dias) ? dias : "Otros";
      if (!bucketsPorDias.has(bucketKey)) bucketsPorDias.set(bucketKey, nuevoAcum());
      acumular(bucketsPorDias.get(bucketKey)!, monto, partnerId, partnerName, dias);
    });

    const totalFacturado = contado.monto + credito.monto;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const pct = (parte: number, total: number) => (total > 0 ? round2((parte / total) * 100) : 0);

    const clientesDe = (acum: Acum) =>
      [...acum.clientesMap.values()]
        .map((c) => ({ ...c, monto: round2(c.monto) }))
        .sort((a, b) => b.monto - a.monto);

    const buckets = [...bucketsPorDias.entries()]
      .sort((a, b) => {
        if (a[0] === "Otros") return 1;
        if (b[0] === "Otros") return -1;
        return (a[0] as number) - (b[0] as number);
      })
      .map(([dias, acum]) => ({
        dias,
        // Solo tiene contenido para el bucket "Otros" -- los plazos reales
        // que agrupa (ej. 21, 45), para no perder esa info como antes.
        diasIncluidos: dias === "Otros" ? [...acum.diasVistos].sort((a, b) => a - b) : [],
        monto: round2(acum.monto),
        pct: pct(acum.monto, credito.monto),
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
        buckets,
        filters: {
          empresa,
          month: currentMonth + 1,
          year: currentYear,
          companyIds,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error CxC contado-credito API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
