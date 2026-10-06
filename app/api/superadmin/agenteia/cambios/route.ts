import { requireRoles } from "@/lib/auth/roles";
import { listarCambios } from "@/lib/agenteia/bitacora";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Bitácora de cambios en Odoo hechos con el Agente IA (lib/agenteia/bitacora.ts). Solo SuperAdmin.
//   GET -> { cambios: [...] } (los 200 más recientes)
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  return NextResponse.json({ cambios: await listarCambios(200) });
}
