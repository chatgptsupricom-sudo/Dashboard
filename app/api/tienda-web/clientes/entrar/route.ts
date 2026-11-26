import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { entrar } from "@/lib/tienda-web/clientes/cuentas";
import { cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { normalizarCorreo } from "@/lib/tienda-web/clientes/tipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** POST /api/tienda-web/clientes/entrar {correo, clave, recordar} — devuelve la sesión ({token}). */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-entrar", [
    { max: 10, ventanaSegundos: 300 },
    { max: 100, ventanaSegundos: 86400 },
  ]);
  if (bloqueo) return conCors(bloqueo);
  const c = await cuerpoJson(request);
  const correo = normalizarCorreo(c?.correo);
  const clave = String(c?.clave ?? "");
  if (!correo || !clave || clave.length > 200) return jsonTienda({ error: "Correo o contraseña incorrectos" }, { status: 400 });
  try {
    const r = await entrar(correo, clave, c?.recordar !== false);
    if (r.ok) return jsonTienda({ ok: true, token: r.token });
    if (r.motivo === "bloqueada") return jsonTienda({ error: `Por seguridad tu cuenta quedó en pausa. Intenta de nuevo en ${r.minutos ?? 15} minutos o crea una contraseña nueva.` }, { status: 429 });
    if (r.motivo === "no-es-cliente") return jsonTienda({ error: "Este correo ya no está en la ficha de un cliente. Escríbele a tu vendedor." }, { status: 403 });
    return jsonTienda({ error: "Correo o contraseña incorrectos" }, { status: 400 });
  } catch (e) {
    console.error("[tienda-web/clientes] entrar:", e);
    return jsonTienda({ error: "No pudimos iniciar tu sesión. Intenta de nuevo en unos minutos." }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
