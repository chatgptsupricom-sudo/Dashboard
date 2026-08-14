import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // 1. AUTENTICACIÓN Y PARÁMETROS
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const isSuperAdmin = (payload.role as string)?.toLowerCase().trim() === "superadmin";
    const allCompanyIds = [9, 10, 7];
    let userCompanyId: number;
    let companyFilter: any[];

    if (payload.cids) {
      userCompanyId = parseInt(payload.cids as string);
      companyFilter = ["company_id", "=", userCompanyId];
    } else if (isSuperAdmin) {
      userCompanyId = 0; // sentinel for "all"
      companyFilter = ["company_id", "in", allCompanyIds];
    } else {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country") || "VE";
    const vendorId = searchParams.get("vendor_id");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // For superAdmin viewing all companies, filter by country
    const COUNTRY_TO_COMPANIES: Record<string, number[]> = {
      VE: [9, 10],
      PA: [7],
    };
    if (userCompanyId === 0 && COUNTRY_TO_COMPANIES[countryCode]) {
      companyFilter = ["company_id", "in", COUNTRY_TO_COMPANIES[countryCode]];
    }

    let clientsToProcess: any[] = [];
    const periodTotals = new Map<number, number>();

    // =========================================================
    // 2. LÓGICA CONDICIONAL: ¿RANGO DE FECHAS O HISTORIAL TOTAL?
    // =========================================================

    if (startDate && endDate) {
      // ---> MODO A: RANGO DE FECHAS (Buscar en Facturas)
      const invoiceDomain: any[] = [
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        companyFilter,
        ["invoice_date", ">=", startDate],
        ["invoice_date", "<=", endDate],
      ];

      // Agrupamos las facturas por cliente y sumamos el monto
      const invoiceGroupData =
        (await callOdooRPC<any[]>("account.move", "read_group", [
          invoiceDomain,
          ["amount_total", "partner_id"],
          ["partner_id"],
          0,
          0,
          "amount_total desc",
        ])) || [];

      const partnerIds: number[] = [];
      invoiceGroupData.forEach((inv) => {
        if (inv.partner_id && inv.partner_id[0]) {
          partnerIds.push(inv.partner_id[0]);
          periodTotals.set(inv.partner_id[0], inv.amount_total || 0);
        }
      });

      // Si hubo ventas, buscamos los datos geográficos de esos clientes
      if (partnerIds.length > 0) {
        const clientDomain: any[] = [
          ["id", "in", partnerIds],
          ["is_company", "=", true],
          ["state_id", "!=", false],
          // La verificación de empresa se hace en memoria más abajo
        ];
        if (countryCode)
          clientDomain.push(["country_id.code", "=", countryCode]);
        if (vendorId && vendorId !== "all")
          clientDomain.push(["user_id", "=", parseInt(vendorId)]);

        clientsToProcess =
          (await callOdooRPC<any[]>("res.partner", "search_read", [
            clientDomain,
            ["name", "state_id", "city", "vat", "user_id", "company_id"],
          ])) || [];
      }
    } else {
      // ---> MODO B: HISTORIAL TOTAL (Buscar directo en Clientes)
      const domain: any[] = [
        ["is_company", "=", true],
        ["state_id", "!=", false],
        companyFilter,
      ];

      if (countryCode) domain.push(["country_id.code", "=", countryCode]);
      if (vendorId && vendorId !== "all")
        domain.push(["user_id", "=", parseInt(vendorId)]);

      clientsToProcess =
        (await callOdooRPC<any[]>("res.partner", "search_read", [
          domain,
          [
            "name",
            "state_id",
            "city",
            "vat",
            "total_invoiced",
            "user_id",
            "company_id",
          ],
        ])) || [];
    }

    // =========================================================
    // 3. FILTRADO ESTRICTO EN MEMORIA (Seguridad garantizada)
    // =========================================================
    const filteredClients = clientsToProcess.filter(
      (c) => !c.company_id || (userCompanyId === 0 ? allCompanyIds.includes(c.company_id[0]) : c.company_id[0] === userCompanyId),
    );

    // =========================================================
    // 4. PROCESAMIENTO DE ESTADÍSTICAS DEL MAPA
    // =========================================================
    const stateStats: Record<string, any> = {};

    filteredClients.forEach((client) => {
      // Asignar el revenue correcto dependiendo del modo
      const revenue =
        startDate && endDate
          ? periodTotals.get(client.id) || 0 // Lo facturado en el rango
          : client.total_invoiced || 0; // Lo facturado históricamente

      const stateName = client.state_id[1]
        .split("(")[0]
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (!stateStats[stateName]) {
        stateStats[stateName] = {
          count: 0,
          revenue: 0,
          clients: [],
          original_name: client.state_id[1],
        };
      }

      stateStats[stateName].count += 1;
      stateStats[stateName].revenue += revenue;
      stateStats[stateName].clients.push({
        name: client.name,
        city: client.city || "N/A",
        rif: client.vat || "N/A",
        value: revenue,
        seller: client.user_id ? client.user_id[1] : "Sin Vendedor",
      });
    });

    // =========================================================
    // 5. OBTENER VENDEDORES PARA EL DROPDOWN
    // =========================================================
    const allClients = await callOdooRPC<any[]>("res.partner", "search_read", [
      [
        ["is_company", "=", true],
        companyFilter,
      ],
      ["user_id"],
    ]);

    const allSellerIds = Array.from(
      new Set(
        allClients
          .map((c) => (c.user_id ? c.user_id[0] : null))
          .filter(Boolean),
      ),
    );

    const sellers =
      allSellerIds.length > 0
        ? await callOdooRPC<any[]>("res.users", "search_read", [
            [
              ["id", "in", allSellerIds],
              ["company_ids", "in", userCompanyId === 0 ? allCompanyIds : [userCompanyId]],
            ],
            ["name"],
          ])
        : [];

    console.log(
      `CLIENTES PROCESADOS: ${filteredClients.length} | MODO: ${startDate ? "RANGO" : "HISTORIAL"}`,
    );

    // Determine effective company_id for response
    const effectiveCompanyId = userCompanyId === 0
      ? (COUNTRY_TO_COMPANIES[countryCode]?.[0] || null)
      : userCompanyId;

    return NextResponse.json({
      summary: Object.entries(stateStats).map(([state, data]) => ({
        state: data.original_name,
        state_key: state,
        count: data.count,
        revenue: data.revenue,
        clients: data.clients,
      })),
      total_clients: filteredClients.length,
      currency: "USD",
      applied_company_id: effectiveCompanyId,
      company_id: effectiveCompanyId,
      sellers: sellers,
    });
  } catch (error: any) {
    console.error("❌ ERROR API CLIENTES:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
