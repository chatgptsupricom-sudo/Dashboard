import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { redesDeSuWeb } from "@/lib/tienda-web/clientes/redes";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/perfil/redes-web {url} — las redes sociales enlazadas en su página web, para
 * llenarlas solas. Devuelve solo los enlaces encontrados (lib/tienda-web/clientes/redes.ts).
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-redes-web", [{ max: 10, ventanaSegundos: 600 }]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "perfil-redes-web", async () => {
    const c = await cuerpoJson(request);
    return jsonTienda(await redesDeSuWeb(String(c?.url ?? "").slice(0, 200)));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
