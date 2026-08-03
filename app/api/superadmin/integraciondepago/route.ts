// import { callOdooRPC } from "@/lib/odoo";
// import { NextResponse } from "next/server";

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const cid = parseInt(searchParams.get("cid") || "9");
//     const page = parseInt(searchParams.get("page") || "1");
//     const limit = parseInt(searchParams.get("limit") || "10");
//     const search = (searchParams.get("search") || "").toLowerCase();
//     const vendedor = searchParams.get("vendedor");
//     const fechaInicioRaw = searchParams.get("fechaInicio") || "";
//     const fechaFinRaw = searchParams.get("fechaFin") || "";

//     const cleanDate = (dateStr: string) => {
//       if (!dateStr) return null;
//       return dateStr.split("Z")[0].replace("T", " ").split(".")[0];
//     };

//     const fechaInicio = cleanDate(fechaInicioRaw);
//     const fechaFin = cleanDate(fechaFinRaw);

//     // 1. Obtener datos base de Odoo
//     // 1. Obtener datos base de Odoo
//     const [companies, vendedores] = await Promise.all([
//       callOdooRPC<any[]>("res.company", "search_read", [[]], {
//         fields: ["id", "name"],
//       }),
//       callOdooRPC<any[]>(
//         "res.users",
//         "search_read",
//         [[["share", "=", false]]],
//         { fields: ["id", "name"] },
//       ),
//     ]);
//     // 2. Definir dominio (Fechas)
//     const domain: any[] = [];
//     if (fechaInicio) domain.push(["create_date", ">=", fechaInicio]);
//     if (fechaFin) domain.push(["create_date", "<=", fechaFin]);

//     const reconciles =
//       (await callOdooRPC<any[]>(
//         "account.partial.reconcile",
//         "search_read",
//         [domain],
//         {
//           context: { allowed_company_ids: [cid] },
//           fields: ["create_date", "amount", "debit_move_id", "credit_move_id"],
//           order: "id DESC",
//           limit: 2000,
//         },
//       )) || [];

//     if (!reconciles.length) {
//       return NextResponse.json({
//         results: [],
//         total_count: 0,
//         companies,
//         vendedores,
//       });
//     }

//     // 3. Procesar relaciones (Moves y Partners)
//     const lineIds = new Set<number>();
//     reconciles.forEach((r) => {
//       if (r.debit_move_id) lineIds.add(r.debit_move_id[0]);
//       if (r.credit_move_id) lineIds.add(r.credit_move_id[0]);
//     });

//     const lines =
//       (await callOdooRPC<any[]>(
//         "account.move.line",
//         "search_read",
//         [[["id", "in", Array.from(lineIds)]]],
//         { fields: ["move_id"] },
//       )) || [];
//     const lineToMoveMap = Object.fromEntries(
//       lines.map((l) => [l.id, l.move_id[0]]),
//     );
//     const moveIds = new Set(lines.map((l) => l.move_id[0]));

//     const moves =
//       (await callOdooRPC<any[]>(
//         "account.move",
//         "search_read",
//         [[["company_id", "=", cid]]], // Mantén este filtro
//         {
//           fields: [
//             "name",
//             "state",
//             "amount_total",
//             "partner_id",
//             "invoice_user_id",
//             "invoice_date",
//             "move_type",
//             "date",
//           ],
//           limit: 5000, // Aumenta si tienes muchas transacciones
//         },
//       )) || [];

//     const empresasPermitidas = companies.filter((c) =>
//       [7, 9, 10].includes(c.id),
//     );

//     const moveMap = Object.fromEntries(moves.map((m) => [m.id, m]));
//     const partnerIds = new Set(
//       moves.map((m) => m.partner_id?.[0]).filter(Boolean),
//     );
//     const partners =
//       (await callOdooRPC<any[]>(
//         "res.partner",
//         "search_read",
//         [[["id", "in", Array.from(partnerIds)]]],
//         { fields: ["vat", "name"] },
//       )) || [];
//     const partnerMap = Object.fromEntries(partners.map((p) => [p.id, p]));

