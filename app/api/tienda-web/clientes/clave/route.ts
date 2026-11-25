import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { fijarClave } from "@/lib/tienda-web/clientes/cuentas";
import { cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { codigoValido, normalizarCorreo, problemaContrasena } from "@/lib/tienda-web/clientes/tipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/clave {correo, codigo, clave, recordar} — crea el acceso o cambia la
 * contraseña con el código que llegó al correo. Devuelve la sesión ({token}). Cierra las sesiones anteriores.
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-clave", [
    { max: 10, ventanaSegundos: 600 },
    { max: 60, ventanaSegundos: 86400 },
  ]);
  if (bloqueo) return conCors(bloqueo);
  const c = await cuerpoJson(request);
  const correo = normalizarCorreo(c?.correo);
  if (!correo) return jsonTienda({ error: "Escribe un correo válido", campo: "correo" }, { status: 400 });
  if (!codigoValido(c?.codigo)) return jsonTienda({ error: "El código tiene 6 números", campo: "codigo" }, { status: 400 });
  const problema = problemaContrasena(c?.clave);
  if (problema) return jsonTienda({ error: problema, campo: "clave" }, { status: 400 });
  try {
    const r = await fijarClave(correo, String(c!.codigo).trim(), String(c!.clave), c?.recordar !== false);
    if (r.ok) return jsonTienda({ ok: true, token: r.token });
    if (r.motivo === "codigo") return jsonTienda({ error: "El código no es correcto o ya venció. Pide uno nuevo.", campo: "codigo" }, { status: 400 });
    return jsonTienda({ error: "Este correo ya no está en la ficha de un cliente. Escríbele a tu vendedor." }, { status: 403 });
  } catch (e) {
    console.error("[tienda-web/clientes] clave:", e);
    return jsonTienda({ error: "No pudimos guardar tu contraseña. Intenta de nuevo en unos minutos." }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
