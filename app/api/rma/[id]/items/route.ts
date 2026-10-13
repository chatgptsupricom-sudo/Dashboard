import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { crearProductos, hayTablaProductos, leerProductos, sincronizarEnvio, type EstadoProducto } from "@/lib/rma/items";
import { hayEstadosFlujo } from "@/lib/rma/flujo";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST: agrega un producto a un envío que ya existe (issue #331). Es como RMA
 * carga desde el panel un envío con varios productos: crea el caso con el
 * primero y agrega los demás acá. El producto nuevo entra "por llegar" si el
 * envío todavía no llegó, y si no "en diagnóstico" ("recibido" sin la
 * migración de lib/rma/flujo.ts), así que un envío que estaba terminado
 * vuelve a quedar en curso.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    if (!(await hayTablaProductos())) {
      return NextResponse.json(
        { error: "Falta correr la migración sql/rma_case_items.sql" },
        { status: 409 },
      );
    }

    const { id } = await params;
    const caseId = parseInt(id, 10);
    const existe = await query(`SELECT id, status FROM rma_cases WHERE id = ?`, [caseId]);
    if (!(existe.rows as any[]).length) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
    const model = texto(body.model, 500);
    const reportedFault = texto(body.reported_fault, 5000);
    if (!model || !reportedFault) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: model, reported_fault" },
        { status: 400 },
      );
    }

    const estado: EstadoProducto = !(await hayEstadosFlujo())
      ? "recibido"
      : (existe.rows as any[])[0].status === "por_llegar"
        ? "por_llegar"
        : "en_diagnostico";

    const actuales = await leerProductos(caseId);
    const orden = actuales.reduce((m, p) => Math.max(m, p.orden), 0) + 1;
    const [itemId] = await crearProductos(caseId, [
      {
        orden,
        product_code: texto(body.product_code, 100),
        hardware: texto(body.hardware, 200),
        brand: texto(body.brand, 100),
        model,
        serial: texto(body.serial, 200),
        reported_fault: reportedFault,
      },
    ], undefined, estado);
    if (!itemId) {
      return NextResponse.json({ error: "No se pudo agregar el producto" }, { status: 500 });
    }

    const changedBy = auth.payload?.name || "Sistema";
    await query(
      `INSERT INTO rma_history (case_id, item_id, from_status, to_status, changed_by, notes)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [caseId, itemId, estado, changedBy, `Producto agregado al envío: ${model}`],
    );
    await sincronizarEnvio(caseId, { changedBy, origenPeticion: getPublicOrigin(request) });

    return NextResponse.json({ success: true, id: itemId }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/rma/[id]/items error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
