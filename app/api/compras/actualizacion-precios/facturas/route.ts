import { requireRoles } from "@/lib/auth/roles";
import { borrarFactura, guardarFactura, leerFactura, listarFacturas, type FilaFactura } from "@/lib/compras/preciosFacturas";
import { NextRequest, NextResponse } from "next/server";

const MAX = 1000;

/** GET — facturas cargadas; con ?factura=INV00965, sus renglones. */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const factura = request.nextUrl.searchParams.get("factura")?.trim();
  try {
    if (!factura) return NextResponse.json({ data: await listarFacturas() });
    const f = await leerFactura(factura);
    if (!f) return NextResponse.json({ error: "No existe esa factura" }, { status: 404 });
    return NextResponse.json({ data: f });
  } catch (e: any) {
    console.error("❌ actualizacion-precios/facturas GET:", e?.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** DELETE ?factura=INV00965 — borra el Excel guardado; los precios ya aplicados en Odoo quedan. */
export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const factura = request.nextUrl.searchParams.get("factura")?.trim();
  if (!factura) return NextResponse.json({ error: "Falta la factura" }, { status: 400 });
  try {
    if (!(await borrarFactura(factura))) return NextResponse.json({ error: "No existe esa factura" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("❌ actualizacion-precios/facturas DELETE:", e?.message);
    return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  }
}

/** POST {factura, archivo, filas} — guarda el Excel; la misma factura reemplaza la carga anterior. */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const factura = String(body?.factura ?? "").trim().toUpperCase().slice(0, 60);
  const archivo = String(body?.archivo ?? "").trim().slice(0, 255);
  if (!factura) return NextResponse.json({ error: "Falta el número de factura" }, { status: 400 });
  if (!Array.isArray(body?.filas) || !body.filas.length) return NextResponse.json({ error: "El Excel no trae productos" }, { status: 400 });
  if (body.filas.length > MAX) return NextResponse.json({ error: `Máximo ${MAX} productos por Excel` }, { status: 400 });

  const filas: FilaFactura[] = body.filas
    .map((f: any) => {
      const precio = Number(f?.precio);
      return {
        codigo: String(f?.codigo ?? "").trim().slice(0, 64),
        descripcion: String(f?.descripcion ?? "").trim().slice(0, 300),
        precio: f?.precio == null || !Number.isFinite(precio) ? null : Math.round(precio * 100) / 100,
      };
    })
    .filter((f: FilaFactura) => f.codigo);
  if (!filas.length) return NextResponse.json({ error: "El Excel no trae códigos" }, { status: 400 });

  const p = auth.payload as any;
  try {
    const r = await guardarFactura(factura, archivo, filas, String(p?.email || p?.name || ""));
    return NextResponse.json({ factura, ...r });
  } catch (e: any) {
    console.error("❌ actualizacion-precios/facturas POST:", e?.message);
    return NextResponse.json({ error: "No se pudo guardar el Excel" }, { status: 500 });
  }
}
