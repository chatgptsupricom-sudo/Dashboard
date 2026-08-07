import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
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
      `SELECT id, case_number, client_name, product_name, status, technician_name, created_at
       FROM rma_cases WHERE 1=1 ${companyFilter}
       ORDER BY created_at DESC LIMIT 10`,
      params
    );

    // Status map
    const statusMap: Record<string, number> = {
      recibido: 0,
      en_reparacion: 0,
      reparado: 0,
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
        inRepair: statusMap.en_reparacion || 0,
        completedThisMonth: completedResult.rows[0]?.total || 0,
        thisMonth: monthResult.rows[0]?.total || 0,
        byStatus: statusMap,
      },
      recent: recentResult.rows,
    });
  } catch (error: any) {
    console.error("Error fetching RMA stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
