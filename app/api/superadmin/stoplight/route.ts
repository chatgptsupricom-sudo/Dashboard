import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { esDiaUtil, contarDiasUtiles, obtenerSemanasDelMes } from "@/lib/feriados";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

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

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);
    console.log("Stoplight companyId:", companyId, "type:", typeof companyId);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const semanas = obtenerSemanasDelMes(anio, mesNum);
    const numSemanas = semanas.length;

    // 1. Fetch meta from kpi_targets (auto-create table if needed)
    let metaMensual = 0;
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS kpi_targets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          kpi_key VARCHAR(100) NOT NULL,
          company_id INT NOT NULL,
          meta_mensual DECIMAL(15,2) NOT NULL DEFAULT 0,
          mes VARCHAR(7) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_kpi (kpi_key, company_id, mes)
        )`
      );
      const metaResult = await query(
        "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = 'cumplimiento_cuota_ventas' AND company_id = ? AND mes = ?",
        [companyId, mes]
      );
      metaMensual = metaResult.rows.length > 0 ? Number(metaResult.rows[0].meta_mensual) : 0;
    } catch (_) {
      // Tabla kpi_targets no existe aun, usar meta 0
    }

    // 2. Fetch cuota data from sellers + cuota tables (get latest cuota per seller)
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
      console.log("Stoplight cuota sellers:", sellers.length, "total:", totalCuotaMensual);
    } catch (e: any) {
      console.error("Error en query cuota stoplight:", e.message);
    }

    // 3. Fetch actual invoices from Odoo for this month
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
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date"],
        limit: 10000,
      }
    );

    // 4. Build weekly data per seller
    function normalize(str: string): string {
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\./g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, " ");
    }

    const normalizedSellerMap: Record<string, string> = {};
    const sellerMap: Record<string, { nombre: string; cuotaMensual: number; facturadoMensual: number; semanas: { facturado: number; cuotaSemanal: number }[] }> = {};

    sellers.forEach((s) => {
      const cuotaNum = Number(s.cuota || 0);
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
      sellerMap[s.name] = {
        nombre: s.name,
        cuotaMensual: cuotaNum,
        facturadoMensual: 0,
        semanas: semanas.map(() => ({ facturado: 0, cuotaSemanal: 0 })),
      };
    });

    (invoices || []).forEach((inv: any) => {
      const sellerName = inv.invoice_user_id?.[1];
      if (!sellerName) return;
      const invNorm = normalize(sellerName);
      const matchedName = normalizedSellerMap[invNorm];
      if (!matchedName || !sellerMap[matchedName]) return;
      const amount = Number(inv.amount_untaxed) || 0;
      sellerMap[matchedName].facturadoMensual += amount;

      const invDate = new Date(inv.invoice_date);
      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          sellerMap[matchedName].semanas[i].facturado += amount;
          break;
        }
      }
    });

    // 5. Calculate weekly quota considering business days
    const totalDiasUtilesMes = contarDiasUtiles(new Date(anio, mesNum - 1, 1), new Date(anio, mesNum, 0));

    Object.values(sellerMap).forEach((seller) => {
      semanas.forEach((semana, i) => {
        seller.semanas[i].cuotaSemanal = totalDiasUtilesMes > 0
          ? (seller.cuotaMensual * semana.diasUtiles) / totalDiasUtilesMes
          : seller.cuotaMensual / numSemanas;
      });
    });

    // 6. Build week headers
    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    // 7. Build KPI row data - global view
    const totalFacturadoMensual = Object.values(sellerMap).reduce((sum, s) => sum + s.facturadoMensual, 0);
    const porcentajeCumplimiento = totalCuotaMensual > 0 ? Math.round((totalFacturadoMensual / totalCuotaMensual) * 100) : 0;

    const semanaGlobal = semanas.map((_, i) => {
      const facturadoSemana = Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].facturado, 0);
      const cuotaSemana = Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].cuotaSemanal, 0);
      const pct = cuotaSemana > 0 ? Math.round((facturadoSemana / cuotaSemana) * 100) : 0;
      return `${pct}%`;
    });

    // Determine trend based on latest week with data
    let latestPct = 0;
    for (let i = semanaGlobal.length - 1; i >= 0; i--) {
      const val = parseInt(semanaGlobal[i]);
      if (!isNaN(val) && val > 0) { latestPct = val; break; }
    }

    return NextResponse.json({
      success: true,
      data: {
        metaMensual,
        totalCuotaMensual,
        totalFacturadoMensual,
        porcentajeCumplimiento,
        numSemanas,
        weekHeaders,
        sellers: Object.values(sellerMap),
        semanaGlobal,
        trend: latestPct >= 100 ? "green" : latestPct >= 75 ? "yellow" : "red",
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

    const body = await request.json();
    const { kpi_key, company_id, meta_mensual, mes } = body;

    if (!kpi_key || !company_id || !mes) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    await query(
      `CREATE TABLE IF NOT EXISTS kpi_targets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_key VARCHAR(100) NOT NULL,
        company_id INT NOT NULL,
        meta_mensual DECIMAL(15,2) NOT NULL DEFAULT 0,
        mes VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_kpi (kpi_key, company_id, mes)
      )`
    );

    await query(
      `INSERT INTO kpi_targets (kpi_key, company_id, meta_mensual, mes) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE meta_mensual = VALUES(meta_mensual)`,
      [kpi_key, company_id, meta_mensual || 0, mes]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error guardando meta KPI:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
