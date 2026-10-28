import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { contarClientesPorZona } from "@/lib/mapaClientes/conteoClientes";
import { paisDeSede, type PaisMapa } from "@/lib/mapaClientes/zonas";

/**
 * Mapa de clientes del Diseñador: cantidad de clientes por estado y ciudad,
 * ya agregada (lib/mapaClientes/conteoClientes). El país sale del `cids` del
 * token: Valencia y Caracas → Venezuela, Panamá → Panamá. Solo el SuperAdmin
 * (sin sede) elige con `?pais=VE|PA`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["diseñador"]);
  if (auth.error) return auth.error;

  const payload = auth.payload!;
  const esSuperAdmin = String(payload.role || "").toLowerCase().trim() === "superadmin";
  let pais: PaisMapa | null;
  if (esSuperAdmin) {
    pais = request.nextUrl.searchParams.get("pais") === "PA" ? "PA" : "VE";
  } else {
    pais = paisDeSede(payload.cids);
    if (!pais) return NextResponse.json({ error: "Tu usuario no tiene una sede asignada" }, { status: 403 });
  }

  try {
    const datos = await contarClientesPorZona(pais);
    return NextResponse.json(
      { ...datos, puede_elegir_pais: esSuperAdmin },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: any) {
    console.error("[disenador/mapa-clientes]", error);
    return NextResponse.json({ error: "No se pudo leer Odoo" }, { status: 502 });
  }
}
