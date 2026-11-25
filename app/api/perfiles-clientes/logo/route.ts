import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { alcancePanel, logoPerfil, ROLES_PERFILES_CLIENTES } from "@/lib/tienda-web/clientes/perfilesPanel";

export const dynamic = "force-dynamic";

/** GET /api/perfiles-clientes/logo?clave=<perfil> — el logo que subió el cliente, si el usuario ve ese perfil. */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_PERFILES_CLIENTES);
  if (auth.error) return auth.error;
  const clave = request.nextUrl.searchParams.get("clave") || "";
  if (!/^(d:[A-Z0-9]{6,38}|p:\d{1,12})$/.test(clave)) return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  const alcance = alcancePanel(auth.payload, null);
  if ("error" in alcance) return NextResponse.json({ error: alcance.error }, { status: 403 });
  const logo = await logoPerfil(clave, alcance).catch(() => null);
  if (!logo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.tipo,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
