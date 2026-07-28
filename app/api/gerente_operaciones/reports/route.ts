import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    // 1. AUTENTICACIÓN SEGURA MEDIANTE TOKEN
    const token = req.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    const userCompanyId = parseInt(payload?.cids as string);

    if (!userCompanyId)
      return NextResponse.json(
        { error: "Empresa no definida" },
        { status: 403 },
      );

    // 2. PARÁMETROS
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = (searchParams.get("search") || "").toLowerCase();
    const vendedor = searchParams.get("vendedor");
    const fechaInicioRaw = searchParams.get("fechaInicio");
    const fechaFinRaw = searchParams.get("fechaFin");

    const cleanDate = (dateStr: string | null) =>
      dateStr ? dateStr.split("Z")[0].replace("T", " ").split(".")[0] : null;
    const fechaInicio = cleanDate(fechaInicioRaw);
    const fechaFin = cleanDate(fechaFinRaw);

    // 3. CONSULTAS ODOO (Forzando userCompanyId)
    const [companies, allUsers] = await Promise.all([
      callOdooRPC<any[]>(
        "res.company",
        "search_read",
        [[["id", "=", userCompanyId]]],
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

    const domain: any[] = [];
    if (fechaInicio) domain.push(["create_date", ">=", fechaInicio]);
    if (fechaFin) domain.push(["create_date", "<=", fechaFin]);

    const reconciles =
      (await callOdooRPC<any[]>(
        "account.partial.reconcile",
        "search_read",
        [domain],
        {
          context: { allowed_company_ids: [userCompanyId] },
          fields: ["create_date", "amount", "debit_move_id", "credit_move_id"],
          order: "id DESC",
          limit: 2000,
        },
      )) || [];

    if (!reconciles.length) {
      return NextResponse.json({
        results: [],
        total_count: 0,
        companies,
        vendedores: allUsers,
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

    const moves =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[["company_id", "=", userCompanyId]]],
        {
          fields: [
            "name",
            "state",
            "amount_total",
            "partner_id",
            "invoice_user_id",
            "invoice_date",
            "move_type",
            "date",
          ],
          limit: 5000,
        },
      )) || [];

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

        const isDInvoice = dMove.move_type === "out_invoice";
        const invoiceMove = isDInvoice ? dMove : cMove;
        const paymentMove = isDInvoice ? cMove : dMove;
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
      companies: companies.map((c) => ({ cid: c.id.toString(), name: c.name })),
      vendedores: allUsers
        .filter((u) => moves.some((m) => m.invoice_user_id?.[0] === u.id))
        .map((v) => ({ id: v.id.toString(), name: v.name })),
    });
  } catch (error: any) {
    console.error("❌ Error en API Integración Pago:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
