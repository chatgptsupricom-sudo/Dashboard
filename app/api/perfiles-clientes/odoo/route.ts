import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { vistaPreviaOdoo } from "@/lib/tienda-web/clientes/sincronizarOdoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/perfiles-clientes/odoo?clave=<perfil> — solo SuperAdmin: lo que el paso automático haría en Odoo con
 * ese perfil (crear / adoptar / actualizar / archivar direcciones de entrega, página web y logo), sin escribir nada.
 * Sirve para revisar qué haría el paso a Odoo con un perfil (lib/tienda-web/clientes/sincronizarOdoo.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const clave = request.nextUrl.searchParams.get("clave") || "";
  if (!/^(d:[A-Z0-9]{6,38}|p:\d{1,12})$/.test(clave)) return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  try {
    const v = await vistaPreviaOdoo(clave);
    return v ? NextResponse.json(v) : NextResponse.json({ error: "No encontramos ese perfil" }, { status: 404 });
  } catch (e: any) {
    const odooCaido = e instanceof OdooUnreachableError;
    return NextResponse.json({ error: odooCaido ? "Odoo no responde. Intenta en unos minutos." : String(e?.message || e) }, { status: 502 });
  }
}
