import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { hayTablaProductos } from "@/lib/rma/items";
import { casosDelVendedor } from "@/lib/rma/vendedor";

export const dynamic = "force-dynamic";

/**
 * GET /api/vendedores/rma
 * Casos de RMA de los clientes del vendedor de la sesión (lib/rma/vendedor.ts).
 * Solo lectura. El SuperAdmin ve todos.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["vendedor", "seller"]);
  if (auth.error) return auth.error;

  try {
    const esSuperAdmin = String(auth.payload.role || "").toLowerCase().trim() === "superadmin";
    let ids: number[] | null = null;
    if (!esSuperAdmin) {
      const sellerId = parseInt(String(auth.payload.uid || ""), 10);
      if (!sellerId) {
        return NextResponse.json({ error: "Token inválido: falta UID" }, { status: 401 });
      }
      ids = await casosDelVendedor(sellerId);
      if (ids.length === 0) return NextResponse.json({ success: true, cases: [] });
    }

    const conProductos = await hayTablaProductos();
    const r = await query(
      `SELECT c.*,
              ${conProductos ? "(SELECT COUNT(*) FROM rma_case_items i WHERE i.case_id = c.id)" : "1"} AS productos_count,
              (SELECT MAX(h.created_at) FROM rma_history h WHERE h.case_id = c.id) AS ultimo_movimiento
         FROM rma_cases c
        ${ids ? `WHERE c.id IN (${ids.map(() => "?").join(",")})` : ""}
        ORDER BY c.created_at DESC
        LIMIT 1000`,
      ids ?? [],
    );

    const cases = (r.rows as any[]).map(({ tracking_token, entrega_datos, ...c }) => c);
    return NextResponse.json({ success: true, cases });
  } catch (error: any) {
    console.error("Error en /api/vendedores/rma:", error);
    return NextResponse.json({ error: error.message || "No se pudieron cargar los casos" }, { status: 500 });
  }
}
