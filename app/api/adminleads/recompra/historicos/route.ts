// Leads de los Excel de redes sociales de antes del panel (`leads_historicos`).
//
//   GET                -> { leads: [...], facturasSmartbit: { [sede]: { facturas, desde, hasta } } }
//   PATCH { id, rif }  -> corrige el RIF a mano (vacío = que lo vuelva a buscar el panel)
//   PATCH { id, accion: "confirmar", rif, cliente, fecha, monto }
//                      -> el lead sí se vendió (quedó como contactado/negociación en el Excel)
//   PATCH { id, accion: "descartar" } -> no es venta: deja de salir en "Por revisar"
//   PATCH { id, accion: "deshacer" }  -> vuelve al estatus del Excel
//   PATCH { accion: "campana", company_id, hoja, campana }
//                      -> nombre de la campaña de una hoja (vacío = el que sale de la hoja)

import { asegurarTablas, resolverRifs } from "@/lib/adminleads/recompra";
import { query } from "@/lib/db";
import { normalizarRif } from "@/lib/smartbit";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    await asegurarTablas();
    // Panamá solo ve lo de Panamá, como en el resto de los leads.
    const soloPanama = Number(auth.payload!.cids) === 7;
    const { rows: leads } = await query(
      `SELECT id, company_id, archivo, hoja, red_social, nombre, COALESCE(campana_editada, campana) AS campana,
              DATE_FORMAT(fecha_interaccion, '%Y-%m-%d') AS fecha, telefono, ubicacion, vendedor, estatus,
              monto, factura_txt, observacion, rif, rif_origen, cliente_rif,
              DATE_FORMAT(primera_venta, '%Y-%m-%d') AS primera_venta, estatus_original
         FROM leads_historicos ${soloPanama ? "WHERE company_id = 7" : ""}
        ORDER BY fecha_interaccion DESC, id DESC`,
    );
    const { rows: fact } = await query(
      `SELECT company_id, COUNT(*) AS facturas,
              DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS desde, DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS hasta
         FROM ventas_smartbit_facturas GROUP BY company_id`,
    );
    // Una fila por hoja = una campaña.
    const { rows: campanas } = await query(
      `SELECT company_id, hoja, MAX(campana) AS campana_hoja, MAX(campana_editada) AS campana_editada,
              COUNT(*) AS leads, SUM(estatus = 'CONCRETADO') AS vendidos,
              DATE_FORMAT(MIN(fecha_interaccion), '%Y-%m-%d') AS desde, DATE_FORMAT(MAX(fecha_interaccion), '%Y-%m-%d') AS hasta
         FROM leads_historicos ${soloPanama ? "WHERE company_id = 7" : ""}
        GROUP BY company_id, hoja
        ORDER BY MIN(fecha_interaccion)`,
    );
    return NextResponse.json({ leads, facturasSmartbit: fact, campanas });
  } catch (error: any) {
    console.error("GET /api/adminleads/recompra/historicos error:", error?.message);
    return NextResponse.json({ error: "No se pudieron leer los leads" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    await asegurarTablas();
    const body = await request.json().catch(() => null);
    if (body?.accion === "campana") {
      const companyId = Number(body.company_id);
      const hoja = String(body.hoja || "").slice(0, 120);
      if (!hoja || !Number.isInteger(companyId)) return NextResponse.json({ error: "Falta la hoja" }, { status: 400 });
      if (Number(auth.payload!.cids) === 7 && companyId !== 7) {
        return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
      }
      const campana = String(body.campana ?? "").trim().slice(0, 160);
      await query(
        `UPDATE leads_historicos SET campana_editada = NULLIF(?, '') WHERE company_id = ? AND hoja = ?`,
        [campana, companyId, hoja],
      );
      return NextResponse.json({ success: true });
    }
    const id = Number(body?.id);
    const rif = normalizarRif(String(body?.rif ?? ""));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Falta el lead" }, { status: 400 });
    }
    if (rif && (rif.length < 6 || rif.length > 30)) {
      return NextResponse.json({ error: "El RIF no parece válido" }, { status: 400 });
    }
    const { rows } = await query("SELECT company_id, estatus, estatus_original FROM leads_historicos WHERE id = ?", [id]);
    if (!rows.length) return NextResponse.json({ error: "No existe ese lead" }, { status: 404 });
    if (Number(auth.payload!.cids) === 7 && Number(rows[0].company_id) !== 7) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const accion = String(body?.accion || "");
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fecha)) ? String(body.fecha) : null;
    const cliente = String(body?.cliente || "").slice(0, 255) || null;

    if (accion === "confirmar") {
      if (!rif || rif.length < 6) return NextResponse.json({ error: "Falta el RIF del cliente" }, { status: 400 });
      const monto = Number(body?.monto);
      // estatus_original guarda lo que decía el Excel: re-importar no lo pisa y "deshacer" lo devuelve.
      await query(
        `UPDATE leads_historicos
            SET estatus_original = COALESCE(estatus_original, estatus, ''), estatus = 'CONCRETADO',
                rif = ?, rif_origen = 'confirmado', cliente_rif = ?, primera_venta = ?,
                monto = COALESCE(monto, ?), revisado = 1
          WHERE id = ?`,
        [rif, cliente, fecha, Number.isFinite(monto) && monto > 0 ? monto : null, id],
      );
    } else if (accion === "descartar") {
      await query(`UPDATE leads_historicos SET revisado = 1 WHERE id = ?`, [id]);
    } else if (accion === "deshacer") {
      if (rows[0].estatus_original != null) {
        await query(
          `UPDATE leads_historicos
              SET estatus = NULLIF(estatus_original, ''), estatus_original = NULL, rif = NULL, rif_origen = NULL,
                  cliente_rif = NULL, primera_venta = NULL, revisado = 0
            WHERE id = ?`,
          [id],
        );
      } else {
        await query(`UPDATE leads_historicos SET revisado = 0 WHERE id = ?`, [id]);
      }
    } else if (rif) {
      await query(
        `UPDATE leads_historicos SET rif = ?, rif_origen = 'manual', cliente_rif = ?, primera_venta = ? WHERE id = ?`,
        [rif, cliente, fecha, id],
      );
    } else {
      await query(`UPDATE leads_historicos SET rif = NULL, rif_origen = NULL WHERE id = ?`, [id]);
      await resolverRifs(Number(rows[0].company_id));
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH /api/adminleads/recompra/historicos error:", error?.message);
    return NextResponse.json({ error: error?.message || "No se pudo guardar" }, { status: 500 });
  }
}
