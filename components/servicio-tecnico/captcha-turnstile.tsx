"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Widget de Cloudflare Turnstile para el envío del reporte (issue #25).
 *
 * Mientras NEXT_PUBLIC_TURNSTILE_SITE_KEY no esté configurada esto no pinta
 * nada y avisa al padre con `onDisponible(false)`, para que el formulario no
 * exija un token que nadie puede producir. Así el portal sigue funcionando
 * hasta que alguien cree el sitio en Cloudflare.
 *
 * La verificación de verdad ocurre en el servidor (lib/servicio-tecnico/
 * captcha.ts). Este widget solo consigue el token: confiar en el widget sería
 * como poner el candado por dentro.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opciones: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    onTurnstileListo?: () => void;
  }
}

const SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileListo&render=explicit";

export function CaptchaTurnstile({
  siteKey: siteKeyProp,
  onToken,
  onDisponible,
  locale,
}: {
  siteKey?: string;
  onToken: (token: string) => void;
  onDisponible: (disponible: boolean) => void;
  locale: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const idWidget = useRef<string | null>(null);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  // La prop manda: llega del servidor en ejecución. La variable incrustada
  // queda de respaldo por si algún día se renderiza sin pasarla.
  const siteKey = siteKeyProp || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) {
      onDisponible(false);
      return;
    }
    onDisponible(true);

    const pintar = () => {
      if (!contenedor.current || !window.turnstile || idWidget.current) return;
      idWidget.current = window.turnstile.render(contenedor.current, {
        sitekey: siteKey,
        language: locale === "en" ? "en" : "es",
        callback: (token: string) => onToken(token),
        // Si el token vence o falla, se limpia: el formulario vuelve a exigirlo
        // en vez de mandar uno que el servidor va a rechazar.
        "expired-callback": () => onToken(""),
        // Se guarda el código y se muestra. Antes se descartaba en silencio: el
        // cliente veía un recuadro que no funcionaba y no había forma de saber
        // por qué. Turnstile devuelve códigos concretos —110200 es dominio no
        // autorizado, 110100 clave inválida— y sin ellos esto es adivinar.
        "error-callback": (codigo: string) => {
          console.error("[turnstile] error", codigo);
          setErrorCodigo(String(codigo || "desconocido"));
          onToken("");
          return true;
        },
      });
    };

    if (window.turnstile) {
      pintar();
    } else if (!document.querySelector(`script[src="${SRC}"]`)) {
      window.onTurnstileListo = pintar;
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    } else {
      window.onTurnstileListo = pintar;
    }

    return () => {
      if (idWidget.current && window.turnstile) {
        try {
          window.turnstile.remove(idWidget.current);
        } catch {}
        idWidget.current = null;
      }
    };
  }, [siteKey, locale, onToken, onDisponible]);

  if (!siteKey) return null;
  return (
    <div className="mt-4">
      <div ref={contenedor} />
      {errorCodigo && (
        <p className="mt-1.5 text-sm text-[#b42318]">
          No pudimos cargar la verificación (código {errorCodigo}). Escríbenos y
          te ayudamos a registrar tu reporte.
        </p>
      )}
    </div>
  );
}
