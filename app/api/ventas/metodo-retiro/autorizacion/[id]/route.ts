import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { leerAutorizacion, puedeVerAutorizacion } from "@/lib/ventas/autorizacionTransporte";

export const dynamic = "force-dynamic";

/**
 * GET /api/ventas/metodo-retiro/autorizacion/:id
 * La foto de la autorización del transporte externo. La ven el vendedor del
 * pedido, el Asistente de Ventas, Almacén y Seguridad de la sucursal del
 * pedido (puedeVerAutorizacion). Ajena: 404.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ["seller", "vendedor", "asistente de ventas", "almacen", "seguridad"]);
  if (auth.error) return auth.error;

  try {
    const id = parseInt((await params).id, 10);
    if (!id) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    const cids = Number(auth.payload?.cids);
    const uid = Number(auth.payload?.uid);
    const tieneCids = Number.isInteger(cids) && cids > 0;
    if (rol !== "superadmin" && !tieneCids) {
      return NextResponse.json({ error: "Tu usuario no tiene sucursal asignada" }, { status: 403 });
    }
    const puede = await puedeVerAutorizacion(id, {
      rol,
      uid: Number.isInteger(uid) && uid > 0 ? uid : null,
      cids: tieneCids ? cids : null,
      email: String(auth.payload?.email || ""),
    });
    const foto = puede ? await leerAutorizacion(id) : null;
    if (!foto) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    return new NextResponse(new Uint8Array(foto.data), {
      headers: {
        "Content-Type": foto.mime,
        "Content-Disposition": `inline; filename="autorizacion-${id}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("GET /api/ventas/metodo-retiro/autorizacion error:", error?.message);
    return NextResponse.json({ error: "No se pudo leer la foto" }, { status: 500 });
  }
}
