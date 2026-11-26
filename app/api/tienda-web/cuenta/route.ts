import { aplicarLimites, obtenerIp } from "@/lib/servicio-tecnico/limites";
import { verificarCaptcha } from "@/lib/servicio-tecnico/captcha";
import { registrarSolicitud } from "@/lib/tienda-web/cuenta";
import { validarSolicitud } from "@/lib/tienda-web/cuentaTipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/cuenta — solicitud de cuenta de distribuidor desde la tienda web (cuenta.html).
 *
 * PÚBLICO (sin sesión): guarda la solicitud y avisa por n8n a ventas de la sede elegida
 * (lib/tienda-web/cuenta.ts). No devuelve nada de lo guardado. Frenos: límite por IP, captcha de
 * Turnstile si está configurado, un campo trampa que una persona no ve y un tiempo mínimo de llenado.
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-web-cuenta", [
    { max: 5, ventanaSegundos: 600 },
    { max: 20, ventanaSegundos: 86400 },
  ]);
  if (bloqueo) return conCors(bloqueo);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return jsonTienda({ error: "Solicitud inválida" }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object") return jsonTienda({ error: "Solicitud inválida" }, { status: 400 });

  // Trampa para robots: un campo oculto que una persona deja vacío, y nadie llena el formulario en 3 s.
  // Al robot se le responde como si hubiera salido bien, para que no aprenda a esquivarlo.
  const llenadoMs = Number(cuerpo.llenadoMs);
  if (String(cuerpo.sitioWeb || "").trim() || !(llenadoMs >= 3000)) return jsonTienda({ ok: true });

  const ip = obtenerIp(request);
  const captcha = await verificarCaptcha(typeof cuerpo.captcha === "string" ? cuerpo.captcha : undefined, ip);
  if (!captcha.ok) return jsonTienda({ error: "Confirma que no eres un robot", campo: "captcha" }, { status: 400 });

  const v = validarSolicitud(cuerpo);
  if (!v.ok) return jsonTienda({ error: v.error, campo: v.campo }, { status: 400 });

  try {
    await registrarSolicitud(v.datos, { pagina: String(cuerpo.pagina || ""), ip });
    return jsonTienda({ ok: true });
  } catch (e) {
    console.error("[tienda-web/cuenta]", e);
    return jsonTienda({ error: "No pudimos guardar tu solicitud. Intenta de nuevo en unos minutos." }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