//     // 4. Transformación de datos
//     let resultado = reconciles
//       .map((r) => {
//         const dMove = moveMap[lineToMoveMap[r.debit_move_id?.[0]]];
//         const cMove = moveMap[lineToMoveMap[r.credit_move_id?.[0]]];
//         if (!dMove || !cMove) return null;

//         const isDInvoice = dMove.move_type === "out_invoice";
//         const invoiceMove = isDInvoice ? dMove : cMove;
//         const paymentMove = isDInvoice ? cMove : dMove;
//         if (!invoiceMove) return null;

//         const partner = partnerMap[invoiceMove.partner_id?.[0]];

//         return {
//           fecha_contable: r.create_date,
//           doc_abono: paymentMove?.name || "-",
//           status: paymentMove?.state === "cancel" ? "Anulado" : "Vigente",
//           valor_abono: r.amount || 0,
//           nit_cif_ruc: partner?.vat || "-",
//           cliente: partner?.name || invoiceMove.partner_id?.[1] || "-",
//           factura: invoiceMove.name || "-",
//           fecha_factura: invoiceMove.invoice_date || "-",
//           valor_pagado: r.amount || 0,
//           vendedor_id: invoiceMove.invoice_user_id?.[0],
//           vendedor: invoiceMove.invoice_user_id?.[1] || "Sin Vendedor",
//           fecha_abono: paymentMove?.date || r.create_date,
//         };
//       })
//       .filter((r): r is any => r !== null);

//     // 5. Filtros en memoria y paginación
//     if (vendedor && vendedor !== "all")
//       resultado = resultado.filter((r) => r.vendedor_id === parseInt(vendedor));
//     if (search)
//       resultado = resultado.filter(
//         (r) =>
//           r.cliente.toLowerCase().includes(search) ||
//           r.factura.toLowerCase().includes(search),
//       );
//     const vendedorIds = [
//       ...new Set(moves.map((m) => m.invoice_user_id?.[0]).filter(Boolean)),
//     ];
//     const vendedoresFiltrados =
//       (await callOdooRPC<any[]>(
//         "res.users",
//         "search_read",
//         [[["id", "in", Array.from(vendedorIds)]]],
//         { fields: ["id", "name"] },
//       )) || [];
//     const paginated = resultado.slice((page - 1) * limit, page * limit);

