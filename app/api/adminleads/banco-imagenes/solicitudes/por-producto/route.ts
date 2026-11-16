import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { porProducto } from "@/lib/banco-imagenes/solicitudes";
import { ROLES_ADMIN_FLYERS, sedeDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

/** Productos por diseñar con su demanda: cuántos vendedores, urgencia más alta y fecha más próxima. */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMIN_FLYERS);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ success: true, productos: await porProducto(sedeDe(auth.payload)) });
  } catch (e: any) {
    console.error("Flyers por producto:", e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
