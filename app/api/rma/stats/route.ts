import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id") || "";

    let companyFilter = "";
    const params: any[] = [];

    if (companyId) {
      companyFilter = "AND company_id = ?";
      params.push(parseInt(companyId, 10));
    }

    // Total cases
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM rma_cases WHERE 1=1 ${companyFilter}`,
      params
    );

    // By status
    const statusResult = await query(
      `SELECT status, COUNT(*) as count FROM rma_cases WHERE 1=1 ${companyFilter} GROUP BY status`,
      params
    );

    // This month
    const monthResult = await query(
      `SELECT COUNT(*) as total FROM rma_cases WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) ${companyFilter}`,
      params
    );

    // This month completed
    const completedResult = await query(
      `SELECT COUNT(*) as total FROM rma_cases WHERE status IN ('reparado','entregado') AND MONTH(updated_at) = MONTH(NOW()) AND YEAR(updated_at) = YEAR(NOW()) ${companyFilter}`,
      params
    );

    // Last 10 cases
    const recentResult = await query(
      `SELECT id, case_number, client_name, model, product_code, hardware, status, created_at
       FROM rma_cases WHERE 1=1 ${companyFilter}
       ORDER BY created_at DESC LIMIT 10`,
      params
    );

    // Status map
    const statusMap: Record<string, number> = {
      recibido: 0,
      reparado: 0,
      nota_credito: 0,
      no_procesado: 0,
      reingresado: 0,
    };
    statusResult.rows.forEach((r: any) => {
      statusMap[r.status] = r.count;
    });

    const pending = statusMap.recibido || 0;

    return NextResponse.json({
      success: true,
      stats: {
        total: totalResult.rows[0]?.total || 0,
        pending,
        completedThisMonth: completedResult.rows[0]?.total || 0,
        thisMonth: monthResult.rows[0]?.total || 0,
        notaCredito: statusMap.nota_credito || 0,
        noProcesado: statusMap.no_procesado || 0,
        reingresado: statusMap.reingresado || 0,
        byStatus: statusMap,
      },
      recent: recentResult.rows,
    });
  } catch (error: any) {
    console.error("Error fetching RMA stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
