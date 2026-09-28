import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { espejarPrimeroEnCaso, leerProductos, sincronizarEnvio, type EstadoProducto } from "@/lib/rma/items";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

const ESTADOS: EstadoProducto[] = ["recibido", "reparado", "nota_credito", "no_procesado", "reingresado"];

// Lo que se edita de un producto. El estado va aparte: deja historial.
const CAMPOS: Record<string, number> = {
  product_code: 100,
  hardware: 200,
  brand: 100,
  model: 500,
  serial: 200,
  reported_fault: 5000,
  diagnosis: 5000,
  notes: 5000,
};

async function productoDelCaso(caseId: number, itemId: number) {
  const productos = await leerProductos(caseId);
  return { productos, producto: productos.find((p) => p.id === itemId) ?? null };
}

/**
 * PUT: RMA atiende un producto del envío (issue #331): su estado, diagnóstico
 * y notas, o corrige sus datos. El cambio de estado queda en el historial con
 * el producto, y el caso se recalcula (estado general, correo al cliente al
 * terminar el envío). Con un solo producto, el caso lo refleja igual que
 * antes (los campos del caso son los del primer producto).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id, itemId } = await params;
    const caseId = parseInt(id, 10);
    const { productos, producto } = await productoDelCaso(caseId, parseInt(itemId, 10));
    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado en este caso" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const sets: string[] = [];
    const valores: unknown[] = [];
    for (const [campo, max] of Object.entries(CAMPOS)) {
      if (body[campo] === undefined) continue;
      sets.push(`${campo} = ?`);
      valores.push(body[campo] === null ? null : String(body[campo]).slice(0, max));
    }

    const status = body.status as EstadoProducto | undefined;
    if (status !== undefined && !ESTADOS.includes(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const cambiaEstado = !!status && status !== producto.status;
    if (cambiaEstado) {
      sets.push("status = ?");
      valores.push(status);
    }
    if (!sets.length) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    await query(`UPDATE rma_case_items SET ${sets.join(", ")} WHERE id = ?`, [...valores, producto.id]);

    const changedBy = auth.payload?.name || body.changed_by || "Sistema";
    if (cambiaEstado) {
      await query(
        `INSERT INTO rma_history (case_id, item_id, from_status, to_status, changed_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [caseId, producto.id, producto.status, status, changedBy, body.change_notes || null],
      );
    }

    // El primer producto es el que se ve en los campos del caso (lista,
    // búsqueda, Seguridad, correos de siempre): se mantienen al día.
    await espejarPrimeroEnCaso(caseId);

    const envio = await sincronizarEnvio(caseId, { changedBy, origenPeticion: getPublicOrigin(request) });

    return NextResponse.json({ success: true, envio });
  } catch (error: any) {
    console.error("PUT /api/rma/[id]/items/[itemId] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE: quita un producto cargado por error. El último no se puede quitar
 * (para eso se borra el caso). Sus fotos quedan en el caso, sin producto.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id, itemId } = await params;
    const caseId = parseInt(id, 10);
    const { productos, producto } = await productoDelCaso(caseId, parseInt(itemId, 10));
    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado en este caso" }, { status: 404 });
    }
    if (productos.length <= 1) {
      return NextResponse.json(
        { error: "Es el único producto del envío: para quitarlo, borra el caso." },
        { status: 400 },
      );
    }

    await query(`UPDATE rma_ticket_adjuntos SET item_id = NULL WHERE item_id = ?`, [producto.id]);
    await query(`DELETE FROM rma_case_items WHERE id = ?`, [producto.id]);
    await espejarPrimeroEnCaso(caseId);

    const changedBy = auth.payload?.name || "Sistema";
    await query(
      `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [caseId, producto.status, producto.status, changedBy, `Producto quitado del envío: ${producto.model || producto.hardware || ""}`],
    );
    await sincronizarEnvio(caseId, { changedBy, origenPeticion: getPublicOrigin(request) });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/rma/[id]/items/[itemId] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
