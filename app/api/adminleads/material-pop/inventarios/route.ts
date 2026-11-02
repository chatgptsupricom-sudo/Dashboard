import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import {
  ErrorInventario,
  guardarInventario,
  lineasDeInventario,
  listarInventarios,
} from "@/lib/adminleads/material-pop/inventarios";

export const dynamic = "force-dynamic";

/** Lista de inventarios guardados, o los renglones de uno con `?id=`. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;
    const cids = resolveMaterialPopCids(auth.payload);

    const id = Number(new URL(request.url).searchParams.get("id"));
    if (id > 0) {
      return NextResponse.json({ success: true, lineas: await lineasDeInventario(id, cids) });
    }
    return NextResponse.json({ success: true, inventarios: await listarInventarios(cids) });
  } catch (error: any) {
    console.error("Error listando inventarios POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Guarda un conteo: `{ lineas: [{ productId, location, counted }], notes? }`. */
export async function POST(request: NextRequest) {
  let conn: any;
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const notes = String(body?.notes || "").trim().slice(0, 2000) || null;

    conn = await getConnection();
    const r = await guardarInventario(conn, {
      lineas: body?.lineas,
      cids: resolveMaterialPopCids(auth.payload),
      userId: auth.payload?.uid || auth.payload?.id || null,
      userName: auth.payload?.name || "Usuario",
      notes,
    });
    return NextResponse.json({ success: true, ...r });
  } catch (error: any) {
    if (conn) await conn.rollback().catch(() => {});
    if (error instanceof ErrorInventario) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error guardando inventario POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
