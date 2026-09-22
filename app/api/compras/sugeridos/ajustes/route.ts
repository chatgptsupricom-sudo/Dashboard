import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { COMPRA_MANUAL_MAX, ETA_MAX } from "@/lib/compras/sugeridos";
import { NextRequest, NextResponse } from "next/server";

/**
 * PUT /api/compras/sugeridos/ajustes
 * { cids, product_odoo_id, codigo, eta_dias?, compra_manual? }
 *
 * Guarda lo que el comprador carga a mano en Sugeridos. Solo se tocan los
 * campos que vienen en el body; `null` los borra. Si los dos quedan vacios
 * se borra la fila.
 */

/** undefined = no vino; null = borrar; numero entero en rango = guardar. */
function leerEntero(v: unknown, max: number): number | null | undefined | "invalido" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) return "invalido";
  return n;
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const cids = Number(body?.cids);
  if (!MAIN_WAREHOUSE_BY_COMPANY[cids]) {
    return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
  }
  const productId = Number(body?.product_odoo_id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Producto invalido" }, { status: 400 });
  }
  const eta = leerEntero(body?.eta_dias, ETA_MAX);
  if (eta === "invalido") {
    return NextResponse.json({ error: `El ETA tiene que ser un numero entero de 0 a ${ETA_MAX}` }, { status: 400 });
  }
  const manual = leerEntero(body?.compra_manual, COMPRA_MANUAL_MAX);
  if (manual === "invalido") {
    return NextResponse.json({ error: "La compra manual tiene que ser un numero entero, 0 o mayor" }, { status: 400 });
  }
  if (eta === undefined && manual === undefined) {
    return NextResponse.json({ error: "No hay nada que guardar" }, { status: 400 });
  }

  const codigo = body?.codigo ? String(body.codigo).trim().slice(0, 100) : null;
  const por = String(auth.payload?.name || auth.payload?.email || "Compras").slice(0, 200);

  try {
    // UPDATE de lo que vino y, si la fila no existe, INSERT. (Sin ON
    // DUPLICATE KEY ... VALUES(): esta deprecado en el MySQL 9 de produccion
    // y la sintaxis nueva no existe en el MariaDB local.)
    const sets = ["actualizado_por = ?", "codigo = COALESCE(?, codigo)"];
    const valores: any[] = [por, codigo];
    if (eta !== undefined) {
      sets.push("eta_dias = ?");
      valores.push(eta);
    }
    if (manual !== undefined) {
      sets.push("compra_manual = ?");
      valores.push(manual);
    }
    const guardar = () =>
      query(
        `UPDATE compras_sugeridos_ajustes SET ${sets.join(", ")}
          WHERE cids = ? AND product_odoo_id = ?`,
        [...valores, cids, productId],
      );
    const upd = await guardar();
    if (Number((upd.rows as any)?.affectedRows || 0) === 0) {
      try {
        await query(
          `INSERT INTO compras_sugeridos_ajustes
             (cids, product_odoo_id, codigo, eta_dias, compra_manual, actualizado_por)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [cids, productId, codigo, eta ?? null, manual ?? null, por],
        );
      } catch (e: any) {
        // Otro guardado la creo en el medio: se actualiza esa.
        if (!/Duplicate entry/i.test(e.message || "")) throw e;
        await guardar();
      }
    }
    await query(
      `DELETE FROM compras_sugeridos_ajustes
        WHERE cids = ? AND product_odoo_id = ? AND eta_dias IS NULL AND compra_manual IS NULL`,
      [cids, productId],
    );
    const r = await query(
      `SELECT eta_dias, compra_manual, actualizado_por, updated_at
         FROM compras_sugeridos_ajustes WHERE cids = ? AND product_odoo_id = ?`,
      [cids, productId],
    );
    const a = (r.rows as any[])[0];
    return NextResponse.json({
      success: true,
      ajuste: {
        eta: a?.eta_dias ?? null,
        compraManual: a?.compra_manual ?? null,
        ajustadoPor: a?.actualizado_por ?? null,
        ajustadoAt: a?.updated_at ?? null,
      },
    });
  } catch (e: any) {
    console.error("[Sugeridos] error guardando ajuste:", e.message);
    const sinTabla = /doesn't exist|no existe/i.test(e.message || "");
    return NextResponse.json(
      { error: sinTabla ? "Falta correr sql/compras_sugeridos_ajustes.sql" : "No se pudo guardar" },
      { status: 500 },
    );
  }
}
