/** Piezas comunes de las rutas de «Mi cuenta» (app/api/tienda-web/clientes/*). */
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { conCors, jsonTienda } from "@/lib/tienda-web/respuesta";
import { sesionDe, type SesionCliente } from "./cuentas";

export async function cuerpoJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const c = await request.json();
    return c && typeof c === "object" ? c : null;
  } catch {
    return null;
  }
}

/**
 * Rutas con sesión: límite por IP, token válido y el cliente sigue siendo cliente en Odoo. Todo lo que
 * devuelven es de esa persona: sin caché en ningún lado.
 */
export async function conSesion(request: Request, nombre: string, fn: (s: SesionCliente) => Promise<Response>): Promise<Response> {
  const bloqueo = aplicarLimites(request, `tienda-cliente-${nombre}`, [
    { max: 60, ventanaSegundos: 60 },
    { max: 1500, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return conCors(bloqueo);
  const sesion = await sesionDe(request);
  if (!sesion) return jsonTienda({ error: "Tu sesión terminó. Vuelve a entrar.", sesion: false }, { status: 401 });
  try {
    return await fn(sesion);
  } catch (e) {
    console.error(`[tienda-web/clientes] ${nombre}:`, e);
    return jsonTienda({ error: "No pudimos leer tu información. Intenta de nuevo en unos minutos." }, { status: 502 });
  }
}
