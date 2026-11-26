import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { cambiarClave } from "@/lib/tienda-web/clientes/cuentas";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { problemaContrasena } from "@/lib/tienda-web/clientes/tipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/cambiar-clave {actual, nueva, recordar} — cambia la contraseña con la
 * actual. Cierra las otras sesiones y devuelve una nueva para este equipo ({token}).
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-cambiar-clave", [{ max: 10, ventanaSegundos: 600 }]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "cambiar-clave", async (s) => {
    const c = await cuerpoJson(request);
    const actual = String(c?.actual ?? "");
    const problema = problemaContrasena(c?.nueva);
    if (!actual) return jsonTienda({ error: "Escribe tu contraseña actual", campo: "actual" }, { status: 400 });
    if (problema) return jsonTienda({ error: problema, campo: "nueva" }, { status: 400 });
    const token = await cambiarClave(s.id, actual, String(c!.nueva), c?.recordar !== false);
    if (!token) return jsonTienda({ error: "La contraseña actual no es correcta", campo: "actual" }, { status: 400 });
    return jsonTienda({ ok: true, token });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