//     return NextResponse.json({
//       results: paginated,
//       total_count: resultado.length,
//       companies: empresasPermitidas.map((c) => ({
//         cid: c.id.toString(),
//         name: c.name,
//       })),
//       vendedores: vendedoresFiltrados.map((v) => ({
//         id: v.id.toString(),
//         name: v.name,
//       })),
//     });
//   } catch (error: any) {
//     console.error("Error API:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cid = parseInt(searchParams.get("cid") || "9");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = (searchParams.get("search") || "").toLowerCase();
    const vendedor = searchParams.get("vendedor");
    const fechaInicioRaw = searchParams.get("fechaInicio") || "";
    const fechaFinRaw = searchParams.get("fechaFin") || "";

    const cleanDate = (dateStr: string) => {
      if (!dateStr) return null;
      return dateStr.split("Z")[0].replace("T", " ").split(".")[0];
    };

    const fechaInicio = cleanDate(fechaInicioRaw);
    const fechaFin = cleanDate(fechaFinRaw);

    // 1. Obtener datos base de Odoo
    const [companies, allUsers] = await Promise.all([
      callOdooRPC<any[]>("res.company", "search_read", [[]], {
        fields: ["id", "name"],
      }),
      callOdooRPC<any[]>(
        "res.users",
        "search_read",
        [[["share", "=", false]]],
        { fields: ["id", "name"] },
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
          context: { allowed_company_ids: [cid] },
          fields: ["create_date", "amount", "debit_move_id", "credit_move_id"],
          order: "id DESC",
          limit: 2000,
        },
      )) || [];

    if (!reconciles.length) {
      return NextResponse.json({
        results: [],
        total_count: 0,
        companies: companies.filter((c) => [7, 9, 10].includes(c.id)),
        vendedores: allUsers,
      });
    }

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
        { fields: ["move_id"] },
      )) || [];
    const lineToMoveMap = Object.fromEntries(
      lines.map((l) => [l.id, l.move_id[0]]),
    );
    const moveIds = new Set(lines.map((l) => l.move_id[0]));

    const moves =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[["company_id", "=", cid]]],
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

    // --- LÓGICA DE VENDEDORES DINÁMICOS ---
    // Extraemos los IDs de usuarios que aparecen en los movimientos de esta empresa
    const activeUserIds = new Set(
      moves.map((m) => m.invoice_user_id?.[0]).filter(Boolean),
    );
    const vendedoresFiltrados = allUsers.filter((u) => activeUserIds.has(u.id));

    const partnerIds = new Set(
      moves.map((m) => m.partner_id?.[0]).filter(Boolean),
    );
    const partners =
      (await callOdooRPC<any[]>(
        "res.partner",
        "search_read",
        [[["id", "in", Array.from(partnerIds)]]],
        { fields: ["vat", "name"] },
      )) || [];
    const partnerMap = Object.fromEntries(partners.map((p) => [p.id, p]));

    let resultado = reconciles
      .map((r) => {
        const dMove = moveMap[lineToMoveMap[r.debit_move_id?.[0]]];
        const cMove = moveMap[lineToMoveMap[r.credit_move_id?.[0]]];
        if (!dMove || !cMove) return null;

        const isDInvoice = dMove.move_type === "out_invoice";
        const invoiceMove = isDInvoice ? dMove : cMove;
        const paymentMove = isDInvoice ? cMove : dMove;
        if (!invoiceMove) return null;

        const partner = partnerMap[invoiceMove.partner_id?.[0]];

        return {
          fecha_contable: r.create_date,
          doc_abono: paymentMove?.name || "-",
          status: paymentMove?.state === "cancel" ? "Anulado" : "Vigente",
          valor_abono: r.amount || 0,
          nit_cif_ruc: partner?.vat || "-",
          cliente: partner?.name || invoiceMove.partner_id?.[1] || "-",
          factura: invoiceMove.name || "-",
          fecha_factura: invoiceMove.invoice_date || "-",
          valor_pagado: r.amount || 0,
          vendedor_id: invoiceMove.invoice_user_id?.[0],
          vendedor: invoiceMove.invoice_user_id?.[1] || "Sin Vendedor",
          fecha_abono: paymentMove?.date || r.create_date,
        };
      })
      .filter((r): r is any => r !== null);

    if (vendedor && vendedor !== "all") {
      resultado = resultado.filter((r) => r.vendedor_id === parseInt(vendedor));
    }

    // FILTRO DE BÚSQUEDA
    if (search) {
      resultado = resultado.filter(
        (r) =>
          r.cliente.toLowerCase().includes(search) ||
          r.factura.toLowerCase().includes(search),
      );
    }

    // FILTRO DE FECHA (ABONO) - AJUSTADO AQUÍ
    if (fechaInicio && fechaFin) {
      const start = new Date(fechaInicio).getTime();
      const end = new Date(fechaFin).getTime();

      resultado = resultado.filter((r) => {
        // Usamos la fecha_abono calculada en la transformación
        const abonoDate = new Date(r.fecha_abono).getTime();
        return abonoDate >= start && abonoDate <= end;
      });
    }

    const paginated = resultado.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      results: paginated,
      total_count: resultado.length,
      companies: companies
        .filter((c) => [7, 9, 10].includes(c.id))
        .map((c) => ({ cid: c.id.toString(), name: c.name })),
      vendedores: vendedoresFiltrados.map((v) => ({
        id: v.id.toString(),
        name: v.name,
      })),
    });
  } catch (error: any) {
    console.error("Error API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
