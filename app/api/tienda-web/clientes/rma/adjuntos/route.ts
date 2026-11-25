import { POST as subirAdjuntosPortal } from "@/app/api/servicio-tecnico/ticket/adjuntos/route";
import { conSesion } from "@/lib/tienda-web/clientes/http";
import { conCors, opcionesTienda } from "@/lib/tienda-web/respuesta";
import type { NextRequest } from "next/server";

/**
 * POST /api/tienda-web/clientes/rma/adjuntos (multipart: tracking_token + files) — las fotos o videos de la
 * falla, con sesión. Es la misma subida del portal (mismos límites y tipos de archivo), con CORS para la tienda.
 */
export async function POST(request: Request) {
  return conSesion(request, "rma-adjuntos", async () => conCors(await subirAdjuntosPortal(request as NextRequest)));
}

export function OPTIONS() {
  return opcionesTienda();
}
