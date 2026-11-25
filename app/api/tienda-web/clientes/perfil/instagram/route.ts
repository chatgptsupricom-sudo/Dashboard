import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { instagramDe } from "@/lib/tienda-web/clientes/redes";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/perfil/instagram {usuario} — su cuenta de Instagram (nombre, foto como data URL,
 * seguidores, web) para confirmarla en el perfil y ofrecerle la foto como logo. Solo cuentas de empresa o creador.
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-instagram", [{ max: 20, ventanaSegundos: 600 }]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "perfil-instagram", async () => {
    const c = await cuerpoJson(request);
    return jsonTienda(await instagramDe(String(c?.usuario ?? "").slice(0, 200)));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
