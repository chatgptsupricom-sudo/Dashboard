import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const periodoParam = url.searchParams.get("periodo") || "mes";
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    let fechaInicio: string;
    let fechaFin: string;
    let periodoLabel: string;

    if (periodoParam === "trimestre") {
      const trimestre = Math.ceil(mesNum / 3);
      const mesInicioTrimestre = (trimestre - 1) * 3 + 1;
      fechaInicio = `${anio}-${String(mesInicioTrimestre).padStart(2, "0")}-01`;
      const ultimoDiaTrimestre = new Date(anio, mesInicioTrimestre + 2, 0).getDate();
      fechaFin = `${anio}-${String(mesInicioTrimestre + 2).padStart(2, "0")}-${ultimoDiaTrimestre}`;
      periodoLabel = `Trimestre ${trimestre} ${anio}`;
    } else if (periodoParam === "anio") {
      fechaInicio = `${anio}-01-01`;
      fechaFin = `${anio}-12-31`;
      periodoLabel = `Año ${anio}`;
    } else if (periodoParam === "todo") {
      fechaInicio = "2000-01-01";
      fechaFin = "2099-12-31";
      periodoLabel = "Todo el tiempo";
    } else {
      fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mesNum, 0).getDate();
      fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;
      periodoLabel = `${now.toLocaleString("es-VE", { month: "long" })} ${anio}`;
    }

    const semanas = (() => {
      const result: { inicio: Date; fin: Date; diasUtiles: number; label: string }[] = [];
      const fechaInicioDate = new Date(fechaInicio);
      const fechaFinDate = new Date(fechaFin);
      let inicio = new Date(fechaInicioDate);

      while (inicio <= fechaFinDate) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > fechaFinDate) fin = new Date(fechaFinDate);
        
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        const label = `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`;
        
        result.push({
          inicio: new Date(inicio),
          fin: new Date(fin),
          diasUtiles: contarDiasUtiles(inicio, fin),
          label,
        });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    // 1. Fetch sellers
    const cuotaResult = await query(
      `SELECT s.id as seller_id, s.name, s.user_id
       FROM sellers s
       WHERE s.cids = ?`,
      [companyId]
    );
    const sellers = cuotaResult.rows as any[];
    console.log(`[Activacion] company=${companyId} sellers found:`, sellers.length, sellers.map(s => s.name));

    // 2. Fetch all clients assigned to sellers (res.partner with user_id)
    const sellerUserIds = sellers.map(s => s.user_id).filter(Boolean);
    const sellerClientsMap: Record<string, { total: number; clientIds: Set<number>; ActivosPorSemana: number[] }> = {};
    
    // Initialize sellers
    sellers.forEach((s: any) => {
      const norm = normalize(s.name);
      sellerClientsMap[norm] = {
        total: 0,
        clientIds: new Set(),
        ActivosPorSemana: semanas.map(() => 0),
      };
    });

    // Fetch clients for each seller
    for (const seller of sellers) {
      if (!seller.user_id) {
        console.log(`[Activacion] Seller ${seller.name} has no user_id, skipping`);
        continue;
      }
      try {
        console.log(`[Activacion] Fetching clients for ${seller.name} (user_id=${seller.user_id})`);
        const clients = (await callOdooRPC<any[]>(
          "res.partner",
          "search_read",
          [
            [
              ["user_id", "=", seller.user_id],
              ["customer_rank", ">", 0],
              ["active", "=", true],
            ],
          ],
          {
            fields: ["id", "name"],
            limit: 10000,
          }
        )) || [];

        console.log(`[Activacion] ${seller.name} has ${clients.length} clients`);
        const norm = normalize(seller.name);
        if (sellerClientsMap[norm]) {
          sellerClientsMap[norm].total = clients.length;
          clients.forEach((c: any) => sellerClientsMap[norm].clientIds.add(c.id));
        }
      } catch (e: any) {
        console.error(`Error fetching clients for ${seller.name}:`, e.message);
      }
    }

    // 3. Fetch invoices for the period
    const invoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
          ["invoice_date", ">=", fechaInicio],
          ["invoice_date", "<=", fechaFin],
          ["invoice_user_id", "!=", false],
        ],
      ],
      {
        fields: ["id", "invoice_user_id", "partner_id", "invoice_date"],
        limit: 50000,
      }
    );

    console.log(`[Activacion] Invoices found:`, (invoices || []).length);

    // 4. Normalize seller names for matching
    const normalizedSellerMap: Record<string, string> = {};
    sellers.forEach((s: any) => {
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
    });

    // 5. Process invoices to find active clients per seller
    const sellerActiveClients: Record<string, Set<number>> = {};
    Object.keys(sellerClientsMap).forEach(name => { sellerActiveClients[name] = new Set(); });
    
    const sellerActiveClientsPorSemana: Record<string, Set<number>[]> = {};
    Object.keys(sellerClientsMap).forEach(name => { 
      sellerActiveClientsPorSemana[name] = semanas.map(() => new Set()); 
    });

    let matchedInvoices = 0;
    let matchedClients = 0;
    (invoices || []).forEach((inv: any) => {
      const sellerName = inv.invoice_user_id?.[1];
      if (!sellerName) return;
      const norm = normalize(sellerName);
      const matchedName = normalizedSellerMap[norm];
      if (!matchedName) return;

      const partnerId = inv.partner_id?.[0];
      if (!partnerId) return;

      matchedInvoices++;
      // Check if this client belongs to this seller
      if (sellerClientsMap[norm]?.clientIds.has(partnerId)) {
        sellerActiveClients[norm]?.add(partnerId);
        matchedClients++;

        // Distribute by week
        const invDate = new Date(inv.invoice_date);
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
            sellerActiveClientsPorSemana[norm]?.[i]?.add(partnerId);
            break;
          }
        }
      }
    });

    console.log(`[Activacion] matchedInvoices=${matchedInvoices} matchedClients=${matchedClients}`);
    Object.keys(sellerActiveClients).forEach(name => {
      console.log(`[Activacion] ${name}: total=${sellerClientsMap[name].total} active=${sellerActiveClients[name].size}`);
    });

    // 6. Load meta
    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["activacion_cartera", companyId, mes]
    );
    const metaActivacion = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    // 7. Build response
    const result = Object.keys(sellerClientsMap).map((name) => {
      const data = sellerClientsMap[name];
      const activos = sellerActiveClients[name]?.size || 0;
      const total = data.total;
      const activacion = total > 0 ? Math.round((activos / total) * 100) : 0;
      const activacionPct = metaActivacion > 0 ? Math.round((activos / metaActivacion) * 100) : (total > 0 ? Math.round((activos / total) * 100) : 0);

      const semanasCalc = semanas.map((sem, i) => {
        const semanaInicio = sem.inicio;
        const esFuturo = semanaInicio > new Date();
        const activosSem = sellerActiveClientsPorSemana[name]?.[i]?.size || 0;
        const activacionSem = metaActivacion > 0
          ? Math.round((activosSem / metaActivacion) * 100)
          : (total > 0 ? Math.round((activosSem / total) * 100) : null);
        return {
          numero: i + 1,
          label: sem.label,
          activos: activosSem,
          total,
          activacion: esFuturo ? null : activacionSem,
        };
      });

      return {
        nombre: name,
        totalClientes: total,
        clientesActivos: activos,
        activacion: activacionPct,
        semanas: semanasCalc,
      };
    });

    result.sort((a, b) => b.activacion - a.activacion);

    // 7. Global totals
    const globalTotal = result.reduce((sum, s) => sum + s.totalClientes, 0);
    const globalActivos = result.reduce((sum, s) => sum + s.clientesActivos, 0);
    const globalActivacion = globalTotal > 0 ? Math.round((globalActivos / globalTotal) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        mes,
        periodo: periodoParam,
        periodoLabel,
        fechaInicio,
        fechaFin,
        global: {
          totalClientes: globalTotal,
          clientesActivos: globalActivos,
          activacion: globalActivacion,
        },
        sellers: result,
      },
    });
  } catch (error: any) {
    console.error("Error en API activacion-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
