import { requireRoles } from "@/lib/auth/roles";
import { resumenConsumo } from "@/lib/agenteia/consumo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Cuánto cuesta el Agente IA (lib/agenteia/consumo.ts). Solo SuperAdmin.
//   GET -> { hoy, mes, mensajesHoy, mensajesMes, conversaciones: [...], mensajes: [...] }
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  return NextResponse.json(await resumenConsumo());
}
