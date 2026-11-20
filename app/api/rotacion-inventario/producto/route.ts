import { NextRequest, NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { ROL_COMPRAS } from "@/lib/rotacion-inventario/acceso";
import { alcanceRotacion } from "@/lib/rotacion-inventario/alcance";
import { detalleProducto, reiniciarPlan } from "@/lib/rotacion-inventario/datos";

export const dynamic = "force-dynamic";

/**
 * GET /api/rotacion-inventario/producto?sede=&id= — ficha de un producto en una
 * sede: ventas por semana del plan, planes anteriores y solicitudes a la marca.
 * POST {sede, id, motivo} — reinicia su plan de 90 días con lo disponible hoy
 * (Compras y SuperAdmin), por ejemplo después de bajarle el precio.
 */
export async function GET(request: NextRequest) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const sp = request.nextUrl.searchParams;
  const sede = Number(sp.get("sede"));
  const id = Number(sp.get("id"));
  if (!a.sedesPermitidas.includes(sede) || !(id > 0)) return NextResponse.json({ error: "Producto o sede inválidos" }, { status: 400 });
  if (a.productos && !a.productos.has(id)) return NextResponse.json({ error: "Ese producto no es de tus marcas" }, { status: 403 });
  try {
    return NextResponse.json(await detalleProducto(sede, id));
  } catch (e: any) {
    console.error("[rotacion-inventario/producto]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo.", odooCaido: e instanceof OdooUnreachableError }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const a = await alcanceRotacion(request, [ROL_COMPRAS]);
  if (a.error) return a.error;
  const body = await request.json().catch(() => ({}));
  const sede = Number(body.sede);
  const id = Number(body.id);
  const motivo = String(body.motivo || "").trim();
  if (!a.sedesPermitidas.includes(sede) || !(id > 0)) return NextResponse.json({ error: "Producto o sede inválidos" }, { status: 400 });
  if (motivo.length < 5) return NextResponse.json({ error: "Escribe por qué se reinicia el plan." }, { status: 400 });
  try {
    await reiniciarPlan(sede, id, a.usuario, motivo);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[rotacion-inventario/producto] reiniciar:", e?.message);
    return NextResponse.json({ error: e?.message || "No se pudo reiniciar el plan" }, { status: e?.status || 500 });
  }
}
