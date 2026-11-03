import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_SEMAFORO } from "@/lib/semaforo-clientes/acceso";
import { guardarConfig, leerConfig } from "@/lib/semaforo-clientes/datos";

export const dynamic = "force-dynamic";

/** GET: umbrales del Semáforo de clientes (los ven todos los que lo usan). */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SEMAFORO);
  if (auth.error) return auth.error;
  return NextResponse.json(await leerConfig());
}

/** PUT: los cambia solo el SuperAdmin (requireRoles con lista vacía = solo superadmin). */
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const quien = String(auth.payload?.email || auth.payload?.name || "superadmin");
    const config = await guardarConfig(body, quien);
    return NextResponse.json({ config });
  } catch (e: any) {
    console.error("[semaforo-clientes/config]", e?.message);
    return NextResponse.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
  }
}
