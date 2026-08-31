import { sucursalesPermitidas } from "@/lib/servicio-tecnico/sucursales";
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { NextResponse } from "next/server";

/**
 * GET /api/servicio-tecnico/sucursales
 *
 * Endpoint PÚBLICO (sin sesión) del portal de servicio técnico: la lista de
 * sucursales para el selector del paso 1, antes de buscar la factura.
 *
 * No consulta Odoo — ver el comentario en lib/servicio-tecnico/sucursales.ts
 * sobre por qué esta lista se mantiene a mano en vez de derivarse de
 * `res.company`. Limitado igual que el resto del portal por prudencia, no
 * porque este endpoint en particular exponga algo sensible.
 */
export async function GET(request: Request) {
  const bloqueo = aplicarLimites(request, "sucursales", [
    { max: 30, ventanaSegundos: 60 },
  ]);
  if (bloqueo) return bloqueo;

  return NextResponse.json({ sucursales: sucursalesPermitidas() });
}
