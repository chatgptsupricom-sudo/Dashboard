import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { leerProductos } from "@/lib/rma/items";
import {
  adjuntosDelCaso,
  casosDelVendedor,
  despachosDelCaso,
  ingresosDelCaso,
  notasDelCaso,
} from "@/lib/rma/vendedor";

export const dynamic = "force-dynamic";

/**
 * GET /api/vendedores/rma/:id
 * Todo el proceso de un caso de RMA de un cliente del vendedor: el ticket, la
 * recepción en Seguridad, los cambios de estado, la nota de crédito y la
 * entrega. Solo lectura. Un caso que no es de sus clientes responde 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["vendedor", "seller"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const caseId = parseInt(id, 10);
    if (!caseId) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

    const esSuperAdmin = String(auth.payload.role || "").toLowerCase().trim() === "superadmin";
    if (!esSuperAdmin) {
      const sellerId = parseInt(String(auth.payload.uid || ""), 10);
      if (!sellerId) {
        return NextResponse.json({ error: "Token inválido: falta UID" }, { status: 401 });
      }
      // 404 y no 403: no se confirma que exista un caso de otro vendedor.
      if (!(await casosDelVendedor(sellerId)).includes(caseId)) {
        return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
      }
    }

    const r = await query(`SELECT * FROM rma_cases WHERE id = ?`, [caseId]);
    const fila = (r.rows as any[])[0];
    if (!fila) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    const { tracking_token, ...caso } = fila;

    const [history, items, adjuntos, ingresos, despachos, notas] = await Promise.all([
      query(`SELECT * FROM rma_history WHERE case_id = ? ORDER BY created_at ASC, id ASC`, [caseId]).then(
        (h) => h.rows as any[],
      ),
      leerProductos(caseId).catch(() => []),
      adjuntosDelCaso(caseId),
      ingresosDelCaso(caseId),
      despachosDelCaso(caseId),
      notasDelCaso(caseId),
    ]);

    return NextResponse.json({
      success: true,
      case: caso,
      history,
      items,
      adjuntos,
      ingresos,
      despachos,
      notas,
    });
  } catch (error: any) {
    console.error("Error en /api/vendedores/rma/[id]:", error);
    return NextResponse.json({ error: error.message || "No se pudo cargar el caso" }, { status: 500 });
  }
}
