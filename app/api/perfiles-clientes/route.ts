import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { alcancePanel, detallePerfil, listarPerfiles, ROLES_PERFILES_CLIENTES } from "@/lib/tienda-web/clientes/perfilesPanel";

export const dynamic = "force-dynamic";

/**
 * GET /api/perfiles-clientes[?sede=9|10|7] — los perfiles que los clientes escribieron en «Mi cuenta» de la
 * tienda web, con su sede y vendedor en Odoo. GET ?clave=<perfil> — uno con su historial de cambios.
 * El vendedor ve los suyos, la gerencia su sede, el SuperAdmin todos (lib/tienda-web/clientes/perfilesPanel.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_PERFILES_CLIENTES);
  if (auth.error) return auth.error;
  const sp = request.nextUrl.searchParams;
  const alcance = alcancePanel(auth.payload, Number(sp.get("sede")) || null);
  if ("error" in alcance) return NextResponse.json({ error: alcance.error }, { status: 403 });
  try {
    const clave = sp.get("clave");
    if (clave) {
      if (!/^(d:[A-Z0-9]{6,38}|p:\d{1,12})$/.test(clave)) return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
      const p = await detallePerfil(clave, alcance);
      return p ? NextResponse.json({ perfil: p }) : NextResponse.json({ error: "No encontramos ese perfil" }, { status: 404 });
    }
    const perfiles = await listarPerfiles(alcance);
    return NextResponse.json({ perfiles, alcance: alcance.tipo, eligeSede: alcance.tipo === "todo" });
  } catch (e: any) {
    console.error("[perfiles-clientes]", e?.message || e);
    const odooCaido = e instanceof OdooUnreachableError;
    return NextResponse.json({ error: odooCaido ? "Odoo no responde. Intenta en unos minutos." : "No pudimos leer los perfiles.", odooCaido }, { status: 502 });
  }
}
