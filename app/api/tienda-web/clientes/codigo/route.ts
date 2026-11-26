import { aplicarLimites, obtenerIp } from "@/lib/servicio-tecnico/limites";
import { verificarCaptcha } from "@/lib/servicio-tecnico/captcha";
import { pedirCodigo } from "@/lib/tienda-web/clientes/cuentas";
import { cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { normalizarCorreo } from "@/lib/tienda-web/clientes/tipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/codigo {correo} — «Mi cuenta» de la tienda web: manda un código para crear
 * o recuperar el acceso, solo si el correo está en la ficha de un cliente en Odoo. PÚBLICO: responde lo
 * mismo sea o no cliente (no se puede usar para averiguar quién compra con nosotros).
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-codigo", [
    { max: 5, ventanaSegundos: 600 },
    { max: 30, ventanaSegundos: 86400 },
  ]);
  if (bloqueo) return conCors(bloqueo);
  const c = await cuerpoJson(request);
  const correo = normalizarCorreo(c?.correo);
  if (!correo) return jsonTienda({ error: "Escribe un correo válido", campo: "correo" }, { status: 400 });
  const ip = obtenerIp(request);
  const captcha = await verificarCaptcha(typeof c?.captcha === "string" ? c.captcha : undefined, ip);
  if (!captcha.ok) return jsonTienda({ error: "Confirma que no eres un robot", campo: "captcha" }, { status: 400 });
  try {
    const r = await pedirCodigo(correo, ip);
    if (r !== "enviado") console.info(`[tienda-web/clientes] código no enviado (${r})`);
    return jsonTienda({ ok: true });
  } catch (e) {
    console.error("[tienda-web/clientes] código:", e);
    return jsonTienda({ error: "No pudimos enviar el código. Intenta de nuevo en unos minutos." }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
