import { query } from "@/lib/db";
import { requireNC } from "@/lib/notas-credito/acceso";
import { ensureTablas } from "@/lib/notas-credito/datos";
import { notasOdooDelRango } from "@/lib/notas-credito/odoo";
import { SEDES } from "@/lib/notas-credito/tipos";
import { OdooUnreachableError } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET ?mes=YYYY-MM[&company_id=]  notas de crédito de cliente de Odoo del mes
 * (pestaña "En Odoo"), cada una con la solicitud del panel que la generó
 * (`solicitud_id`) o null si se hizo en Odoo sin pasar por el flujo. Cada
 * quien ve las de sus sedes; el SuperAdmin, todas.
 */
export async function GET(request: NextRequest) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  const sp = request.nextUrl.searchParams;
  const mes = sp.get("mes") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "mes inválido (YYYY-MM)" }, { status: 400 });
  const [a, m] = mes.split("-").map(Number);
  const desde = `${mes}-01`;
  const hasta = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;

  const permitidas = acceso!.sedes ?? SEDES;
  const pedida = Number(sp.get("company_id")) || null;
  if (pedida && !permitidas.includes(pedida)) return NextResponse.json({ error: "Sede no permitida" }, { status: 403 });
  const sedes = pedida ? [pedida] : permitidas;

  try {
    const notas = await notasOdooDelRango(sedes, desde, hasta);
    const vinculo = new Map<number, number>();
    if (notas.length) {
      await ensureTablas();
      const ids = notas.map((n) => n.id);
      const r = await query(
        `SELECT id, odoo_move_id FROM nc_solicitudes WHERE odoo_move_id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      for (const f of r.rows as any[]) vinculo.set(Number(f.odoo_move_id), Number(f.id));
    }
    return NextResponse.json({
      success: true,
      sedes,
      notas: notas.map((n) => ({ ...n, solicitud_id: vinculo.get(n.id) ?? null })),
    });
  } catch (e: any) {
    const status = e instanceof OdooUnreachableError ? 503 : 500;
    console.error("GET /api/notas-credito/odoo:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status });
  }
}
