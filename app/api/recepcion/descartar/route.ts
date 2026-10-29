import { query } from "@/lib/db";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { emitirRecepcion, requireRecepcion } from "@/lib/recepcion/servidor";
import { packingListRepetido } from "@/lib/recepcion/odoo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/recepcion/descartar  { ids, motivo? }            solo SuperAdmin
 * POST /api/recepcion/descartar  { ids, restaurar: true }
 *
 * Packing lists que se cargaron o se empezaron en el panel pero se recibieron
 * por fuera (directo en Odoo): se sacan de Por llegar / Descargando sin
 * borrarlos. Compras y Almacen dejan de verlos; el SuperAdmin los ve en su
 * pestana "Descartados" y los puede restaurar.
 *
 * Solo los abiertos y sin nada cargado en Odoo por el panel: uno cerrado o
 * con lineas escritas en la recepcion de la OC no se descarta.
 */
export async function POST(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (sesion!.rol !== "superadmin") {
      return NextResponse.json({ error: "Solo el SuperAdmin descarta packing lists" }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const ids = [
      ...new Set((Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0)),
    ].slice(0, 200) as number[];
    if (ids.length === 0) return NextResponse.json({ error: "Elige al menos uno" }, { status: 400 });
    const restaurar = body?.restaurar === true;

    await asegurarColumnasOdoo();
    const marcas = ids.map(() => "?").join(", ");
    const filas = (
      await query(
        `SELECT id, cids, referencia, origen, etapa, odoo_estado, descartado_at
           FROM recepcion_packing WHERE id IN (${marcas})`,
        ids,
      )
    ).rows as any[];

    const hechos: number[] = [];
    const omitidos: Array<{ id: number; referencia: string; motivo: string }> = [];
    for (const f of filas) {
      const ref = String(f.referencia || `#${f.id}`);
      if (restaurar) {
        if (!f.descartado_at) continue;
        // Si despues se volvio a cargar el mismo packing list, restaurarlo lo
        // dejaria dos veces.
        const otro = f.origen === "packing_list" ? await packingListRepetido(Number(f.cids), ref, Number(f.id)) : null;
        if (otro) {
          omitidos.push({ id: f.id, referencia: ref, motivo: `ya se volvio a cargar (#${otro})` });
          continue;
        }
        const r = await query(
          `UPDATE recepcion_packing
              SET descartado_at = NULL, descartado_por = NULL, descartado_motivo = NULL
            WHERE id = ? AND descartado_at IS NOT NULL`,
          [f.id],
        );
        if (Number((r.rows as any)?.affectedRows || 0) === 1) hechos.push(Number(f.id));
        continue;
      }
      if (f.descartado_at) continue;
      if (f.etapa === "cerrado") {
        omitidos.push({ id: f.id, referencia: ref, motivo: "ya esta cerrado" });
        continue;
      }
      if (["cargando", "cargado", "acumulado"].includes(String(f.odoo_estado || ""))) {
        omitidos.push({ id: f.id, referencia: ref, motivo: "ya tiene algo cargado en Odoo" });
        continue;
      }
      const r = await query(
        `UPDATE recepcion_packing
            SET descartado_at = NOW(), descartado_por = ?, descartado_motivo = ?
          WHERE id = ? AND descartado_at IS NULL AND etapa <> 'cerrado'
            AND (odoo_estado IS NULL OR odoo_estado NOT IN ('cargando', 'cargado', 'acumulado'))`,
        [sesion!.nombre, String(body?.motivo ?? "").trim().slice(0, 500) || null, f.id],
      );
      if (Number((r.rows as any)?.affectedRows || 0) === 1) hechos.push(Number(f.id));
    }

    // Almacen y Compras lo sacan (o lo vuelven a poner) en vivo; un detalle
    // abierto de uno descartado queda como anulado.
    for (const f of filas) {
      if (!hechos.includes(Number(f.id))) continue;
      emitirRecepcion({
        accion: restaurar ? "editado" : "eliminado",
        id: Number(f.id),
        cids: Number(f.cids),
        referencia: f.referencia,
      });
    }

    return NextResponse.json({ success: true, hechos, omitidos });
  } catch (e: any) {
    console.error("Error descartando recepciones:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
