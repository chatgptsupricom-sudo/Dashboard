import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { buscarProductosOdoo, categoriasOdoo, estadoProductos } from "@/lib/banco-imagenes/solicitudes";
import { ROLES_ADMIN_FLYERS, ROLES_VENDEDOR_FLYERS, vendedorDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

/**
 * Para pedir un flyer: `?q=` busca productos de Odoo por código o nombre y dice
 * de cada uno si ya tiene flyer, si este vendedor ya lo pidió y cuántos otros
 * vendedores lo tienen abierto. `?categorias=1` lista las categorías de Odoo.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_VENDEDOR_FLYERS, ...ROLES_ADMIN_FLYERS]);
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("categorias") === "1") {
      return NextResponse.json({ success: true, categorias: await categoriasOdoo() });
    }
    const productos = await buscarProductosOdoo(url.searchParams.get("q") || "");
    const estados = await estadoProductos(
      productos.map((p) => ({ id: p.id, codigo: p.codigo })),
      vendedorDe(auth.payload),
    );
    return NextResponse.json({
      success: true,
      productos: productos.map((p) => ({ ...p, ...estados.get(p.id)! })),
    });
  } catch (e: any) {
    console.error("Productos para pedir flyer:", e);
    return NextResponse.json({ error: "No se pudo consultar Odoo" }, { status: 502 });
  }
}
