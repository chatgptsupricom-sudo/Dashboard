import { completarConexion, iniciarConexion, tokenMcp, urlMcp } from "@/lib/agenteia/mcpOauth";
import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

// Conexión OAuth del Agente IA con el MCP de Odoo (lib/agenteia/mcpOauth.ts).
//
//   GET ?estado=1      -> { configurado, conectado }
//   GET                -> registra el panel y redirige al login/consentimiento de Odoo
//   GET ?code&state    -> vuelta de Odoo: guarda los tokens y regresa al agente

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const p = request.nextUrl.searchParams;
  const origen = getPublicOrigin(request);

  if (p.has("estado")) {
    const fijo = !!process.env.ODOO_MCP_TOKEN;
    return NextResponse.json({ configurado: !!urlMcp(), conectado: !!urlMcp() && (fijo || !!(await tokenMcp())) });
  }

  try {
    const code = p.get("code");
    if (code) {
      await completarConexion(code, p.get("state") || "");
      return NextResponse.redirect(`${origen}/superadmin/agenteia`);
    }
    if (p.has("error")) throw new Error(`Odoo no autorizó la conexión (${p.get("error")}).`);
    return NextResponse.redirect(await iniciarConexion(`${origen}/api/superadmin/agenteia/oauth`));
  } catch (e: any) {
    console.error("❌ agenteia oauth:", e.message);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
