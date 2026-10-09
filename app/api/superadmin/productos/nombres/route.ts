import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { corregirNombresGuardados } from "@/lib/productos/nombresOdoo";

export const dynamic = "force-dynamic";

// Pone el nombre de Odoo en español en las copias guardadas del panel
// (Banco de Flyers y RMA), ver lib/productos/nombresOdoo.ts.
//
//   GET  -> cuántas filas cambiarían y ejemplos, sin tocar nada
//   POST -> aplica el cambio (se puede repetir: lo ya corregido no vuelve a contar)
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await corregirNombresGuardados(false));
  } catch (e: any) {
    console.error("GET /api/superadmin/productos/nombres:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await corregirNombresGuardados(true));
  } catch (e: any) {
    console.error("POST /api/superadmin/productos/nombres:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
