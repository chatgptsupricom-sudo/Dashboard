import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_INVOICE_TYPES = new Set(["out_invoice", "out_refund"]);
const INVOICE_LIKE_TYPES = new Set([
  "out_invoice",
  "out_refund",
  "in_invoice",
  "in_refund",
]);

async function fetchPaginated(
  model: string,
  domain: any[],
  fields: string[],
): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model,
      "search_read",
      [domain],
      { fields, order: "id DESC", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const isSuperAdmin = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
    const allCompanyIds = [9, 10, 7];
    let userCompanyId: number;

    if (auth.payload?.cids) {
      userCompanyId = parseInt(auth.payload.cids as string);
    } else if (isSuperAdmin) {
      userCompanyId = 0;
    } else {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }

    // 2. PARÁMETROS
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = (searchParams.get("search") || "").toLowerCase();
    const vendedor = searchParams.get("vendedor");
    const fechaInicioRaw = searchParams.get("fechaInicio") || "";
    const fechaFinRaw = searchParams.get("fechaFin") || "";

    // 3. CONSULTAS ODOO (Forzando userCompanyId)
    const [companies, allUsers] = await Promise.all([
      callOdooRPC<any[]>(
        "res.company",
        "search_read",
        [[userCompanyId === 0 ? ["id", "in", allCompanyIds] : ["id", "=", userCompanyId]]],
        {
          fields: ["id", "name"],
        },
      ),
      callOdooRPC<any[]>(
        "res.users",
        "search_read",
        [[["share", "=", false]]],
        {
          fields: ["id", "name"],
        },
      ),
    ]);

    // No filtramos account.partial.reconcile por fecha en el dominio: el
    // campo que representa la "fecha de abono" (paymentMove.date) vive en
    // account.move, dos saltos más allá del reconcile, así que no se puede
    // expresar en un único dominio de Odoo sin arriesgar excluir facturas
    // legítimas cuya fecha cae fuera del rango. Se filtra abajo, ya
    // emparejado, por ese único campo.
    const reconciles = await fetchPaginated(
      "account.partial.reconcile",
      [],
      ["create_date", "amount", "debit_move_id", "credit_move_id"],
    );

    if (!reconciles.length) {
      return NextResponse.json({
        results: [],
        total_count: 0,
        companies: companies || [],
        vendedores: allUsers || [],
      });
    }

    // 4. MAPEO Y RELACIONES
    const lineIds = new Set<number>();
    reconciles.forEach((r) => {
      if (r.debit_move_id) lineIds.add(r.debit_move_id[0]);
      if (r.credit_move_id) lineIds.add(r.credit_move_id[0]);
    });

    const lines =
      (await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [[["id", "in", Array.from(lineIds)]]],
        {
          fields: ["move_id"],
        },
      )) || [];

    const lineToMoveMap = Object.fromEntries(
      lines.map((l) => [l.id, l.move_id[0]]),
    );

    const moves = await fetchPaginated(
      "account.move",
      [userCompanyId === 0 ? ["company_id", "in", allCompanyIds] : ["company_id", "=", userCompanyId]],
      [
        "name",
        "state",
        "amount_total",
        "partner_id",
        "invoice_user_id",
        "invoice_date",
        "move_type",
        "date",
      ],
    );

    const moveMap = Object.fromEntries(moves.map((m) => [m.id, m]));
    const partnerIds = new Set(
      moves.map((m) => m.partner_id?.[0]).filter(Boolean),
    );
    const partners =
      (await callOdooRPC<any[]>(
        "res.partner",
        "search_read",
        [[["id", "in", Array.from(partnerIds)]]],
        {
          fields: ["vat", "name"],
        },
      )) || [];
    const partnerMap = Object.fromEntries(partners.map((p) => [p.id, p]));

    // 5. TRANSFORMACIÓN Y FILTROS
    let resultado = reconciles
      .map((r) => {
        const dMove = moveMap[lineToMoveMap[r.debit_move_id?.[0]]];
        const cMove = moveMap[lineToMoveMap[r.credit_move_id?.[0]]];
        if (!dMove || !cMove) return null;

        // Exactamente un lado debe ser factura/nota de crédito de cliente;
        // el otro debe ser el pago que la salda. Si ambos lados o ninguno
        // califican, no es un par factura+pago de cliente.
        const dIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(dMove.move_type);
        const cIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(cMove.move_type);
        if (dIsCustomerInvoice === cIsCustomerInvoice) return null;

        const invoiceMove = dIsCustomerInvoice ? dMove : cMove;
        const paymentMove = dIsCustomerInvoice ? cMove : dMove;

        // El lado "pago" no puede ser a su vez una factura/nota de crédito.
        if (INVOICE_LIKE_TYPES.has(paymentMove.move_type)) return null;

        const partner = partnerMap[invoiceMove.partner_id?.[0]];

        return {
          fecha_contable: r.create_date,
          doc_abono: paymentMove?.name || "-",
          status: paymentMove?.state === "cancel" ? "Anulado" : "Vigente",
          valor_abono: r.amount || 0,
          valor_pagado: r.amount || 0,
          nit_cif_ruc: partner?.vat || "-",
          cliente: partner?.name || invoiceMove.partner_id?.[1] || "-",
          factura: invoiceMove.name || "-",
          fecha_factura: invoiceMove.invoice_date || "-",
          vendedor_id: invoiceMove.invoice_user_id?.[0],
          vendedor: invoiceMove.invoice_user_id?.[1] || "Sin Vendedor",
          fecha_abono: paymentMove?.date || r.create_date,
        };
      })
      .filter((r): r is any => r !== null);

    // FILTRO DE FECHA (ABONO) — un único campo (fecha_abono, derivado de
    // paymentMove.date), comparado como texto YYYY-MM-DD para no reintroducir
    // desfaces de huso horario al pasar por Date().
    if (fechaInicioRaw && fechaFinRaw) {
      const startStr = fechaInicioRaw.split("T")[0];
      const endStr = fechaFinRaw.split("T")[0];

      resultado = resultado.filter((r) => {
        const abonoStr = r.fecha_abono
          ? String(r.fecha_abono).split(" ")[0].split("T")[0]
          : "";
        return abonoStr >= startStr && abonoStr <= endStr;
      });
    }

    // FILTROS
    if (vendedor && vendedor !== "all")
      resultado = resultado.filter((r) => r.vendedor_id === parseInt(vendedor));

    if (search)
      resultado = resultado.filter(
        (r) =>
          r.cliente.toLowerCase().includes(search) ||
          r.factura.toLowerCase().includes(search),
      );

    const paginated = resultado.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      results: paginated,
      total_count: resultado.length,
      companies: (companies || []).map((c) => ({ cid: c.id.toString(), name: c.name })),
      vendedores: (allUsers || [])
        .filter((u) => moves.some((m) => m.invoice_user_id?.[0] === u.id))
        .map((v) => ({ id: v.id.toString(), name: v.name })),
    });
  } catch (error: any) {
    console.error("❌ Error en API Integración Pago:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
