import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { gerentes, guardarAsignaciones, marcasDeLaSesion, marcasOdoo } from "@/lib/gerente-marca/asignaciones";
import { ROLES_CON_MARCAS } from "@/lib/gerente-marca/tipos";

/**
 * Marcas de cada Gerente de Marca (lib/gerente-marca/asignaciones.ts).
 *
 * GET → el gerente: las suyas. El SuperAdmin: todos los gerentes con sus
 *   marcas y, con `?marcas=1`, las marcas de Odoo para elegir.
 * PUT {email, asignaciones: [{marcaId, linea}]} → solo el SuperAdmin.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_CON_MARCAS);
  if (auth.error) return auth.error;
  const esSuper = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
  try {
    if (!esSuper) {
      return NextResponse.json({ success: true, asignaciones: await marcasDeLaSesion(auth.payload) });
    }
    const conMarcas = request.nextUrl.searchParams.get("marcas") === "1";
    const [lista, marcas] = await Promise.all([gerentes(), conMarcas ? marcasOdoo() : Promise.resolve(undefined)]);
    return NextResponse.json({ success: true, gerentes: lista, marcas });
  } catch (error: any) {
    console.error("Error en gerente-marca/asignaciones GET:", error?.message);
    return NextResponse.json({ error: "No se pudieron leer las marcas asignadas" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body?.email || !Array.isArray(body.asignaciones)) {
    return NextResponse.json({ error: "Faltan el correo o las marcas" }, { status: 400 });
  }
  try {
    const asignaciones = await guardarAsignaciones(body.email, body.asignaciones, String(auth.payload?.email || ""));
    return NextResponse.json({ success: true, asignaciones });
  } catch (error: any) {
    console.error("Error en gerente-marca/asignaciones PUT:", error?.message);
    return NextResponse.json({ error: error?.message || "No se pudo guardar" }, { status: 400 });
  }
}
