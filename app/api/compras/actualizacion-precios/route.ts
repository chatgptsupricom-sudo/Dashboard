import { requireRoles } from "@/lib/auth/roles";
import { aplicarPrecio, preciosActuales } from "@/lib/compras/actualizacionPrecios";
import { NextRequest, NextResponse } from "next/server";

const MAX = 1000;

/** POST {codigos} — precio actual de cada SKU en la lista de Valencia y de Caracas. Solo lee. */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"], { soloLee: true });
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const codigos = Array.isArray(body?.codigos) ? body.codigos.map((c: unknown) => String(c ?? "").trim()).filter(Boolean) : [];
  if (!codigos.length) return NextResponse.json({ error: "No hay códigos" }, { status: 400 });
  if (codigos.length > MAX) return NextResponse.json({ error: `Máximo ${MAX} productos por Excel` }, { status: 400 });

  try {
    return NextResponse.json({ data: await preciosActuales(codigos) });
  } catch (e: any) {
    console.error("❌ actualizacion-precios POST:", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo" }, { status: 502 });
  }
}

/**
 * PUT {cambios: [{codigo, precio}], referencia?} — pone cada precio en las dos
 * listas. Uno que falla no frena a los demás; responde el resultado de cada uno
 * y los precios como quedaron.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const cambios: { codigo: string; precio: number }[] = Array.isArray(body?.cambios)
    ? body.cambios.map((c: any) => ({ codigo: String(c?.codigo ?? "").trim(), precio: Math.round(Number(c?.precio) * 100) / 100 }))
    : [];
  if (!cambios.length) return NextResponse.json({ error: "No hay cambios" }, { status: 400 });
  if (cambios.length > MAX) return NextResponse.json({ error: `Máximo ${MAX} cambios` }, { status: 400 });
  const malo = cambios.find((c) => !c.codigo || !Number.isFinite(c.precio) || c.precio <= 0);
  if (malo) return NextResponse.json({ error: `Precio inválido para ${malo.codigo || "un producto sin código"}` }, { status: 400 });

  const p = auth.payload as any;
  const autor = { uid: Number(p?.uid) || undefined, nombre: String(p?.name || p?.nombre || ""), email: String(p?.email || "") };
  const referencia = String(body?.referencia ?? "").slice(0, 120);

  const resultados: { codigo: string; ok: boolean; error?: string }[] = [];
  for (const c of cambios) {
    try {
      await aplicarPrecio(c.codigo, c.precio, autor, referencia);
      resultados.push({ codigo: c.codigo, ok: true });
    } catch (e: any) {
      resultados.push({ codigo: c.codigo, ok: false, error: e?.message || "Error de Odoo" });
    }
  }

  let data = null;
  try {
    data = await preciosActuales(cambios.map((c) => c.codigo));
  } catch {
    /* la pantalla se queda con lo que tenía */
  }
  return NextResponse.json({ resultados, data });
}
