import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles, obtenerSemanasDelMes } from "@/lib/feriados";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS kpi_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kpi_key VARCHAR(100) NOT NULL,
    company_id INT NOT NULL,
    meta_mensual DECIMAL(15,2) NOT NULL DEFAULT 0,
    mes VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_kpi (kpi_key, company_id, mes)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS kpi_weekly_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kpi_key VARCHAR(100) NOT NULL,
    company_id INT NOT NULL,
    mes VARCHAR(7) NOT NULL,
    semana_index INT NOT NULL,
    semana_label VARCHAR(50),
    valor DECIMAL(15,2) DEFAULT 0,
    meta DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_kpi_week (kpi_key, company_id, mes, semana_index)
  )`);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTables();

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const semanas = obtenerSemanasDelMes(anio, mesNum);
    const numSemanas = semanas.length;

    // 1. Load saved weekly data from DB
    const savedData = await query(
      "SELECT kpi_key, semana_index, valor, meta FROM kpi_weekly_data WHERE company_id = ? AND mes = ?",
      [companyId, mes]
    );
    const savedMap: Record<string, Record<number, { valor: number; meta: number }>> = {};
    (savedData.rows as any[]).forEach((row) => {
      if (!savedMap[row.kpi_key]) savedMap[row.kpi_key] = {};
      savedMap[row.kpi_key][row.semana_index] = { valor: Number(row.valor), meta: Number(row.meta) };
    });

    // 2. Fetch cuota data
    let sellers: any[] = [];
    let totalCuotaMensual = 0;
    try {
      const cuotaResult = await query(
        `SELECT s.id as seller_id, s.name, s.user_id, c.cuota 
         FROM sellers s 
         INNER JOIN (
           SELECT seller_id, cuota FROM cuota 
           WHERE id IN (SELECT MAX(id) FROM cuota GROUP BY seller_id)
         ) c ON s.id = c.seller_id
         WHERE s.cids = ?`,
        [companyId]
      );
      sellers = cuotaResult.rows as any[];
      totalCuotaMensual = sellers.reduce((sum, s) => sum + Number(s.cuota || 0), 0);
    } catch (e: any) {
      console.error("Error cuota:", e.message);
    }

    // 3. Fetch invoices for the month
    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

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
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id"],
        limit: 10000,
      }
    );

    // 4. Normalize seller names
    const normalizedSellerMap: Record<string, string> = {};
    const sellerMap: Record<string, { nombre: string; cuotaMensual: number; facturadoMensual: number; semanas: { facturado: number; cuotaSemanal: number }[] }> = {};
    sellers.forEach((s) => {
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
      sellerMap[s.name] = {
        nombre: s.name,
        cuotaMensual: Number(s.cuota || 0),
        facturadoMensual: 0,
        semanas: semanas.map(() => ({ facturado: 0, cuotaSemanal: 0 })),
      };
    });

    // 5. Distribute invoices
    (invoices || []).forEach((inv: any) => {
      const sellerName = inv.invoice_user_id?.[1];
      if (!sellerName) return;
      const invNorm = normalize(sellerName);
      const matchedName = normalizedSellerMap[invNorm];
      const amount = Number(inv.amount_untaxed) || 0;

      if (matchedName && sellerMap[matchedName]) {
        sellerMap[matchedName].facturadoMensual += amount;
        const invDate = new Date(inv.invoice_date);
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
            sellerMap[matchedName].semanas[i].facturado += amount;
            break;
          }
        }
      }
    });

    // 6. Calculate weekly quota by business days
    const totalDiasUtilesMes = contarDiasUtiles(new Date(anio, mesNum - 1, 1), new Date(anio, mesNum, 0));
    Object.values(sellerMap).forEach((seller) => {
      semanas.forEach((semana, i) => {
        seller.semanas[i].cuotaSemanal = totalDiasUtilesMes > 0
          ? (seller.cuotaMensual * semana.diasUtiles) / totalDiasUtilesMes
          : seller.cuotaMensual / numSemanas;
      });
    });

    // 7. Calculate visitas (activities per seller from Odoo)
    let visitasPorSeller: Record<string, number> = {};
    try {
      const sellerUserIds = sellers.map((s) => s.user_id).filter(Boolean);
      if (sellerUserIds.length > 0) {
        const allSellerInvoices = invoices || [];
        const invoiceIds = allSellerInvoices.map((inv: any) => inv.id);
        if (invoiceIds.length > 0) {
          const activities = await callOdooRPC<any[]>(
            "mail.message",
            "search_read",
            [
              [
                ["model", "=", "account.move"],
                ["subtype_id", "=", 2], // mail.mt_comment or activity
                ["create_date", ">=", fechaInicio],
                ["create_date", "<=", fechaFin],
              ],
            ],
            {
              fields: ["author_id", "create_date"],
              limit: 5000,
            }
          );
          (activities || []).forEach((act: any) => {
            const authorName = act.author_id?.[1];
            if (!authorName) return;
            const norm = normalize(authorName);
            const matchedName = normalizedSellerMap[norm];
            if (matchedName) {
              visitasPorSeller[matchedName] = (visitasPorSeller[matchedName] || 0) + 1;
            }
          });
        }
      }
    } catch (_) {}

    // 8. Calculate new clients
    // A "cliente nuevo" = partner whose FIRST invoice in Odoo is in the current month.
    // Goal = meta per seller (e.g. 10 means each seller must capture 10 new clients).
    // Weekly % = (new clients that week) / (goal_per_seller * num_sellers * dias_utiles_semana / dias_utiles_mes) * 100

    const clientesNuevosPorSeller: Record<string, number> = {};
    const clientesNuevosPorSellerPorSemana: Record<string, Record<number, number>> = {};

    try {
      // Collect unique partner_ids from current month invoices
      const currentMonthPartnerIds = [...new Set(
        (invoices || [])
          .map((inv: any) => inv.partner_id?.[0])
          .filter(Boolean)
      )];

      if (currentMonthPartnerIds.length > 0) {
        // For each partner, check if they have ANY invoice before the current month
        // Use Odoo RPC to find invoices for these partners before fechaInicio
        const historicalInvoices = await callOdooRPC<any[]>(
          "account.move",
          "search_read",
          [
            [
              ["partner_id", "in", currentMonthPartnerIds],
              ["invoice_date", "<", fechaInicio],
              ["move_type", "in", ["out_invoice", "out_refund"]],
              ["state", "=", "posted"],
              ["company_id", "=", companyId],
            ],
          ],
          {
            fields: ["partner_id"],
            limit: 50000,
          }
        );

        // Build set of partners who already existed (had invoices before this month)
        const existingPartnerIds = new Set<number>();
        (historicalInvoices || []).forEach((inv: any) => {
          const pid = inv.partner_id?.[0];
          if (pid) existingPartnerIds.add(pid);
        });

        // Now determine new clients from current month invoices
        // A partner is "new" if they are NOT in existingPartnerIds
        // Each partner is counted only once (first invoice in the current month)
        const partnerAlreadyCounted = new Set<number>();

        (invoices || []).forEach((inv: any) => {
          const partnerId = inv.partner_id?.[0];
          if (!partnerId) return;
          if (existingPartnerIds.has(partnerId)) return;
          if (partnerAlreadyCounted.has(partnerId)) return;

          partnerAlreadyCounted.add(partnerId);

          const sellerName = inv.invoice_user_id?.[1];
          if (!sellerName) return;
          const norm = normalize(sellerName);
          const matchedName = normalizedSellerMap[norm];
          if (!matchedName) return;

          clientesNuevosPorSeller[matchedName] = (clientesNuevosPorSeller[matchedName] || 0) + 1;

          // Track by week
          const invDate = new Date(inv.invoice_date);
          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              if (!clientesNuevosPorSellerPorSemana[matchedName]) {
                clientesNuevosPorSellerPorSemana[matchedName] = {};
              }
              clientesNuevosPorSellerPorSemana[matchedName][i] =
                (clientesNuevosPorSellerPorSemana[matchedName][i] || 0) + 1;
              break;
            }
          }
        });

        console.log(`[Stoplight] Clientes nuevos: ${partnerAlreadyCounted.size} de ${currentMonthPartnerIds.length} partners del mes (${existingPartnerIds.size} ya existian)`);
      }
    } catch (e: any) {
      console.error("Error calculating new clients:", e.message);
    }

    // 9. Build week headers
    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    // 10. Build KPI data
    const totalFacturadoMensual = Object.values(sellerMap).reduce((sum, s) => sum + s.facturadoMensual, 0);
    const porcentajeCumplimiento = totalCuotaMensual > 0 ? Math.round((totalFacturadoMensual / totalCuotaMensual) * 100) : 0;

    const semanaCuota = semanas.map((_, i) => {
      const facturadoSemana = Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].facturado, 0);
      const cuotaSemana = Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].cuotaSemanal, 0);
      const pct = cuotaSemana > 0 ? Math.round((facturadoSemana / cuotaSemana) * 100) : 0;
      return `${pct}%`;
    });

    const totalVisitasMes = Object.values(visitasPorSeller).reduce((sum, v) => sum + v, 0);
    const semanaVisitas = semanas.map((_, i) => {
      const saved = savedMap["visitas_semanales"]?.[i];
      return saved ? String(saved.valor) : null;
    });

    const totalClientesNuevos = Object.values(clientesNuevosPorSeller).reduce((sum, v) => sum + v, 0);
    const numSellers = sellers.length || 1;

    // Load metas first (need clientes_nuevos goal)
    const kpiKeys = ["cumplimiento_cuota_ventas", "margen_bruto", "visitas_semanales", "efectividad_cierre", "activacion_cartera", "clientes_nuevos", "cobertura_marcas"];
    const metasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ?",
      [companyId, mes]
    );
    const metasMap: Record<string, number> = {};
    (metasResult.rows as any[]).forEach((r) => { metasMap[r.kpi_key] = Number(r.meta_mensual); });

    const metaClientesNuevos = metasMap["clientes_nuevos"] || 0; // goal per seller

    // Calculate weekly % for clientes nuevos:
    // Goal per week for the whole team = meta_per_seller * num_sellers * (diasUtilesSemana / diasUtilesMes)
    const semanaClientes = semanas.map((semana, i) => {
      if (metaClientesNuevos <= 0) return null;

      const newClientsThisWeek = Object.values(clientesNuevosPorSellerPorSemana).reduce(
        (sum, semanaMap) => sum + (semanaMap[i] || 0), 0
      );

      const goalThisWeek = metaClientesNuevos * numSellers * (semana.diasUtiles / totalDiasUtilesMes);
      if (goalThisWeek <= 0) return null;

      const pct = Math.round((newClientsThisWeek / goalThisWeek) * 100);
      return `${pct}%`;
    });

    const semanaMargen = semanas.map((_, i) => {
      const saved = savedMap["margen_bruto"]?.[i];
      return saved ? `${saved.valor}%` : null;
    });

    const semanaEfectividad = semanas.map((_, i) => {
      const saved = savedMap["efectividad_cierre"]?.[i];
      return saved ? `${saved.valor}%` : null;
    });

    const semanaActivacion = semanas.map((_, i) => {
      const saved = savedMap["activacion_cartera"]?.[i];
      return saved ? `${saved.valor}%` : null;
    });

    const semanaCobertura = semanas.map((_, i) => {
      const saved = savedMap["cobertura_marcas"]?.[i];
      return saved ? `${saved.valor}%` : null;
    });

    // Average for each KPI
    const avgFromWeeks = (weeks: (string | null)[]) => {
      const vals = weeks.filter(Boolean).map((w) => parseInt(w!)).filter((n) => !isNaN(n));
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };

    let latestPct = 0;
    for (let i = semanaCuota.length - 1; i >= 0; i--) {
      const val = parseInt(semanaCuota[i]);
      if (!isNaN(val) && val > 0) { latestPct = val; break; }
    }

    return NextResponse.json({
      success: true,
      data: {
        metaMensual: metasMap["cumplimiento_cuota_ventas"] || totalCuotaMensual,
        totalCuotaMensual,
        totalFacturadoMensual,
        porcentajeCumplimiento,
        totalVisitasMes,
        totalClientesNuevos,
        numSemanas,
        weekHeaders,
        sellers: Object.values(sellerMap),
        semanaGlobal: semanaCuota,
        trend: latestPct >= 100 ? "green" : latestPct >= 75 ? "yellow" : "red",
        semanaVisitas,
        semanaClientes,
        semanaMargen,
        semanaEfectividad,
        semanaActivacion,
        semanaCobertura,
        avgCumplimiento: avgFromWeeks(semanaCuota),
        avgMargen: avgFromWeeks(semanaMargen),
        avgVisitas: avgFromWeeks(semanaVisitas),
        avgEfectividad: avgFromWeeks(semanaEfectividad),
        avgActivacion: avgFromWeeks(semanaActivacion),
        avgClientes: avgFromWeeks(semanaClientes),
        avgCobertura: avgFromWeeks(semanaCobertura),
        metas: metasMap,
        sellersVisitas: visitasPorSeller,
        sellersClientes: clientesNuevosPorSeller,
        metaClientesNuevos,
      },
    });
  } catch (error: any) {
    console.error("Error en API Stoplight:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTables();

    const body = await request.json();
    const { type } = body;

    if (type === "save_meta") {
      const { kpi_key, company_id, meta_mensual, mes } = body;
      if (!kpi_key || !company_id || !mes) {
        return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
      }
      await query(
        `INSERT INTO kpi_targets (kpi_key, company_id, meta_mensual, mes) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE meta_mensual = VALUES(meta_mensual)`,
        [kpi_key, company_id, meta_mensual || 0, mes]
      );
      return NextResponse.json({ success: true });
    }

    if (type === "save_weekly") {
      const { kpi_key, company_id, mes, semana_index, semana_label, valor, meta } = body;
      if (!kpi_key || !company_id || !mes || semana_index === undefined) {
        return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
      }
      await query(
        `INSERT INTO kpi_weekly_data (kpi_key, company_id, mes, semana_index, semana_label, valor, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), meta = VALUES(meta), semana_label = VALUES(semana_label)`,
        [kpi_key, company_id, mes, semana_index, semana_label || "", valor || 0, meta || 0]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Tipo de accion no valido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error guardando KPI:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
