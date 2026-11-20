import { requireRoles } from "@/lib/auth/roles";
import {
  crearProducto,
  ProductoInvalido,
  validar,
  type ProductoNuevo,
  type Renglon,
  type Seguimiento,
  type TipoProducto,
} from "@/lib/compras/validarFactura";
import { NextRequest, NextResponse } from "next/server";

const MAX = 500;

/** POST {renglones} — cruza cada SKU con Odoo y prellena lo que falta crear. Solo lee. */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"], { soloLee: true });
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const renglones: Renglon[] = (Array.isArray(body?.renglones) ? body.renglones : [])
    .map((r: any) => ({
      codigo: String(r?.codigo ?? "").trim().slice(0, 64),
      descripcion: String(r?.descripcion ?? "").trim().slice(0, 300),
      cantidad: Number(r?.cantidad) > 0 ? Number(r.cantidad) : null,
      precio: Number(r?.precio) > 0 ? Number(r.precio) : null,
    }))
    .filter((r: Renglon) => r.codigo || r.descripcion);
  if (!renglones.length) return NextResponse.json({ error: "La factura no trae productos" }, { status: 400 });
  if (renglones.length > MAX) return NextResponse.json({ error: `Máximo ${MAX} productos por factura` }, { status: 400 });

  try {
    return NextResponse.json(await validar(renglones));
  } catch (e: any) {
    console.error("❌ validar-factura POST:", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo" }, { status: 502 });
  }
}

const TIPOS: TipoProducto[] = ["product", "consu", "service"];
const SEGUIMIENTOS: Seguimiento[] = ["serial", "lot", "none"];

/** PUT {producto, factura?} — crea el producto en Odoo tal como se confirmó en la vista previa. */
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const x = body?.producto ?? {};
  const p: ProductoNuevo = {
    codigo: String(x.codigo ?? "").trim().slice(0, 64),
    nombre: String(x.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    categoriaId: Number(x.categoriaId) || 0,
    marcaId: Number(x.marcaId) || null,
    tipo: TIPOS.includes(x.tipo) ? x.tipo : "product",
    seguimiento: SEGUIMIENTOS.includes(x.seguimiento) ? x.seguimiento : "none",
    barcode: String(x.barcode ?? "").trim().slice(0, 64),
    puedeVenderse: x.puedeVenderse !== false,
    puedeComprarse: x.puedeComprarse !== false,
  };
  if (!p.codigo) return NextResponse.json({ error: "Falta el SKU" }, { status: 400 });
  if (p.nombre.length < 3) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const s = auth.payload as any;
  const autor = { uid: Number(s?.uid) || undefined, nombre: String(s?.name || s?.nombre || ""), email: String(s?.email || "") };
  try {
    return NextResponse.json(await crearProducto(p, autor, String(body?.factura ?? "").trim().slice(0, 80)));
  } catch (e: any) {
    if (e instanceof ProductoInvalido) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("❌ validar-factura PUT:", e?.message);
    return NextResponse.json({ error: `Odoo no creó el producto: ${e?.message || "error"}` }, { status: 502 });
  }
}
