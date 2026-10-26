import {
  ErrorCruce,
  buscarProductos,
  confirmarCruce,
  crearFicha,
  opcionesFicha,
  proponerCruce,
  proponerFicha,
  renglonesSinProducto,
} from "@/lib/recepcion/cruceIa";
import { cargarEnOdoo } from "@/lib/recepcion/odoo";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// La IA con busqueda en internet puede tardar mas de un minuto.
export const maxDuration = 300;

/**
 * Renglones de una recepcion cerrada que no se cargaron en Odoo porque no se
 * cruzaron con ningun producto (lib/recepcion/cruceIa.ts). Almacen o Compras.
 *
 * GET  /api/recepcion/[id]/cruce              renglones sin producto (sin IA)
 * GET  /api/recepcion/[id]/cruce?opciones=1   marcas y categorias de Odoo
 * GET  /api/recepcion/[id]/cruce?buscar=texto productos del catalogo
 * POST /api/recepcion/[id]/cruce  { accion, ... }
 *   proponer          la IA propone el producto de cada renglon (no guarda)
 *   confirmar         { item_id, product_id } el renglon queda con ese producto
 *   proponer_ficha    { item_id } la IA busca el producto en internet y
 *                     propone su ficha (no guarda)
 *   crear_ficha       { item_id, ficha } crea el producto en Odoo y lo cruza.
 *                     Solo Compras (o el SuperAdmin): es un producto nuevo
 *                     para toda la empresa.
 *   cargar_faltantes  carga en Odoo lo que faltaba (lo ya cargado no se repite)
 */

async function abrir(request: NextRequest, params: Promise<{ id: string }>) {
  const { sesion, error } = await requireRecepcion(request);
  if (error) return { error };
  const id = parseInt((await params).id, 10);
  if (isNaN(id)) return { error: NextResponse.json({ error: "id invalido" }, { status: 400 }) };
  const datos = await cargarRecepcion(id);
  if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
    return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  return { sesion: sesion!, id, rec: datos.recepcion };
}

function fallo(e: any) {
  if (e instanceof ErrorCruce) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[recepcion/cruce]", e?.message);
  return NextResponse.json({ error: "No se pudo completar: " + String(e?.message || e).slice(0, 300) }, { status: 502 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await abrir(request, params);
    if (a.error) return a.error;
    const sp = request.nextUrl.searchParams;
    if (sp.get("opciones") === "1") return NextResponse.json({ success: true, ...(await opcionesFicha()) });
    if (sp.has("buscar")) return NextResponse.json({ success: true, productos: await buscarProductos(sp.get("buscar") || "") });
    return NextResponse.json({ success: true, renglones: await renglonesSinProducto(a.id) });
  } catch (e: any) {
    return fallo(e);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await abrir(request, params);
    if (a.error) return a.error;
    const { sesion, id, rec } = a;
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const itemId = Number(body?.item_id);
    const aviso = () => emitirRecepcion({ accion: "editado", id, cids: Number(rec.cids), referencia: rec.referencia });

    switch (body?.accion) {
      case "proponer":
        return NextResponse.json({ success: true, propuestas: await proponerCruce(id) });
      case "confirmar": {
        const productId = Number(body?.product_id);
        if (!Number.isInteger(itemId) || !Number.isInteger(productId) || productId <= 0) {
          return NextResponse.json({ error: "Falta el renglon o el producto" }, { status: 400 });
        }
        const producto = await confirmarCruce(id, itemId, productId);
        aviso();
        return NextResponse.json({ success: true, producto });
      }
      case "proponer_ficha":
        if (!Number.isInteger(itemId)) return NextResponse.json({ error: "Falta el renglon" }, { status: 400 });
        return NextResponse.json({ success: true, ficha: await proponerFicha(id, itemId) });
      case "crear_ficha": {
        if (!puedeComo(sesion, "compras")) {
          return NextResponse.json({ error: "Las fichas nuevas las crea Compras" }, { status: 403 });
        }
        if (!Number.isInteger(itemId) || !body?.ficha || typeof body.ficha !== "object") {
          return NextResponse.json({ error: "Falta el renglon o la ficha" }, { status: 400 });
        }
        const f = body.ficha;
        const producto = await crearFicha(
          id,
          itemId,
          {
            nombre: String(f.nombre ?? ""),
            codigo: String(f.codigo ?? ""),
            marca_id: Number(f.marca_id) || null,
            categoria_id: Number(f.categoria_id) || null,
            descripcion: String(f.descripcion ?? ""),
            imagen_url: f.imagen_url ? String(f.imagen_url) : null,
            lleva_serial: f.lleva_serial === true,
          },
          sesion.nombre,
        );
        aviso();
        return NextResponse.json({ success: true, producto });
      }
      case "cargar_faltantes": {
        if (rec.etapa !== "cerrado") {
          return NextResponse.json({ error: "Se carga en Odoo al cerrar la recepcion" }, { status: 409 });
        }
        const r = await cargarEnOdoo(id, sesion.nombre, { completarFaltantes: true });
        aviso();
        return NextResponse.json({ success: true, ...r, ...(await cargarRecepcion(id)) });
      }
      default:
        return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
    }
  } catch (e: any) {
    return fallo(e);
  }
}
