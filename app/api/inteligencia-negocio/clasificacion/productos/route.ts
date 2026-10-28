import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { corregirProducto, ErrorDatos } from "@/lib/inteligencia-negocio/clasificacion/datos";
import { hayIA } from "@/lib/inteligencia-negocio/clasificacion/ia";
import {
  clasificarProductos,
  estadoClasificacionProductos,
  listarProductos,
  type AlcanceProductos,
} from "@/lib/inteligencia-negocio/clasificacion/productos";

export const dynamic = "force-dynamic";

/**
 * Clasificación de productos (lib/inteligencia-negocio/clasificacion/productos.ts).
 * GET: catálogo con su clasificación y el avance de la IA (?estado=1: solo el avance).
 * POST {alcance: "pendientes"|"bajos"|"todos"}: clasifica con IA en segundo plano.
 * PATCH {id, categoria, subcategoria, observaciones}: corrección manual.
 * Inteligencia de Negocio escribe aquí: la clasificación es suya (`escribeBI`).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;
  // ?estado=1: solo el avance de la IA, para seguirlo sin releer el catálogo.
  if (request.nextUrl.searchParams.get("estado")) {
    return NextResponse.json({ success: true, data: { estado: estadoClasificacionProductos() } });
  }
  try {
    const productos = await listarProductos();
    return NextResponse.json({ success: true, data: { productos, estado: estadoClasificacionProductos(), hayIA: hayIA() } });
  } catch (e: any) {
    console.error("[bi-clasificacion/productos]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

const ALCANCES: AlcanceProductos[] = ["pendientes", "bajos", "todos"];

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  if (!hayIA()) return NextResponse.json({ error: "No hay IA configurada en el servidor" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const alcance = ALCANCES.includes(body?.alcance) ? (body.alcance as AlcanceProductos) : "pendientes";
  try {
    const iniciados = await clasificarProductos(alcance);
    if (iniciados === null) return NextResponse.json({ error: "Ya hay una clasificación corriendo" }, { status: 409 });
    return NextResponse.json({ success: true, data: { iniciados, estado: estadoClasificacionProductos() } });
  } catch (e: any) {
    console.error("[bi-clasificacion/productos POST]", e?.message);
    return NextResponse.json({ error: "No se pudo empezar la clasificación" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  try {
    await corregirProducto(id, body, String(auth.payload?.email ?? ""));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof ErrorDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[bi-clasificacion/productos PATCH]", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
