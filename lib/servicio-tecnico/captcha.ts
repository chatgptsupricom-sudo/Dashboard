/**
 * Verificación de captcha para el envío de reportes (issue #25).
 *
 * Está pensado para Cloudflare Turnstile, que es gratis y no le pone al
 * cliente el juego de las fotos.
 *
 * Mientras TURNSTILE_SECRET_KEY no esté configurada, esto NO bloquea nada:
 * devuelve `activo: false` y deja pasar. Así el código queda listo y el
 * portal sigue funcionando hasta que alguien cree el sitio en Cloudflare y
 * agregue las dos variables:
 *
 *   TURNSTILE_SECRET_KEY            (servidor, secreta)
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (cliente, pública, la usa el widget)
 *
 * OJO: el captcha por sí solo no reemplaza al límite por IP, ni al revés. El
 * límite frena el goteo automatizado desde una misma dirección; el captcha
 * frena al que rota IPs con un proxy. Hacen falta los dos.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface ResultadoCaptcha {
  ok: boolean;
  /** false cuando no hay clave configurada: el captcha no está exigiéndose. */
  activo: boolean;
}

export async function verificarCaptcha(
  token: string | undefined,
  ip: string,
): Promise<ResultadoCaptcha> {
  const secreto = process.env.TURNSTILE_SECRET_KEY;
  if (!secreto) return { ok: true, activo: false };

  if (!token) return { ok: false, activo: true };

  try {
    const cuerpo = new URLSearchParams();
    cuerpo.set("secret", secreto);
    cuerpo.set("response", token);
    if (ip && ip !== "desconocida") cuerpo.set("remoteip", ip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    const datos = (await res.json()) as { success?: boolean };
    return { ok: datos.success === true, activo: true };
  } catch (e: any) {
    // Si Cloudflare no responde, no dejamos al cliente sin poder reportar por
    // un problema nuestro. Se registra y se deja pasar: el límite por IP sigue
    // en pie, que es la defensa que no depende de terceros.
    console.error("[captcha] verificación falló, se deja pasar:", e?.message);
    return { ok: true, activo: true };
  }
}
