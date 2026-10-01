import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { rotacionPorCategoria } from "@/lib/compras/reportes";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/rotacion-categoria/productos?sede=9&categoria=&tipo=
 * El detalle de Rotación por categoría: los mismos productos que suman los
 * totales de la tabla (misma lectura, lib/compras/reportes.ts). `tipo`:
 * "estancado" (capital estancado) o "quiebre".
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const { searchParams } = new URL(request.url);
    const categoria = (searchParams.get("categoria") || "").toLowerCase();
    const tipo = searchParams.get("tipo") || "";

    let data = (await rotacionPorCategoria(sedeId)).productos;
    if (categoria) data = data.filter((p) => p.categoria.toLowerCase() === categoria);
    if (tipo === "estancado") data = data.filter((p) => p.capitalEstancado > 0);
    else if (tipo === "quiebre") data = data.filter((p) => p.quiebre);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error en API productos rotacion-categoria:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
