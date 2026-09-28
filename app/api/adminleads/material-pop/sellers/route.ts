import { query } from "@/lib/db";
import {
  requireLecturaMaterialPop,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Vendedores de la sede, para anotar quién atiende al cliente en una salida.
 *
 * No se reusa /api/adminleads/sellers porque ese filtra con la regla de leads
 * (`cids != 7` para todo lo que no sea Panamá) y acá hace falta la sede del
 * módulo y nada más.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireLecturaMaterialPop(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const params: any[] = [];
    let where = "WHERE activo = 1";
    if (cids !== null) {
      where += " AND cids = ?";
      params.push(cids);
    }

    const res = await query(
      `SELECT id, name, cids FROM sellers ${where} ORDER BY name ASC`,
      params,
    );

    return NextResponse.json({ success: true, sellers: res.rows || [] });
  } catch (error: any) {
    console.error("Error listando vendedores POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
